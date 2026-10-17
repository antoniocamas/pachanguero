# Reading Revolut Bizum payments with the Enable Banking API

Goal: automatically read the Bizum payments received in a personal Revolut account, using Enable Banking (Revolut does not offer its API to individuals).

Enable Banking can do this for your own Revolut account. It will not push Bizums to you, though, so your script has to poll for them.

---

## How it works

1. In the Control Panel (https://enablebanking.com/cp/applications), register an application in **Production** (not Sandbox).
2. Click **"Activate by linking accounts"** and authorize your Revolut account. This puts the app in *restricted mode*, which is meant for individual non-commercial use. The app can then only read the accounts you linked.
3. Linking does not create API access. You still have to authorize through the API as well, even with the same account (steps 5-6).
4. Authenticate every API call with a JWT. Sign it with RS256 using the `.pem` file downloaded at registration.
   - Header: `typ: JWT`, `alg: RS256`, `kid` = your application ID.
   - Claims: `iss: enablebanking.com`, `aud: api.enablebanking.com`, `iat`, `exp`. The `exp` can be at most 24 hours after `iat`.
   - Send it as `Authorization: Bearer <jwt>`.
5. Call `POST /auth` with:
   - `access.valid_until` (RFC3339 date-time, max = now + `maximum_consent_validity`, usually 180 days)
   - `aspsp` (`name` and `country`, taken from `GET /aspsps`)
   - `redirect_url` (must be whitelisted in your app)
   - `state` (any unique string)
   - `psu_type: "personal"`

   It returns a `url`.
6. Open that URL and approve in the Revolut app. You get redirected to your `redirect_url` with `?code=...`. Send that code to `POST /sessions`. Keep the `session_id` and each account's `uid`.
7. Read transactions with `GET /accounts/{uid}/transactions?date_from=YYYY-MM-DD`. Keep repeating the call with `continuation_key` until it comes back empty. An empty page that still carries a key means "keep going".

Base URL: `https://api.enablebanking.com`

---

## Python skeleton (JWT + calls)

```python
import jwt as pyjwt, requests
from datetime import datetime, timezone, timedelta

APP_ID = "your-app-id"
KEY = open(f"{APP_ID}.pem", "rb").read()

def headers():
    iat = int(datetime.now().timestamp())
    token = pyjwt.encode(
        {"iss": "enablebanking.com", "aud": "api.enablebanking.com",
         "iat": iat, "exp": iat + 3600},
        KEY, algorithm="RS256", headers={"kid": APP_ID})
    return {"Authorization": f"Bearer {token}"}

B = "https://api.enablebanking.com"

# 1) find Revolut (try country=ES and country=LT)
print([a for a in requests.get(f"{B}/aspsps", params={"country": "ES"}, headers=headers()).json()["aspsps"] if "Revolut" in a["name"]])

# 2) start authorization
r = requests.post(f"{B}/auth", headers=headers(), json={
    "access": {"valid_until": (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()},
    "aspsp": {"name": "Revolut", "country": "ES"},   # confirm with GET /aspsps
    "state": "any-unique-string",
    "redirect_url": "https://YOUR-WHITELISTED-URL",
    "psu_type": "personal"})
print(r.json()["url"])      # open this, approve in the Revolut app

# 3) after redirect, take ?code=... and create the session
session = requests.post(f"{B}/sessions", headers=headers(), json={"code": "CODE_FROM_URL"}).json()
uid = session["accounts"][0]["uid"]

# 4) fetch transactions (loop on continuation_key)
params, txs = {"date_from": "2026-10-01"}, []
while True:
    d = requests.get(f"{B}/accounts/{uid}/transactions", params=params, headers=headers()).json()
    txs += d["transactions"]
    if not d.get("continuation_key"):
        break
    params["continuation_key"] = d["continuation_key"]
```

This skeleton is untested against your account. Check field names against the API reference.

---

## What matters for the Bizum goal

- **No webhook for transactions.** The only webhook is for payment status, so you need a scheduled script that polls.
- **Rate limit.** Many banks allow only about 4 background fetches per day when no PSU headers are sent. On a 429 (`ASPSP_RATE_LIMIT_EXCEEDED`), wait roughly 6 hours. Polling every few minutes will not work.
- **Deduplication.** Use `entry_reference` to dedupe, not `transaction_id`, which can change between fetches. Skip `status: "PDNG"` (pending) transactions.
- **Bizum detection.** Incoming money has `credit_debit_indicator: "CRDT"`. The sender should show up in `debtor.name` or `remittance_information`. It is unverified how Revolut labels Bizum transfers, so inspect a real one first and match on that.
- **Consent expiry.** Sessions last at most `maximum_consent_validity`, usually 180 days. After that you redo steps 5-6. Session and account IDs change on each re-authorization, so match accounts by `identification_hash`. Handle the `EXPIRED_SESSION` error (401), since sessions can expire early.
- **Restricted app gotcha.** If you get an empty account list after authorizing, the account was not linked to the app. Link all the accounts you intend to use.
- **History depth.** Many banks give full history only for a short window after authorization, then limit it to the last 90 days. Use `strategy=longest` on the first fetch and the default strategy for incremental polling.

## Revolut specifics

- Redirect flow. SCA happens in the Revolut mobile app (automatic app switch when authorizing on the phone with the app installed), or via PIN + app approval + SMS code otherwise.
- Credit card accounts only appear in the in-app consent flow, not the web one.
- Revolut for Spanish customers is Revolut Bank UAB (Lithuania) with a Spanish branch. It is unconfirmed whether it is listed under country `ES` or `LT`, so check `GET /aspsps?country=ES` and `?country=LT`.

---

## Open questions to verify yourself

- Exact `aspsp.name` / `country` for Revolut in `GET /aspsps`.
- How Bizum transactions appear in the payload (fields and wording).
- Whether a local address (e.g. localhost) is accepted as `redirect_url`.

---

## Links

- Docs home: https://enablebanking.com/docs/
- Quick start: https://enablebanking.com/docs/api/quick-start/
- API reference: https://enablebanking.com/docs/api/reference/
- Linking own accounts (restricted production): https://enablebanking.com/docs/api/linked-accounts/
- FAQ: https://enablebanking.com/docs/faq/
- Webhooks: https://enablebanking.com/docs/api/webhooks/
- Lithuania market page (Revolut notes): https://enablebanking.com/docs/markets/lt/
- Spain market page: https://enablebanking.com/docs/markets/es/
- Control Panel (apps): https://enablebanking.com/cp/applications
- Code samples: https://github.com/enablebanking/enablebanking-api-samples
- Revolut + Bizum announcement: https://www.revolut.com/es-ES/news/revolut_integrates_with_bizum_to_establish_itself_as_the_primary_account_for_spaniards/

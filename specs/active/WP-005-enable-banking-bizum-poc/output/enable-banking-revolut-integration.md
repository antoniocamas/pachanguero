# Reading a personal Revolut account (and its Bizums) with Enable Banking

A guide for integrating any application with a **personal Revolut account in Spain** through the Enable Banking API, written from a working proof of concept run against a real account in October 2026. Every claim carries a tag: **[PoC]** observed against the real account, **[docs]** stated by Enable Banking's documentation and not contradicted, **[not determined]** neither. Examples are anonymised.

## 1. What it can and cannot do

| | |
| --- | --- |
| Read the account's transactions, including incoming Bizums with the sender | Yes **[PoC]** |
| Use it for an individual, non-commercial purpose without a commercial agreement | Yes, in *restricted production mode* **[docs]** and **[PoC]** |
| Be told when a payment arrives | No: there is no transaction webhook, only a payment-status one **[docs]**; the application must poll |
| Poll as often as you like | Not determined (see 8) |
| Skip the periodic renewal | No: consent ends after at most 180 days **[docs]** and must be renewed by the account owner approving in the Revolut app **[PoC]** |

## 2. Setup (once)

The field-by-field registration guide, the Mock ASPSP and how to test are in `enable-banking-control-panel-and-testing.md`; this section is the short version.

1. **Register an application** in the Control Panel (`enablebanking.com/cp/applications`) choosing **Production**. The form requires: application name, allowed redirect URLs, description, an email for data-protection matters, a privacy URL and a terms URL **[PoC]**; placeholder URLs (`https://example.com/privacy`) were accepted **[PoC]**. The environment choice is the first thing on the form; Sandbox is the default.
2. **Keys.** Either let the browser generate and export the private key, or generate it yourself and paste only the public certificate **[PoC]**. The second keeps the private key off the browser and was used here:
   ```bash
   openssl req -x509 -newkey rsa:4096 -nodes -keyout private.key -out public.crt -subj "/CN=my-app" -days 730
   ```
   Paste `public.crt` (PEM) into the form. The private key never leaves your machine.
3. **Activate the application by linking accounts.** A new Production application is *Inactive* until you press "Activate by linking accounts" and approve the Revolut account; it then becomes *Active* in restricted mode and can read **only the linked accounts** **[docs]**. Linking does not itself authorise your application: the API authorisation of section 4 is still needed **[docs]**.
4. **Keep the secrets out of version control**: the private key, tokens, sessions and any raw data.

Redirect URL: `https://example.com/callback` was accepted and works **[PoC]**. Whether `http://localhost:<port>/...` is accepted **[not determined]**. Nothing needs to listen at the redirect URL, see 4.

## 3. Authenticating each call

Every request carries `Authorization: Bearer <JWT>`, signed RS256 with the private key **[docs]**, **[PoC]**:

| Part | Value |
| --- | --- |
| Header | `typ: JWT`, `alg: RS256`, `kid:` the application id |
| Claims | `iss: enablebanking.com`, `aud: api.enablebanking.com`, `iat`, `exp = iat + 3600` |

A fresh token per call is simplest. The base URL is `https://api.enablebanking.com`. Python with `pyjwt` and `requests` was enough **[PoC]**.

## 4. The authorisation flow

1. `GET /aspsps?country=ES` lists banks. Revolut is listed as `name: "Revolut"` under **both `ES` and `LT`**, with `maximum_consent_validity` 180 days, `psu_types` personal and business, and `required_psu_headers` empty **[PoC]**. The Spanish account worked using `ES` **[PoC]**.
2. `POST /auth` with `access.valid_until` (RFC 3339, at most 180 days ahead; 179 used), `aspsp` (`name`, `country`), a unique `state`, the whitelisted `redirect_url`, and `psu_type: "personal"`. It returns a `url` **[PoC]**.
3. The account owner opens the `url` in a **desktop browser**, accepts Enable Banking's terms, signs in to Revolut and approves in the Revolut app **[PoC]**. Starting on the same device as the Revolut app avoids moving between devices **[docs]**.
4. The browser is redirected to the `redirect_url` with `?state=...&code=...`. **The page itself does not have to load**: with a placeholder URL the address bar still holds the `code`, and that is all that is needed **[PoC]**. The `code` is short-lived (`EXPIRED_AUTHORIZATION_CODE` exists) **[docs]**, so exchange it at once. Check that `state` equals the one you sent.
5. `POST /sessions` with `{"code": ...}` returns a `session_id` and the `accounts` **[PoC]**. Keep both. `GET /sessions/{id}` returns `status` (`AUTHORIZED`) and `valid_until` **[PoC]**.

### The accounts you get back

Authorising a Revolut login exposes **every account that login can see**. Here that was four accounts: three pockets of the owner (EUR, USD, GBP) and a fourth EUR account in the name of a different person **[PoC]**. `GET /accounts/{uid}/details` gives `currency`, `cash_account_type`, `usage` and the holder's name. **Select the accounts you need by currency and holder, and never read or store the others.** Each account has a `uid` (valid only inside that session) and an `identification_hash` (stable, see 7) **[PoC]**.

## 4b. Required PSU headers

Revolut lists none, so requests need no `Psu-*` headers **[PoC]**. For banks that list some, send all or none; sending a partial set returns `PSU_HEADER_NOT_PROVIDED` **[docs]**.

## 5. Reading transactions

`GET /accounts/{uid}/transactions?date_from=YYYY-MM-DD[&strategy=longest][&continuation_key=...]`.

- Follow `continuation_key` until it is absent **[PoC]**. 979 transactions came in 20 pages; no empty page carrying a key was seen **[PoC]**.
- **De-duplicate** on (`identification_hash` of the account, `entry_reference`) **[docs]**, **[PoC]**: every transaction had a unique `entry_reference`, and a repeated fetch, also through a *new session*, added nothing. Do **not** use `transaction_id`, which may change between fetches **[docs]**. `entry_reference` is not unique across accounts, hence the pair **[docs]**.
- Skip `status: "PDNG"` (pending) when matching **[docs]**; a pending item gets an `entry_reference` only if the bank keeps it when booking **[docs]**. No pending transaction appeared in the data **[PoC]**, so Revolut's behaviour for pending Bizums is **[not determined]**.
- `strategy=longest` on the first fetch, default afterwards **[docs]**. The earliest date returned equalled the requested `date_from` (13 months back) right after authorisation **[PoC]**. Whether history is cut to about 90 days later **[not determined]**.
- All amounts are strings (`"4.00"`) with a `currency`; compare them as decimals, not floats **[PoC]**.

## 6. Recognising an incoming Bizum

Revolut gives a Bizum no structured marker. In 412 real Bizum credits **[PoC]**:

- `debtor`, `creditor`, `debtor_account`, `debtor_agent`, `note`, `reference_number` and `merchant_category_code` are **all null**.
- `bank_transaction_code.code` is `TOPUP`, but 59 *non-Bizum* credits (for example "Dinero de ..." top-ups) also use it, so it cannot identify a Bizum on its own.
- `remittance_information` is a list of exactly two strings: the **message the sender typed**, then the fixed text **`Bizum payment from: <sender>`**.

**Rule used** (it matched exactly the 412 found by reading the data): the transaction is a Bizum when `credit_debit_indicator = "CRDT"`, `status = "BOOK"`, and `remittance_information` has two elements, the last starting `Bizum payment from: `.

Anonymised example:

```json
{
  "entry_reference": "<opaque id>",
  "status": "BOOK",
  "credit_debit_indicator": "CRDT",
  "transaction_amount": {"amount": "4.00", "currency": "EUR"},
  "booking_date": "2026-01-15", "value_date": "2026-01-15",
  "bank_transaction_code": {"code": "TOPUP", "description": null, "sub_code": null},
  "debtor": {"name": null, "...": null},
  "remittance_information": ["<message typed by the sender>", "Bizum payment from: <Name> S.S."]
}
```

**The sender** is the text after the prefix **[PoC]**:

- 392 of 412 Bizums: a name shortened to **first name plus surname initials** (`Name S.S.`), 43 distinct senders.
- 20 of 412 (5%): a **phone number** (`+` country code and digits), each from a different one-off sender. Why a number appears instead of a name is **[not determined]**; plausibly the sender is unknown to the account owner.
- So the **phone number is not a reliable identifier**; the name is, and it is abbreviated.

Outgoing Bizums (`DBIT`) exist too (34 in 13 months) and must be excluded by the indicator **[PoC]**. `booking_date` equals `value_date` for all Bizums, and dates carry no time of day **[PoC]**.

## 7. Consent, sessions and re-authorisation

- Consent lasts until `valid_until`, at most 180 days; no refresh exists, so the owner must approve again **[docs]**, **[PoC]**.
- Authorising a second time **while the first session is still valid** works: both sessions are `AUTHORIZED` until one is closed. The new session has a **new `session_id` and new `uid` for every account**, but the **same `identification_hash`** per account **[PoC]**. Store accounts and transactions by `identification_hash` and the history continues across renewals with no duplicates **[PoC]**.
- `DELETE /sessions/{id}` closes a session; afterwards `GET /sessions/{id}` shows `CLOSED` and calls with its account `uid`s return **HTTP 401 with error code `CLOSED_SESSION`** **[PoC]**.
- Sessions may also end early: `EXPIRED_SESSION`, `REVOKED_SESSION` **[docs]**. Decide on the **error code, not the status code**; 401 has other meanings **[docs]**. On any of these, start a new authorisation. Natural expiry and early expiry by Revolut **[not determined]** (180 days away).
- Ask the owner to renew *before* expiry; warn them days ahead **[docs]**.

## 8. Limits

- Documentation: many banks allow about **4 data fetches a day** when the user is not present (no PSU headers); on `429` with `ASPSP_RATE_LIMIT_EXCEEDED` wait about **6 hours** **[docs]**.
- Observed: **at least 60 transaction calls** (three full fetches of 20 pages each, in one afternoon, the third through a new session) plus the account-details and session calls in between, with no 429 **[PoC]**. So Revolut's background limit, if any, is well above 4 a day. **Placeholder:** the actual limit and the recovery time are **[not determined]**; they will be measured with the limit probe and this section updated.
- Design for rare polling anyway: a Bizum payment does not need minute-level latency, and the limit is the bank's, outside your control.

## 9. Errors worth handling

| Code (HTTP) | Meaning | Action |
| --- | --- | --- |
| `ASPSP_RATE_LIMIT_EXCEEDED` (429) | bank's rate limit | stop; retry after hours |
| `CLOSED_SESSION` (401) **[PoC]** | session closed | re-authorise |
| `EXPIRED_SESSION`, `REVOKED_SESSION` **[docs]** | consent ended | re-authorise |
| `EXPIRED_AUTHORIZATION_CODE`, `WRONG_AUTHORIZATION_CODE` **[docs]** | redirect `code` late or wrong | restart the authorisation |
| `PSU_HEADER_NOT_PROVIDED` (422) **[docs]** | partial `Psu-*` headers | send all or none |
| `WRONG_TRANSACTIONS_PERIOD` **[docs]** | period unavailable with the default strategy | use `strategy=longest` |
| `REDIRECT_URI_NOT_ALLOWED` **[docs]** | URL not whitelisted | fix the registration |

## 10. Guidelines

1. Keep key, tokens, sessions and raw payloads outside version control; transaction data names other people.
2. Read only the accounts you need; the authorisation exposes more.
3. Key everything by `identification_hash` and `entry_reference`.
4. Treat a Bizum sender as an abbreviated name or an occasional phone number, never as a verified identity.
5. Make renewal a first-class operation: store the session's `valid_until`, expect `CLOSED/EXPIRED/REVOKED_SESSION`, and keep the old session until the new one works.
6. Verify any rule against real data before trusting it; this guide's Bizum rule rests on one account and about 13 months.

## 11. Not determined

`localhost` as a redirect URL; the real rate limit and recovery time; history depth after an hour or a day; natural and early expiry; pending Bizums; why some senders appear as numbers.

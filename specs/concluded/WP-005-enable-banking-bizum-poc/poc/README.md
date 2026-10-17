# Enable Banking PoC — how to run

Throwaway script `ebpoc.py` (Python 3, needs `pyjwt` and `requests`, both already installed). State lives in `poc/local/` (git-ignored: key, config, session, raw data). Nothing here writes to the Pachanguero database.

```bash
python3 poc/ebpoc.py selfcheck          # synthetic checks, no network
python3 poc/ebpoc.py aspsps ES          # Revolut in a country (also LT)
python3 poc/ebpoc.py auth [--days N | --minutes M]    # start an authorisation, prints the consent URL
python3 poc/ebpoc.py session '<url>'    # the address you were redirected to
python3 poc/ebpoc.py status [--previous] | close [--previous]
python3 poc/ebpoc.py accounts           # currency/type of each account in the session
python3 poc/ebpoc.py fetch --from YYYY-MM-DD [--strategy longest] [--account <uid>]
python3 poc/ebpoc.py recognise [--show] [--out]   # the incoming Bizums in the stored data
python3 poc/ebpoc.py limits [--max N] [--sleep S] [--days D]   # probe the rate limit, logs to local/reports/limits.jsonl
python3 poc/ebpoc.py depth [--from YYYY-MM-DD]                  # earliest date available now, logs to local/reports/depth.jsonl
python3 poc/ebpoc.py match --db data/pachanguero.db [--show]   # sender -> player report, DB opened read-only
```

Synthetic Bizum fixture for the Enable Banking Mock ASPSP: `poc/fixtures/mock-aspsp-bizum.json`; `EBPOC_LOCAL=<folder>` points the script at another set of key/config/data files (for a sandbox application). See `output/enable-banking-control-panel-and-testing.md`.

`poc/local/config.json`: `{app_id, key_path, redirect_url, aspsp:{name,country}}`. The key pair is made with `openssl req -x509 -newkey rsa:4096 -nodes ...` and only the public certificate is pasted in the Control Panel ("Generate outside the browser").

## Running the limit probe (task 03; not yet run on the real account)

`limits` repeats one small fetch (the last 7 days, one call) and logs every attempt; it stops at the first `ASPSP_RATE_LIMIT_EXCEEDED` and never retries by itself. `depth` reads the whole history with `strategy=longest` (nothing stored) and logs the earliest date. Both append to `poc/local/reports/`. Suggested order:

1. **Fresh authorisation** (`auth`, `session`; sessions coexist, so nothing is lost). Then at once `depth` (history "right after authorisation").
2. `limits --max 150` (a call takes about 1.5 s). It stops early if a 429 comes. Do **not** run `fetch` or anything else against Revolut during this.
3. If a 429 came: run `limits --max 1` after 1 h, 3 h, 6 h and the next morning; each attempt is logged with its time, so the log shows when it recovered.
4. `depth` again after 1 hour and after 1 day (history later).
5. Copy the numbers (no real data is in these logs) into section 8 of `output/enable-banking-revolut-integration.md` and mark task 03 done.

If no 429 appears in 150 calls, raise `--max`, or add `--sleep 0` runs spread over the day, and record "no limit hit in N calls".

## Findings (anonymised)

### Registration (Control Panel)
- Production application registered with key generated outside the browser. The form requires: name, redirect URLs, description, data-protection email, privacy URL, terms URL (the last three are mandatory even for a personal app; placeholders `https://example.com/...` were accepted).
- A `https://example.com/callback` redirect URL was accepted. The application starts `Inactive`, then becomes active after "Activate by linking accounts" (linking the Revolut account).

### `aspsps` (E-02)
- Revolut is listed under **both** `ES` and `LT`, name `Revolut`, `psu_types` personal and business, `maximum_consent_validity` 180 days, `required_psu_headers` none.

### `auth` and `session` (UC-005-01)
- `auth` returns a consent URL on `tilisy.enablebanking.com`; the page names the application and says the account list, balances and transactions will be shared. After approval in Revolut the browser lands on the redirect URL with `?state=...&code=...`; the page itself does not need to load. Pasting that address into `session` works. The code is a UUID.
- The session came back with **4 accounts** (not one). Their `identification_hash` values start with a base64 prefix that describes which identifying fields were hashed. Which account is the main EUR one is for task 02 to establish.
- `status` after creation: `AUTHORIZED`, `valid_until` = the requested date (179 days).

### `accounts` and `fetch` (UC-005-02, E-08)
- Authorising Revolut exposes **every account the Revolut login can see**: three pockets of the owner (EUR, USD, GBP) and one more EUR account belonging to a different person. The PoC fetches only the owner's main EUR account and never stores another person's data.
- `fetch --from 2025-09-01 --strategy longest` on the main EUR account: 979 transactions in 20 pages, all `BOOK` (476 `CRDT`, 503 `DBIT`), all with an `entry_reference`, none `PDNG`, no empty page carrying a key, no 429 across the 20 calls of the first run and 20 of the second (background, no PSU headers).
- Second identical fetch: 0 new, 979 known: dedup by (`identification_hash`, `entry_reference`) works.
- Every transaction carries all the schema's fields as keys (values may be null; the Bizum marker is for the next task to establish).
- The earliest date returned equals the `date_from` asked, so the history depth right after authorisation is at least 13 months here (not yet tested further back).

### The Bizum marker (E-05, UC-005-04)
- 412 of the 476 credits are Bizums. All have `remittance_information` with two elements: the sender's free-text message, then `Bizum payment from: <sender>`. `debtor`/`creditor`/accounts are null; `bank_transaction_code` is `TOPUP` (shared with non-Bizum top-ups). The rule and its evidence are in `iterations/1/DESIGN_PLAN.md`.
- Sender: 392 of 412 show a name as first name plus surname initials (43 distinct senders); 20 show a phone number (`+` country code and digits), each a one-off sender. So phone numbers exist for about 5% of Bizums only.

### Matching senders to players (UC-005-05, E-11)
Against `data/pachanguero.db` (43 players, 5 aliases), opened read-only (the main file's modification time was unchanged). Players are mostly stored as a first name only (27) or first name plus surname (13); senders arrive as first name plus surname initials, so `NameMatcher`'s exact rule alone almost never fits. The report therefore has two tiers beyond the exact one: *abbreviated* (given name equal, sender's initials a prefix of the player's surname initials) and *first name only* (the player is stored by first name).

| Result (63 distinct senders, 412 Bizums) | senders | Bizums |
| --- | --- | --- |
| matched, abbreviated tier | 5 | 40 |
| matched, first-name tier | 7 | 117 |
| unresolved: sender is a phone number | 20 | 20 |
| unresolved: name matches no player | 31 | 235 |

No sender was `ambiguous` at this size, and none matched by the exact tier.

Why the 31 are unresolved (counts only): for 28 of them (199 Bizums, 48%) the given name equals **no** player's first name; for 3 it does but the initials disagree. So nearly half of the Bizums come from people whose displayed name is not any player's stored name: another person paying for the player (a partner, a relative), a nickname, or a player not in the database. The data cannot say which (`unknown`); it is a question for the organiser. A mapping from sender string to player, kept once the organiser confirms it, would cover all later Bizums: 63 distinct senders explain all 412 payments in 13 months.

### Re-authorisation (UC-005-07, E-07)
- A second `auth` + `session` while the first session was still valid worked. Revolut asked for the approval flow again (done by the organiser in the browser). The first session **stayed `AUTHORIZED`** until closed explicitly: sessions coexist, they do not replace each other.
- The new session has a new `session_id` and **new account `uid`s for all 4 accounts**; the **`identification_hash` of each account was identical**. A fetch of the main EUR account with the new `uid` returned the same 979 transactions as already stored: 0 new, 979 known. So storing by (`identification_hash`, `entry_reference`) survives re-authorisation with no duplicates (UC-005-07-S3).
- The new session's `valid_until` is the newly requested date (179 days from the second authorisation), not an extension of the first.
- `DELETE /sessions/{id}` returns `{"message": "OK"}`; `GET /sessions/{id}` then reports `status` `CLOSED` (HTTP 200), and a transactions call with an account `uid` of the closed session returns **HTTP 401, error code `CLOSED_SESSION`**. A script that must re-authorise should therefore key on the error code (`CLOSED_SESSION`, `EXPIRED_SESSION`, `REVOKED_SESSION`), as the FAQ says.
- Not tested: natural expiry at `valid_until` (180 days away), early expiry by Revolut, and starting the new authorisation before the old expires only by a few minutes (it was, in effect, a renewal in the same hour).

### Sandbox (Mock ASPSP) run
With a Sandbox application and the synthetic fixture uploaded to the Mock ASPSP: authorisation, `fetch` (21 fetched, 20 stored, 1 pending skipped), `recognise` (18 Bizums), dedup (0 new on repeat) and `close` then `fetch` (401 `CLOSED_SESSION`) all work. The Mock returned one page (docs say batches of 10). Details in `output/enable-banking-control-panel-and-testing.md`.

### Open here
- E-04 (is a `localhost` redirect URL accepted): accepted by a Sandbox application, see "Redirect URLs and fidelity of the Mock" below; not tried on the production application.

## Sandbox experiments (iteration 2)

### Scripted consent (task 08, UC-005-10), first run 2026-10-17
`poc/sandbox_consent.mjs <consent-url>` (Node, Playwright and Chromium from the repository's `e2e` workspace, headless) opens the consent URL from `auth` and walks the steps, printing each navigation with `code` and `state` masked. It never tries to pass a protection: it reports it and stops.

- The consent page on `tilisy-sandbox.enablebanking.com` loads headless. Its text and buttons are in Spanish here (*Continuar autenticación*, *Cancelar*). No reCAPTCHA, hCaptcha, Turnstile or one-time-code element was present `[PoC]`.
- *Continuar autenticación* is accepted by the script and the browser is sent to **`https://enablebanking.com/cp/mock-aspsp/auth?...`**, the Mock ASPSP's own authorisation page, which **redirects to `https://enablebanking.com/sign-in?next=...`**: the account-ticking step needs the organiser to be **signed in to their Enable Banking account** `[PoC]`. The run stopped there; no credentials were entered by the script (the organiser's own sign-in is not something a test script may do for them).
- Verdict so far: the consent page itself is not the obstacle; the Mock bank page is behind the Control Panel login. Whether a login saved once by hand (a stored browser state) lets a script pass, and whether the sign-in has its own bot check or MFA, is **not determined** yet.

- Second run, in the built-in browser with the organiser signing in by hand `[PoC]`: after the sign-in the Mock bank page lists the account the organiser uploaded earlier (*Cuenta de Prueba*, EUR, the fixture's account), unticked; ticking it and pressing *Authorize* redirects through `tilisy-sandbox.enablebanking.com/ais/?state=...&code=...` to the registered redirect URL (`example.com`, unreachable here, which does not matter). The consent flow after the sign-in has no further protection step visible. The accounts listed belong to the **signed-in Control Panel user**: this is the first evidence that Mock data is per user (UC-005-11-S4), not global.
- Not determined: whether a stored sign-in (browser state saved once by hand) lets a headless script through, and whether the sign-in itself ever asks for MFA or a CAPTCHA (the organiser typed it; see the organiser's note below). The built-in browser cannot hand its login to the Node script.

- Saved-login attempts, 2026-10-17 `[PoC]`: three visible-Chromium sign-ins started by the script (`--login`) did not complete. The Enable Banking sign-in asks for a **CAPTCHA** in the scripted browser, plus an e-mail code and an SMS code (no password), and the organiser reports that the more often they sign in, the harder the CAPTCHA gets (about ten minutes of CAPTCHA at the last attempt). Nothing was bypassed; the attempts were stopped and no signed-in state was saved. It is a **cost** as well as a protection: every fresh sign-in is paid for by a person.
- Verdict, UC-005-10-S2 `[PoC]`: **hand only** for the account-ticking step of the Mock ASPSP. The consent page on `tilisy-sandbox` and the redirect are scriptable; the Mock bank page is behind the Control Panel sign-in (CAPTCHA, e-mail code, SMS code). UC-005-10-S1 (three unattended runs) and S3 (headless from a CI-like machine) are **not determined**: they need a signed-in state, and the organiser declined to repeat the sign-in. Whether a long-lived saved sign-in would let a script pass is `not determined`.

### Mock ASPSP data control (task 08, UC-005-11), 2026-10-17
- **Where the data is managed** `[PoC]`: the Control Panel page `enablebanking.com/cp/mock-aspsp` calls a web API under `https://enablebanking.com/api/v2/cp/mock-aspsp/accounts[/{id}/balances|/transactions]`: `GET` accounts, balances and transactions (`page_size=10`), `POST` to add a transaction (HTTP 201), `DELETE .../transactions/{id}` (HTTP 200). It authenticates with the **signed-in browser session**, not with the application's key: the same `GET .../accounts` with the sandbox application's JWT answers **401 `UNAUTHORIZED`**. So the data can be changed by script only through a signed-in browser (UC-005-10's cost), not by the application's key. The bank-facing API (`api.enablebanking.com`) has no Mock-data endpoint found.
- **Whose data** `[PoC]` (S4, partly): the accounts listed on the Mock bank page after sign-in are the ones uploaded under the organiser's Control Panel user. This points to per-user data. Not tested with a second user or a second application.
- **Appending after authorisation** `[PoC]` (S2): with the session authorised on 2026-10-12 (one account, 20 entries stored), one synthetic Bizum entry (`entry_reference` `SYN-NEW-0001`, booking date 2026-09-22) was added through the account page's *Add* form; `fetch --from 2026-08-01` on the **same session** read 22 entries: **1 new**, 20 known, 1 pending skipped. The entry was then deleted with the row's × and removed from the local store. So "a new Bizum arrives between two reads" is testable on the Mock, by hand or by a signed-in browser.
- **Removal / creation by script (S1)**: upload and the invisible reCAPTCHA were not retried; creation by API is **not determined**; only the signed-in page can do it.
- Verdict UC-005-11 `[PoC]`: **hand only** for the application key (no key-authenticated endpoint); a signed-in browser can do create, append and remove.

### Redirect URLs and fidelity of the Mock (task 09, UC-005-12 and UC-005-13), 2026-10-17
- **A `localhost` redirect URL is accepted** `[PoC]` (UC-005-12-S1; closes E-04): added to the Sandbox application's list in the Control Panel (*Application has been edited*) and accepted by `POST /auth`. A real consent with `http://localhost:8787/api/bank/callback` ended with the browser at that address carrying `state` and `code`, a listener on port 8787 received the request, and `session` created a session from them. Before it was registered, the same URL gave **HTTP 400 `REDIRECT_URI_NOT_ALLOWED`**; so registration and the call are two separate checks, and both are needed.
- **The match is exact** `[PoC]`: a different port (`:9999`), a different path or the same URL with a query string (`?x=1`) gave `REDIRECT_URI_NOT_ALLOWED`. The list is one URL per line and takes **several URLs**, `http://localhost` and `https` ones together (S3): four listed, each accepted by `POST /auth`, an unlisted one refused. So a test can choose the redirect URL per run, as long as the Control Panel list holds it. The list was restored to the single `https://example.com/callback` afterwards.
- **`entry_reference` is stable** `[PoC]` (UC-005-13-S1): the 20 stored entries were known again on a second fetch in the same session, and on a fetch in a **second session** (new account `uid`, **same `identification_hash`**): 21 fetched, 0 new, 20 known, as on the real account.
- **`date_from` filters on the Mock's side, inclusively, newest first** `[PoC]` (S2), on the 21-entry fixture:

  | date_from | entries returned | first | last |
  | --- | --- | --- | --- |
  | 2026-08-01 (before every entry) | 21 | 2026-09-21 | 2026-09-01 |
  | 2026-09-10 | 12 | 2026-09-21 | 2026-09-10 |
  | 2026-09-20 | 2 | 2026-09-21 | 2026-09-20 |
  | 2026-10-01 (after every entry) | 0 | | |

  The order is booking date descending in all four reads.
- **Shape** `[PoC]` (S3): compared field by field, without values, against the 412 real Bizums: the Mock returns the same 24 keys as the real bank, null-filled where the fixture gives none; the real Bizums differ from the fixture only in ten fields that are all `null` in them (`transaction_id`, `note`, `reference_number_schema`, `exchange_rate`, `creditor_agent`, `debtor_agent`, `creditor.contact_details`, `debtor.contact_details`, `creditor_account_additional_identification`, `debtor_account_additional_identification`), and in `remittance_information` (two elements in all 412 real Bizums; one fixture entry has one, on purpose, as a non-Bizum). The recognition-relevant fields match in presence, type and wording. A test-only catalogue entry mapping the Mock to the Revolut dialect would therefore be honest **for the fields the recognition uses**; it says nothing about Revolut's behaviour outside them (limits, expiry, approval).
- **Bank name and country** `[PoC]` (S4): `GET /aspsps` with a sandbox application lists the Mock for `ES` (with Banco de Sabadell, BBVA, Genome) and `DK`, none for `GB`. `POST /auth` with `Mock ASPSP` was accepted with country `ES`, `DK` and also `FI` (not listed there), and refused with `GB` (`WRONG_ASPSP_PROVIDED`). The country changes nothing the test sees except that refusal. Production's list holds 119 banks for `ES` and no Mock.
- **A mistake to note**: the first run of these experiments was started without `EBPOC_LOCAL`, so it ran against the **production** configuration: one bank listing per country, seven `POST /auth` attempts that all failed (nothing was authorised), and four read-only transaction fetches (several pages each) on the real session. Nothing was stored, `poc/local/` is unchanged (979 stored transactions), and no rate-limit answer came back. It counts only as a few extra calls before task 03's probe. Always `export EBPOC_LOCAL=poc/local-sandbox` first.

### Edge cases in the sandbox (task 10, UC-005-14), 2026-10-17
`auth --minutes M` asks for a consent of M minutes (sandbox use). Every situation below was tried against the Mock ASPSP; the Mock account was back to its 21 entries afterwards and the redirect URL list restored to `https://example.com/callback` (checked with `POST /auth`).

| Situation | Means tried | Result `[PoC]` |
| --- | --- | --- |
| expired session | `valid_until` 1, 3, 5 and 10 minutes ahead: all accepted by `POST /auth`; consent with 5 minutes, then a fetch after it ran out | **produced**: HTTP 401 `EXPIRED_SESSION` ("Session is expired") on the fetch; `GET /sessions/{id}` still said `AUTHORIZED` with the past `valid_until`, so a client must key on the error code, not on the status |
| session ended by the user | `DELETE /sessions/{id}` (iteration 1) | **produced**: HTTP 401 `CLOSED_SESSION`. A revocation from the bank side (`REVOKED_SESSION`): the Mock has no way to do it that was found, **not produced** |
| rate limit | not tried here | see the limits task; **not determined** until then |
| pending entry that becomes booked | an entry added as `PDNG` (not stored by `fetch`, counted as pending), deleted, then added as `BOOK` with the **same** `entry_reference` | **produced**: the next fetch stored it once (1 new), the one after found nothing new. The Mock treats the change as delete plus add; a bank that changes the status in place under the same reference would be seen the same way by the script |
| a second page | 80 more synthetic entries (101 in all) added through the account page's form | **produced**: page 1 holds **100** entries with a `continuation_key`, page 2 the 101st; the script's paging stored all of them. (The 21-entry fixture never paged; the Mock's page size is 100, not the 10 of the documentation.) |
| a failing read | bad parameters on the transactions call | **produced**, one code each: unknown account 404 `ACCOUNT_DOES_NOT_EXIST`; `date_from` not a date, an invalid `continuation_key` or an unknown `strategy` 422 `WRONG_REQUEST_PARAMETERS`; `date_from` in the future 422 `DATE_FROM_IN_FUTURE`; `date_to` before `date_from` 422 `WRONG_DATE_INTERVAL` |

A second situation changed during a test (S2): data added on the account between two reads of the same session was visible at the second read (see task 08 and the pending-to-booked row), so the sandbox serves current state, not the first.

How the entries were added matters for repeatability: the page's *Add* form accepts one entry per click; 90 clicks in a loop landed 80 (some clicks were lost at 350 ms; 900 ms was reliable for single adds). Deleting is one × per row. A suite would have to wait for each change or check the count.

### Sandbox limits (task 12, UC-005-15), 2026-10-17: the reading and counting parts
- **Sessions at once** `[PoC]` (S2, partly): at least **three** sessions of the same Sandbox application and account were `AUTHORIZED` together (the one from 12 Oct, one of 179 days, and the one in use) and a fourth, short one was authorised alongside them; no refusal. Ten were not tried: each costs a hand consent (four clicks in a signed-in browser). The ceiling is **not determined**.
- **Documented limits of the sandbox** `[docs]`: the sandbox page says only that a Sandbox application gets "a limited number of ASPSPs' sandboxes", that Mock-only configurations exist, and that real banks' sandboxes may impose hard rate limits; it gives **no figures** for calls, sessions or retention of Enable Banking's own.
- **Terms of service** `[docs]` (`enablebanking.com/terms`, read 2026-10-17): the Sandbox Environment is for evaluation and development; quotas per second, per hour and per day **may apply** with no numbers given; the terms forbid bypassing security or rate limits and abusive automation, and forbid accessing the **Control Panel or the API through bots, crawlers or other automated devices**. So an unattended script driving the Control Panel (the sign-in, the Mock page) conflicts with the terms as written, besides the CAPTCHA; a person-driven consent, and API calls with the application's key at a sane rate, do not. No retention period is stated for uploaded Mock data beyond "until removed" in the Control Panel.
- **CI machine** (S3) `[docs]`: nothing in the terms forbids calling the API from another machine at a normal rate; the same terms forbid automated use of the Control Panel. The answer for the suite is therefore: reads with the key from a CI machine are **not forbidden, quota unknown**; consents and Mock-data changes must be done by a person.
- **Not run, by the author's decision (2026-10-17)**: the rate-limit burst (UC-005-15-S1) and its recovery check. The organiser does not want to risk being blocked, and the sandbox shares one API host with production. The call limit stays **not determined**.

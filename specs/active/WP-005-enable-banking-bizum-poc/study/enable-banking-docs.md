# Enable Banking: what the public docs establish (Q-01 to Q-08)

Sources: Enable Banking docs: Quick start, API reference (Transaction, Session, ErrorCode, enums), FAQ, Linked accounts, Webhooks, markets LT and ES, the samples repository page. Claims below are documented unless marked `inference` or `unknown`.

## Q-01 The guide against the docs

Confirmed: JWT (RS256, `kid` = application id, `iss`, `aud`, `iat`, `exp`, `Bearer`), the `/aspsps` → `/auth` → `/sessions` → `/accounts/{uid}/transactions` flow, `continuation_key` paging, `valid_until` capped by `maximum_consent_validity`, no transaction webhook (only the payment status webhook), the 4-fetches-a-day / 6-hour rule, `entry_reference` over `transaction_id`, skipping `PDNG`, `identification_hash` for account matching across sessions, `strategy=longest`, and the restricted-mode empty list.
Corrections and additions:
- Quick start uses `exp = iat + 3600`; the guide's 24 h maximum is not in the docs read (`unknown`). Use 1 h.
- `maximum_consent_validity` is returned per ASPSP in `GET /aspsps` in **seconds** (example 15552000 = 180 days).
- Authorization responses carry `authorization_id` and `psu_id_hash`; `POST /sessions` returns `session_id`, `accounts`, `aspsp`, `psu_type`, `access`.
- `GET /sessions/{id}` returns `status` and `accounts_data` (`uid`, `identification_hash`). `DELETE /sessions/{id}` closes a session and the bank consent "if possible".
- Account `uid` is valid only while the session is AUTHORIZED. `identification_hashes` (plural) exists for fuzzy matching.
- The guide's "an empty page that still carries a key means keep going" is not in the docs (`unknown`, test it).

## Q-02 Revolut

The Lithuanian market page lists Revolut (plain name "Revolut") with a redirect flow: SCA in the mobile app (app switch) or PIN + app + SMS. Credit cards show only in the in-app consent. It says nothing on history depth, fields or limits; the Spanish page says nothing on Revolut or Bizum. Listing under `ES` or `LT` is `unknown` → PoC experiment. Spanish page generalities (Redsys banks, one active authentication session per user per TPP, a new authentication invalidates the previous tokens) concern Spanish banks, not Revolut (`inference`: do not assume it).

## Q-03 Restricted production mode

Activation is by linking accounts from the Control Panel, after which the app is "Active" in restricted mode and "can only fetch data from accounts linked to the application"; it lasts until a full-production agreement is signed. Linking does not authorise the app: the API authorisation is required even for the same account. An unlinked account authorised through the API returns an empty list. Terms, privacy and data-protection checks are not performed in this mode. The ErrorCode `NO_ACCOUNTS_ADDED` also exists.

## Q-04 Redirect URL

Not answered by the docs: they only say redirect URLs must be whitelisted at registration, and an error `REDIRECT_URI_NOT_ALLOWED` exists. The Control Panel registration form (production, "Add a new application") has: environment (Sandbox/Production), key generation (in the browser with SubtleCrypto, exporting the private key, or outside the browser importing a public certificate), application name, "Allowed redirect URLs (one per line)", description, an email for data-protection matters, and privacy and terms URLs. It shows no hint or inline validation about localhost or http; only submitting would tell, and that registers a real application. The account had no applications at the time of the check. Carried forward as experiment E-04: the author registers the app with a localhost URL and sees whether it is accepted.

## Q-05 Bizum fields

The Transaction has: `entry_reference`, `transaction_amount`, `creditor` / `debtor` (party), `creditor_account` / `debtor_account`, `bank_transaction_code` (`description`, `code`, `sub_code`), `credit_debit_indicator`, `status`, `booking_date`, `value_date`, `transaction_date`, `remittance_information` (array of strings), `reference_number`, `note`, `merchant_category_code`, `exchange_rate`, `balance_after_transaction`. Everything except amount, indicator and status is optional. Nothing documents how Revolut fills them for a Bizum (a web search found nothing either): `unknown` → experiment E-05: dump a few real Bizums and compare with a card payment and a bank transfer.

## Q-06 Limits and errors

- The API has no quota in the docs; limits come from the bank. FAQ: many banks allow 4 background fetches a day; a 429 usually carries `ASPSP_RATE_LIMIT_EXCEEDED`; wait about 6 hours.
- PSU headers tell the bank the user is present, so the background limit does not apply; send all the ASPSP's `required_psu_headers` (listed in `GET /aspsps`) or none, otherwise 422 `PSU_HEADER_NOT_PROVIDED`. A user-triggered "refresh now" can therefore carry the user's headers.
- `strategy`: `default` (uses dates, errors `WRONG_TRANSACTIONS_PERIOD` if unavailable) or `longest` (earliest available; ignores `date_to`; may make extra bank calls). Full history is often available for about an hour after authorisation, then commonly 90 days.
- Relevant error codes: `EXPIRED_SESSION`, `REVOKED_SESSION`, `CLOSED_SESSION`, `ASPSP_RATE_LIMIT_EXCEEDED`, `PSU_HEADER_NOT_PROVIDED`, `WRONG_CONTINUATION_KEY`, `WRONG_TRANSACTIONS_PERIOD`, `DATE_FROM_IN_FUTURE`, `ASPSP_PSU_ACTION_REQUIRED`, `UNAUTHORIZED_IP`. The FAQ says to branch on the error code, not the status code (401 is ambiguous).
- Session status values: `AUTHORIZED`, `PENDING_AUTHORIZATION`, `RETURNED_FROM_BANK`, `CANCELLED`, `CLOSED`, `EXPIRED`, `REVOKED`, `INVALID`.

## Q-07 Re-authorisation

There is no refresh: when `valid_until` arrives (or the session ends early) a new `POST /auth` + `POST /sessions` is required, giving a new `session_id` and new account `uid`s; match accounts by `identification_hash` (or IBAN). Early expiry causes: one-session-per-user banks, yearly KYC surveys, certificate migrations. A bank may adjust `valid_until` upward but the session still expires on the requested value. Whether an authorisation can be started before expiry, whether it replaces the old session, and whether Revolut asks for the app approval every time are `unknown` → experiment E-07.

## Q-08 Dedup and ordering

`entry_reference` is unique and immutable per identification hash but not globally (same value can occur on different accounts), generally present only for `BOOK`; `PDNG` gets one only if the bank keeps it. `transaction_id` may change between list calls. Some banks give no references or duplicates, and Enable Banking can synthesise references. Bundled transactions can appear as one aggregated entry. Dedup key for the PoC: (`identification_hash`, `entry_reference`), ignoring `PDNG`, falling back to a content hash (`inference`).

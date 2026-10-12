# Enable Banking PoC — how to run

Throwaway script `ebpoc.py` (Python 3, needs `pyjwt` and `requests`, both already installed). State lives in `poc/local/` (git-ignored: key, config, session, raw data). Nothing here writes to the Pachanguero database.

```bash
python3 poc/ebpoc.py selfcheck          # synthetic checks, no network
python3 poc/ebpoc.py aspsps ES          # Revolut in a country (also LT)
python3 poc/ebpoc.py auth [--days N]    # start an authorisation, prints the consent URL
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
- E-04 (is a `localhost` redirect URL accepted): not run yet.

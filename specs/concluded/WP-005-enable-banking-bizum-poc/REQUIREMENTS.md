# Requirements — WP-005-enable-banking-bizum-poc

Actor in every use case is the **organiser** (the owner of the Revolut account); "the script" is the PoC. Evidence tags follow the Claim Grounding table; study references are in `study/`.

## 1. Use Case Audit

**Component:** a standalone, read-only PoC script plus two guides. **Variants covered:** one bank (Revolut, personal account, restricted production mode), one payment type (incoming Bizum), the whole consent lifecycle. **Not covered:** writing payments or debts in Pachanguero, production hosting, any other bank or payment type (Vision section 3). Single work package, so no exclusion names another iteration.

| Vision need | Use cases |
| --- | --- |
| Learn the lifecycle: find Revolut, authorise, session, read transactions | UC-005-01, UC-005-02 |
| Recognise Bizums and their sender | UC-005-04 |
| Match senders to players, report only | UC-005-05 |
| Measure rate limits, history depth | UC-005-06 |
| Re-authorisation (author decision) | UC-005-07 |
| Keys, tokens, payloads local, only anonymised findings in docs | UC-005-03 |
| Output: generic guide and Pachanguero guide | UC-005-08, UC-005-09 |

No row is empty.

## 2. Use Cases

Diagram: [use-cases.puml](requirements/diagrams/use-cases.puml). Graduation values are proposed; the author decides.

### UC-005-01 — Authorise the Revolut account

Goal: obtain a session on the real account. Rests on Q-02, Q-03, Q-04. Graduation: `throwaway` (the findings graduate through UC-005-08).

#### UC-005-01-S1 — Revolut is found in the listing
Given an application registered in Production and active in restricted mode with the Revolut account linked
When the organiser runs the script's listing step for country `ES` and then `LT`
Then the script prints every ASPSP whose name contains "Revolut" with `name`, `country`, `maximum_consent_validity` and `required_psu_headers`, and the guide records which country lists it (E-02; `assumed` that it is one of the two).

#### UC-005-01-S2 — Authorisation completes
Given the exact Revolut `name` and `country` from S1 and a whitelisted `redirect_url`
When the organiser runs the script's authorise step and approves in the Revolut app
Then the script exchanges the returned `code` for a session and stores `session_id`, each account `uid` and its `identification_hash` locally (Q-01, `verified — document`: Quick start, API reference).

#### UC-005-01-S3 — Redirect URL is accepted or not
Given the organiser registers the application with `http://localhost:<port>/callback`
When the organiser submits the registration
Then the outcome (accepted or rejected) is recorded; if rejected, the script offers a paste-the-URL fallback to capture `?code=` (E-04; `assumed` unknown, Q-04 carried forward).

#### UC-005-01-S4 — Account not linked
Given an authorisation for an account that is not linked to the restricted application
When the organiser runs the authorise step
Then the session contains no accounts and the script says the account must be linked first (Q-03, `verified — document`: FAQ, Linked accounts).

### UC-005-02 — Read the transactions

Goal: a complete, de-duplicated list of the account's transactions. Rests on Q-01, Q-08. Graduation: `throwaway`.

#### UC-005-02-S1 — First fetch reads the longest history
Given a valid session and no stored transactions
When the organiser runs the fetch step with `strategy=longest` and a `date_from` of 2025-09-01
Then the script follows `continuation_key` until none is returned (also through an empty page that still carries a key, E-08 `assumed`) and stores every transaction locally.

#### UC-005-02-S2 — Repeat fetch adds only the new ones
Given 40 stored booked transactions and a new fetch returning those 40 plus 2 new ones
When the organiser runs the fetch step again
Then 2 transactions are added; the key is (`identification_hash`, `entry_reference`), never `transaction_id` (`verified — document`: FAQ).

#### UC-005-02-S3 — Pending transactions are skipped
Given a fetched transaction with `status` `PDNG`
When the organiser runs the fetch step
Then the transaction is not stored as received money, and the next fetch stores it once it is `BOOK` (`verified — document`: FAQ; whether Revolut keeps the same reference is E-08).

### UC-005-03 — Keep credentials and real data local

Goal: nothing secret or personal reaches a tracked file. Rests on Vision section 5. Graduation: `document` (the handling rules go into the generic guide).

#### UC-005-03-S1 — Raw data stays in the ignored folder
Given the script has stored a private key, a session and 40 raw transactions in `poc/local/`
When the organiser runs `git status`
Then none of those files appear as untracked or modified (`poc/local/` needs a `.gitignore` entry; `inferred` from the repo's `.gitignore`, which lists no `.pem` or capture folder).

#### UC-005-03-S2 — Findings are anonymised
Given a raw Bizum payload naming a player
When the organiser copies its shape into a guide
Then names, amounts, phone numbers, IBANs and ids are replaced by placeholders.

### UC-005-04 — Recognise a Bizum and its sender

Goal: tell a Bizum from any other credit and get who sent it and how much. Rests on Q-05 (all of it `unknown` until run). Graduation: `document` (the marker rule goes into the generic guide).

#### UC-005-04-S1 — Real transactions are inspected side by side
Given at least 3 real received Bizums, 1 card payment and 1 bank transfer in the stored list
When the organiser runs the inspect step
Then the script prints, per transaction, `credit_debit_indicator`, `status`, `bank_transaction_code`, `debtor`, `remittance_information`, `note`, `reference_number` so that differing fields are visible (E-05).

#### UC-005-04-S2 — A Bizum marker is found
Given the side-by-side output of S1
When the organiser picks the field values that appear in every Bizum and in no other transaction
Then the guide records that rule, with the sender-bearing field and the field carrying the amount; if no such rule exists, the guide says Bizums cannot be told apart and what is missing.

#### UC-005-04-S3 — The script applies the rule
Given the rule of S2 and 40 stored transactions of which 6 are Bizums
When the organiser runs the recognise step
Then the script lists exactly the 6 with sender text, amount and booking date.

### UC-005-05 — Report which player each sender matches

Goal: measure how well sender names match players, without writing anything. Rests on Q-11. Graduation: `document`.

#### UC-005-05-S1 — Senders are matched read-only
Given a read-only copy of player names and aliases and 6 recognised Bizums
When the organiser runs the match step
Then each sender is reported `matched`, `ambiguous` or `unresolved` using `NameMatcher`'s rules, and the totals are printed; no row of Pachanguero's database is changed (`verified — source`: `NameMatcher` in `server/src/domain/name-matcher.ts`).

#### UC-005-05-S2 — The match rate is recorded
Given the totals of S1
When the organiser records the finding
Then the Pachanguero guide states the match rate and the kinds of mismatch (abbreviations, case, accents, nicknames), anonymised.

### UC-005-06 — Measure the limits

Goal: the real rate limit and history depth. Rests on Q-06. Graduation: `document`.

#### UC-005-06-S1 — Background fetches until a 429
Given a valid session and no PSU headers
When the organiser runs the limit step, which fetches the same range repeatedly with the timestamps recorded
Then it stops at the first `ASPSP_RATE_LIMIT_EXCEEDED` and prints how many fetches succeeded (E-06; the documented figure of 4 a day is `assumed`).

#### UC-005-06-S2 — Recovery time
Given a 429 recorded at a known time
When the organiser reruns one fetch after 6 hours
Then the result (success or 429) is recorded.

#### UC-005-06-S3 — History depth over time
Given a fresh authorisation
When the organiser fetches with `strategy=longest` immediately, after 1 hour and after 1 day
Then the earliest booking date returned each time is recorded (E-06b; FAQ says about 90 days after the first hour, `assumed`).

### UC-005-07 — Re-authorise

Goal: keep reading after the consent ends. Rests on Q-07. Graduation: `document`.

#### UC-005-07-S1 — Early re-authorisation
Given a valid session
When the organiser runs the authorise step again before expiry
Then the script records whether the old session stays valid, whether account `uid`s changed and whether `identification_hash` is unchanged (E-07).

#### UC-005-07-S2 — Expired or closed session is detected
Given a session closed with `DELETE /sessions/{id}`
When the organiser runs the fetch step
Then the script reports the error code (expected `CLOSED_SESSION`/`EXPIRED_SESSION`/`REVOKED_SESSION`) and says re-authorisation is needed, deciding on the code, never the HTTP status (`verified — document`: FAQ).

#### UC-005-07-S3 — Accounts are matched after re-authorisation
Given stored data from the old session and a new session with new `uid`s
When the organiser runs the fetch step
Then new transactions are appended to the same account by `identification_hash` without duplicating the old ones.

### UC-005-08 — Publish the generic guide

Goal: a guide any application can follow. Rests on all of `study/enable-banking-docs.md`. Graduation: `document`.

#### UC-005-08-S1 — The guide is complete and verified
Given the results of UC-005-01 to UC-005-07
When the organiser reads the guide
Then it covers procedure, JWT, listing, authorisation, reading, Bizum recognition, guidelines, limits, consent expiry and re-authorisation, and every claim carries `verified in PoC` or `from docs`; each former `unknown` of `study/poc-experiments.md` is answered or says "not determined".

### UC-005-09 — Publish the Pachanguero guide

Goal: a guide to integrating this with Pachanguero. Rests on `study/pachanguero-today.md`. Graduation: `document`.

#### UC-005-09-S1 — The guide maps findings onto Pachanguero
Given the results of UC-005-05 and the generic guide
When the organiser reads the guide
Then it states how a detected Bizum maps to payer, amount and `paid_on` of `PaymentService.pay`, where the bank reference would be kept, the variants of Q-12 that actually occurred, and the decisions the production work package must take.

## 3. Interface Examples

None: the script's interface is internal to the PoC and decided in design; no existing endpoint, schema or contract changes (the PoC adds no Pachanguero interface).

## 4. File Locations

All inside `specs/active/WP-005-enable-banking-bizum-poc/`, tracked in git except `poc/local/`:

- `poc/` — the PoC script and its README (tracked; design fixes the file layout), 1 folder.
- `poc/local/` — the private key (`.pem`), sessions, tokens and raw transaction payloads; **git-ignored**, never committed. Needs one `.gitignore` entry (`specs/active/WP-005-*/poc/local/`).
- `output/` — the two guides, tracked: `enable-banking-revolut-integration.md` and `pachanguero-integration.md` (proposed names), 2 files.
- `material/enable-banking-revolut-bizum-guide.md` — input, unchanged, tracked.

## 5. Success Criteria

| UC | The check that fails if unmet |
| --- | --- |
| 01 | the script run against the real account ends with a stored session and account list, or the guide names why not |
| 02 | a second fetch run stores zero duplicate transactions |
| 03 | `git status` after a full run lists no file from `local/` |
| 04 | the recognise step lists exactly the Bizums the organiser knows were received |
| 05 | the match step leaves the database file's modification time unchanged |
| 06 | a run produces a number (or "no limit hit") for each of S1–S3 |
| 07 | after a re-authorisation a fetch returns the same account without duplicates |
| 08, 09 | each `unknown` in `study/poc-experiments.md` appears answered or "not determined" in a guide |

## 6. Constraints

- Enable Banking in restricted production mode (individual, non-commercial use, only the linked accounts, read-only).
- Keys, tokens, session data and raw transaction payloads stay local in git-ignored files; the repository and the docs get only anonymised findings.
- No software is installed without explicit permission.
- The PoC does not write payments or debts, host anything in production, or handle other banks or payment types.

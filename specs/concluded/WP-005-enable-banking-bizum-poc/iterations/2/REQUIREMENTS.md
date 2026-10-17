# Requirements — WP-005 iteration 2 (Sandbox testing experiments)

Resolves element F8 (`DESIGN_PLAN.md` §2.7). Source of the need: `SANDBOX_TESTING_NEEDS_FROM_WP-006.md`. 

## 1. Use Case Audit

Component: the Enable Banking **Sandbox** application and its **Mock ASPSP**, exercised through `poc/ebpoc.py` and the browser. Iteration 1 established the manual path (`output/enable-banking-control-panel-and-testing.md` §4, §5); this iteration asks what of it can be repeated without a person, and what the sandbox can and cannot show.

| Covered | Not covered (and where it goes) |
| ------- | ------------------------------- |
| whether consent, data, redirect, fidelity, edge cases and limits are scriptable (UC-005-10 to -15); the two documents (UC-005-16, -17) | the real Revolut account: iteration 1; payment initiation, other banks, anything Pachanguero's production work package builds: WP-006 |

## 2. Use Cases

### UC-005-10 — Complete the sandbox consent without a person

Actor: the organiser (or a CI job) running a script. Goal: know whether a Sandbox authorisation can be completed unattended, so a sandbox test can be a regression test. Rests on `output/enable-banking-control-panel-and-testing.md` §4–§5. Graduation: `document` (through UC-005-16). Protections are never bypassed: if one stops the script, that is the answer.

Known: the consent page is on `tilisy-sandbox.enablebanking.com`; by hand, *Continue authentication*, tick the account, *Authorize*, then a redirect to the redirect URL with `state` and `code` (`verified — document`: output document §5 step 3, observed in iteration 1). The *upload* page has an invisible reCAPTCHA (`verified — document`: output document §4); whether the *consent* page has any bot check or MFA is `not determined`.

#### UC-005-10-S1 — The consent page is driven by a script
Given a Sandbox application with the Mock ASPSP holding one uploaded account, and an authorisation URL from `POST /auth`
When a browser-automation script (Playwright) opens the URL, presses *Continue authentication*, ticks the account and presses *Authorize*
Then the browser is redirected to the redirect URL with `state` and `code`, no person acted, and the run is repeatable (three consecutive runs each produce a session).

#### UC-005-10-S2 — A protection stops the script
Given the same setup
When the script reaches a bot check, CAPTCHA or MFA step on the consent page
Then the step and what it asks are recorded, nothing is bypassed, and the verdict for unattended consent is "hand only" with the protection named.

#### UC-005-10-S3 — The sandbox host or flow cannot be reached by a script at all
Given the same setup
When the script opens the authorisation URL from a CI-like machine with no display
Then the outcome (page loads headless or not, refused, redirected elsewhere) is recorded, and the verdict is "scriptable", "hand only" or "not determined" accordingly.

### UC-005-11 — Control the Mock ASPSP data

Actor: the organiser (or a CI job) preparing a sandbox test. Goal: know whether the Mock's accounts and transactions can be created, appended to and removed by a script, so a test starts from a known state and can make "a new Bizum arrives between two reads" happen. Rests on `output/enable-banking-control-panel-and-testing.md` §4. Graduation: `document` (through UC-005-16).

Known: accounts are added by hand (*Add a new account*) or by uploading a `.json` file, behind an invisible reCAPTCHA that is not to be bypassed; uploaded data stays until removed; the upload requires `info`, `transactions` and a `balances` array (`verified — document`: output document §4, observed in iteration 1). Whether any API call, and not only the Control Panel page, creates, appends or removes Mock data is `not determined`; so is whether the data belongs to the application, the user or everyone.

#### UC-005-11-S1 — Data is created and removed by a script
Given a Sandbox application with no Mock accounts and the fixture `poc/fixtures/mock-aspsp-bizum.json`
When the organiser's script (an API call, or the browser driven by a script where the page allows it) uploads the fixture and later removes it
Then the Mock lists the fixture's account while it exists and no account after removal, and the means used (API call, or page only) is recorded.

#### UC-005-11-S2 — A transaction is appended after authorisation
Given an authorised session that has read the fixture's 21 entries once
When the organiser's script adds one new Bizum-shaped entry to that account, by whatever means exists
Then a second `fetch` with the same session reads that entry, and only that one as new; or the experiment records that appending after authorisation is impossible or needs a new authorisation.

#### UC-005-11-S3 — Only the page can change the data
Given the same setup
When the organiser's script tries every means found in S1 and S2 and none works without a person
Then the verdict is "hand only", the exact manual steps that remain are written down, and what that means for a known starting state (a fixed fixture, only the first read testable) is stated.

#### UC-005-11-S4 — Whose data it is
Given two Sandbox applications of the same Enable Banking account, each with its own key, and the fixture uploaded through the first
When the organiser lists the Mock's accounts through the second application
Then the result says whether Mock data is per application, per user or global, and whether an uploaded account is visible to a test running at the same time.

### UC-005-12 — Reach a local server with the redirect

Actor: the organiser running a sandbox test against a locally running server. Goal: know whether the consent's redirect can land on the server under test, so its real callback route is exercised, or whether the test must capture `state` and `code` and replay them. Rests on Q-04 (carried forward from the work package study) and iteration 1's never-run experiment E-04. Graduation: `document` (through UC-005-16).

Known: only whitelisted redirect URLs are accepted (`REDIRECT_URI_NOT_ALLOWED` otherwise); `https://example.com/callback` worked in the production PoC, and the page need not load because the address bar holds the code (`verified — document`: output document §2, observed in iteration 1). That a `localhost` URL is accepted is `not determined` (`poc/README.md`: "E-04 ... not run yet").

#### UC-005-12-S1 — A localhost redirect is accepted
Given a Sandbox application being registered and a server listening on `http://localhost:8787`
When the organiser lists `http://localhost:8787/api/bank/callback` as an allowed redirect URL, then calls `POST /auth` with it
Then the outcome of registration and of `POST /auth` is recorded separately, and when both accept it, the consent ends with the browser at that URL carrying `state` and `code`, which the listening server receives.

#### UC-005-12-S2 — A localhost redirect is refused
Given the same setup
When registration or `POST /auth` refuses the localhost URL
Then the error and the step that gave it are recorded, and the verdict says the real callback route cannot be reached directly; the test captures the redirected address and replays `state` and `code` to the local server.

#### UC-005-12-S3 — Several https URLs are listed
Given a Sandbox application whose redirect URL list holds three `https` URLs
When the organiser calls `POST /auth` with each in turn
Then it is recorded whether the list can hold several URLs, whether each is accepted by `POST /auth`, and which of them a test machine could reach (a tunnel or a public test endpoint), so a test can choose the URL per run.

### UC-005-13 — Know how faithful the Mock is

Actor: the organiser deciding what a Mock-based test proves. Goal: know where the Mock behaves like the real bank, so the tests that rest on it say only what they can. Rests on `output/enable-banking-control-panel-and-testing.md` §4, §5 and `output/enable-banking-revolut-integration.md`. Graduation: `document` (through UC-005-16).

Known: the Mock returned all 21 entries in one page though the docs promise batches of 10, newest first; date filtering was not exercised (`verified — document`: output document §4, observed in iteration 1); `Mock ASPSP` with country `ES` worked in `POST /auth` and the Mock is listed for every country (§5). The fixture was written from the findings of the real account, not captured from the bank (`verified — document`: `SANDBOX_TESTING_NEEDS_FROM_WP-006.md`).

#### UC-005-13-S1 — The entry reference is stable
Given the fixture authorised and fetched twice in one session, then once in a second session
When the organiser compares `entry_reference` of each of the 21 entries across the three reads
Then the result says whether each entry keeps its reference across fetches and across sessions, or whether it changes or is missing, and what that means for a once-only ledger.

#### UC-005-13-S2 — The date filter and the order (outline)
Given the fixture holding entries older and newer than the date used, with dates in the examples table
When the organiser's script calls `fetch` with each `date_from`
Then the entries returned and their order match the "returned" column or the difference is recorded.

| date_from | entries on or after it | expected on the real bank |
| --------- | ---------------------- | ------------------------- |
| before every entry | all 21 | all 21 |
| between two fixture dates | those dated on or after it | only those |
| after every entry | none | none |

#### UC-005-13-S3 — The shape matches the real bank's
Given the fixture's entries and a list of the fields Revolut's real Bizum entries carry (`output/enable-banking-revolut-integration.md`)
When the organiser compares them field by field, anonymised
Then the result names every field that differs in presence, type or wording, and says whether a test-only catalogue entry mapping the Mock to the Revolut dialect would be honest.

#### UC-005-13-S4 — The bank is named in the call
Given the Sandbox application
When the organiser calls `GET /aspsps` for `ES`, `GB` and `DK`, then `POST /auth` with `Mock ASPSP` for each
Then the result says which name and country `POST /auth` accepts for the Mock, and whether the choice of country changes anything the test sees.

### UC-005-14 — Provoke the edge cases

Actor: the organiser deciding which scenarios a sandbox test can cover. Goal: know which failure and boundary situations the sandbox can produce on demand, so each scenario is placed on the sandbox or on a fake. Rests on `study/enable-banking-docs.md` and `output/enable-banking-control-panel-and-testing.md` §5. Graduation: `document` (through UC-005-16).

Known: closing a session and then fetching gives HTTP 401 `CLOSED_SESSION` in the sandbox, as on the real bank; consent lasts at most 180 days; `ASPSP_RATE_LIMIT_EXCEEDED` is the rate-limit answer; a pending entry is skipped by the PoC (`verified — document`: output document §5 and iteration 1's task 02 and 03). Whether the sandbox can produce `EXPIRED_SESSION`, `REVOKED_SESSION`, a rate-limit answer, a validity of a few minutes, a pending entry that later becomes booked, or a second page is `not determined`.

#### UC-005-14-S1 — Which situations the sandbox produces (outline)
Given an authorised Sandbox session on the fixture
When the organiser's script tries to provoke each situation by the means listed
Then each row of the table is filled with `produced`, `not produced` or `not determined`, the exact steps, and the error code seen.

| situation | means to try | expected if produced |
| --------- | ------------ | -------------------- |
| expired session | `valid_until` a few minutes ahead in `POST /auth`, then wait | `EXPIRED_SESSION` on the next fetch |
| session ended by the user | `DELETE /sessions/{id}` (already seen), and revoking from the bank side if the Mock offers it | `CLOSED_SESSION`, or `REVOKED_SESSION` |
| rate limit | not tried here: it is the burst of UC-005-15-S1, which runs last | `ASPSP_RATE_LIMIT_EXCEEDED` (HTTP 429) |
| pending entry that becomes booked | the same entry uploaded as `PDNG`, then as `BOOK` with the same reference | the second read sees it booked, once |
| a second page | a fixture of 100 entries | a `continuation_key` in the answer |
| a failing read | a fixture or account state the Mock cannot serve | an error code the script reports |

#### UC-005-14-S2 — A situation changes during a test
Given a session that read the fixture once
When the organiser's script changes the Mock data to the next state in the table (pending to booked, or an entry added), then fetches again
Then the second read shows the change or the experiment records that the sandbox serves the first state still.

### UC-005-15 — Learn the sandbox's limits

Actor: the organiser deciding how often and from where a sandbox suite may run. Goal: know the sandbox application's limits, so the suite's schedule and the key's home are chosen on facts. Rests on `study/enable-banking-docs.md` (Q-06). Runs last, after the other experiments and after the guide is written: the guides carry a placeholder for these figures, which this use case fills. Graduation: `document` (through UC-005-16).

Known: the sandbox uses the same API host as production (`verified — document`: output document §4, `poc/ebpoc.py`); calls per day or hour, number of sessions, retention at Enable Banking, and whether a CI machine may call it are `not determined`.

#### UC-005-15-S1 — Call limits are measured
Given a Sandbox session on the fixture
When the organiser's script repeats the same fetch up to 150 times, stopping at the first `ASPSP_RATE_LIMIT_EXCEEDED`, and then tries one fetch at +1 h
Then the count of calls before any limit, or "no limit hit in 150", and the recovery time are recorded.

**Author decision (2026-10-17): S1 is not run** (the organiser does not want to risk being blocked for a number; the sandbox shares one API host with production). Its answer is recorded as `not determined`, with the reason.

#### UC-005-15-S2 — Sessions and retention are counted
Given a Sandbox application
When the organiser's script opens sessions one after another without closing them, until one is refused or ten exist
Then the number of sessions allowed at once is recorded, and what the documentation and the Control Panel say about how long Enable Banking keeps the data is quoted with its source.

#### UC-005-15-S3 — A CI machine calls the sandbox
Given the terms of use and the Control Panel's settings for a Sandbox application
When the organiser reads what they say about automated use, and a script calls the API from a machine other than the organiser's
Then the answer is recorded as `allowed`, `not allowed` or `not determined` with the source, together with where the application's key may live.

### UC-005-16 — Publish the sandbox testing guide

Actor: the organiser (and whoever designs tests for a service that reads bank data). Goal: a document that explains how to test against the Enable Banking sandbox, in the way `output/enable-banking-control-panel-and-testing.md` explains the production side, so any application can follow it. Rests on the results of UC-005-10 to -15. Graduation: `document`.

#### UC-005-16-S1 — The guide answers every question with a verdict
Given the results of UC-005-10 to UC-005-15
When the organiser reads the guide
Then each question is answered by one verdict line (`scriptable`, `hand only` or `not determined`) followed by what was done and what happened, every claim carries `[PoC]`, `[docs]` or `[not determined]`, and anything else the experiments showed (surprises, instabilities, costs) is stated.

#### UC-005-16-S2 — The guide tells how to run a sandbox test
Given the same results
When a developer who has not seen this work package follows the guide
Then it gives the steps from registering a Sandbox application to a finished read, naming the manual steps that remain, and which parts can be repeated without a person and from which starting state.

#### UC-005-16-S3 — The existing guide and the README stay true
Given `output/enable-banking-control-panel-and-testing.md` and `poc/README.md`
When an experiment changed a command, a fixture or a statement they make
Then the statement or command is corrected in place, and no sandbox statement of the older text contradicts the new guide.

### UC-005-17 — Publish the Pachanguero testing recommendation

Actor: the organiser designing WP-006's tests. Goal: a recommendation for applying the guide to Pachanguero, in the way `output/pachanguero-integration.md` does for the feed. Rests on UC-005-16 and `study/pachanguero-today.md`. Graduation: `document`.

#### UC-005-17-S1 — The recommendation places each scenario
Given the verdicts of UC-005-16 and the scenarios the production work package must test (a new Bizum between two reads, a session expiring, a session ended early, a read of many Bizums, a read that fails)
When the organiser reads the recommendation
Then each scenario is placed on the fake bank, on the sandbox or on the real account, with the reason taken from a verdict, and the tiers of test that follow are described.

#### UC-005-17-S2 — The recommendation covers the practical choices
Given the same verdicts
When the organiser reads the recommendation
Then it states whether a sandbox suite runs on every commit, nightly or on request, where its key lives, what a test-only catalogue entry for the Mock would be and whether it is honest, and the decisions left to WP-006.

Diagram: [use-cases.puml](requirements/diagrams/use-cases.puml). Graduation values are proposed; the author decides.

## 3. Interface Examples

None: no Pachanguero interface changes. Any command the experiments add to `poc/ebpoc.py` is decided in the design and shown in the README.

## 4. File Locations

All inside `specs/active/WP-005-enable-banking-bizum-poc/`:

- `poc/ebpoc.py`, `poc/README.md`: possibly extended, corrected in place (UC-005-16-S3).
- `poc/fixtures/`: the existing fixture plus any larger or changed one the experiments need (about 1 to 3 files), synthetic data only.
- `poc/local-sandbox/`: the sandbox key, sessions and reads; git-ignored like `poc/local/`, never committed.
- `output/`: `enable-banking-control-panel-and-testing.md` updated; two new documents, one for the sandbox testing guide (UC-005-16) and one for the Pachanguero recommendation (UC-005-17), names settled in design.
- `iterations/2/`: this document.

## 5. Success Criteria

| UC | The check that fails if unmet |
| --- | --- |
| 10 to 15 | each scenario has an outcome and a verdict in the guide, or says `not determined` with what was tried |
| 10 | three consecutive scripted consents each produce a session, or the protection that stopped them is named |
| 11 | after the script removes the fixture, the Mock lists no account |
| 12 | `POST /auth` with the localhost URL gives a recorded accept or refuse, at registration and at the call |
| 13 | the table of `date_from` cases is filled with the returned entries |
| 14 | every row of the situations table has `produced`, `not produced` or `not determined` |
| 15 | the placeholder in the guides is replaced; the call limit is recorded as not measured, with the reason, and what was learned about sessions, retention and automated use |
| 16 | a developer follows the guide to a finished sandbox read; no statement in the earlier guide contradicts it |
| 17 | every scenario of S1 sits on exactly one tier, with a reason traced to a verdict |

## 6. Constraints

- No protection is bypassed: a CAPTCHA, bot check or MFA that stops a script is the answer, not an obstacle.
- Only synthetic data enters the Mock ASPSP; uploaded data stays at Enable Banking until removed.
- Sandbox keys and sessions stay local in a git-ignored folder, separate from the production ones.
- No software is installed without explicit permission (a browser-automation tool included).
- Experiments that probe a rate limit run once, after the others, and never loop after a 429.

# Task 01 — Script core and the authorise commands

## Type

**Feature.** Iteration 1. Elements absorbed: **F1, F2**. No dependency. Grouped because F1 (core: config, JWT, API client, local store, error reporting) has no standalone value without a command to run it, and F2's commands (`aspsps`, `auth`, `session`, `status`, `close`) are additive entries in the same file (bond: inseparable dependency).

## Mandatory Reading

- `DESIGN_PLAN.md` §2 (HLD) and the F1 and F2 rows of §2.7
- `study/enable-banking-docs.md` (Q-01, Q-03, Q-04, Q-06, Q-07)
- `material/enable-banking-revolut-bizum-guide.md`
- The Enable Banking API reference (https://enablebanking.com/docs/api/reference/) for `GET /aspsps`, `POST /auth`, `POST /sessions`, `GET`/`DELETE /sessions/{id}`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch (none expected outside this work package).

## Description

Create `poc/ebpoc.py` with the core and the five authorise commands, and `poc/README.md` documenting each command as it is added. The script is read-only towards the app and the player database.

## Guidelines

1. Core: read `poc/local/config.json` (`app_id`, `key_path`, `redirect_url`, `aspsp`); build an RS256 JWT per call (`kid` = app id, `iss` `enablebanking.com`, `aud` `api.enablebanking.com`, `exp` = `iat` + 3600) with `pyjwt`; call the API with `requests`; on an error response print the `error` code and message and exit non-zero. Keep every file it writes inside `poc/local/`.
2. `aspsps`: list the ASPSPs of a country given as argument whose name contains "Revolut" with `name`, `country`, `maximum_consent_validity`, `required_psu_headers`; the organiser runs it for `ES` and `LT` (UC-005-01-S1).
3. `auth`: `POST /auth` with `psu_type` personal, `valid_until` = now + the ASPSP's `maximum_consent_validity` (or less, an argument), a fresh `state`, the configured `redirect_url`; print the returned `url` (UC-005-01-S2).
4. `session`: takes the full redirected URL pasted by the organiser, extracts `code`, checks `state`, calls `POST /sessions`, saves `session.json` (`session_id`, `valid_until`, accounts with `uid` and `identification_hash`); if the account list is empty, say the account must be linked to the application first (UC-005-01-S2, S4). Print `PSU` header requirements if `required_psu_headers` is not empty.
5. `status`: `GET /sessions/{id}` and print `status` and `valid_until`; `close`: `DELETE /sessions/{id}` (UC-005-07-S2). On `EXPIRED_SESSION`, `CLOSED_SESSION`, `REVOKED_SESSION` any command says re-authorisation is needed, deciding on the error code, never the HTTP status.
6. `auth` run while a session exists must not delete the old one; record in the README what E-07 shows (old session valid? same `identification_hash`?) once run (UC-005-07-S1).
7. Run the redirect experiment of UC-005-01-S3 after the first successful authorisation: record in the README whether a `localhost` URL is accepted at registration.

## Tests

- Manual only for the API steps (no mocks, per the design): see the Manual Test Plan.
- `selfcheck` command (automated, synthetic data): checks URL parsing of `code` and `state`, and that an empty accounts list is reported.

## Manual Test Plan

1. The organiser registers an application in the Control Panel in **Production** (HTTPS redirect URL such as `https://example.com/callback`), downloads the `.pem` into `poc/local/`, activates it by linking the Revolut account, and writes `poc/local/config.json`. The agent does not enter credentials or submit the registration.
2. Run `aspsps ES` and `aspsps LT`: Revolut appears with its `name` and `country` in at least one.
3. Run `auth`; open the printed URL in the browser on this computer; approve with PIN, Revolut app and SMS.
4. Copy the redirected URL from the address bar (the page itself may not load) and run `session '<url>'`: `session.json` holds at least one account.
5. Run `status`: `AUTHORIZED`. Run `git status`: nothing from `poc/local/` is listed.

## Definition of Done

- [ ] `python3 poc/ebpoc.py selfcheck` passes.
- [ ] The manual test plan steps 2-5 were run on the real account; the output of `aspsps` (anonymised) and the session creation are noted in the README.
- [ ] E-04 recorded in the README: accepted or rejected, with the exact message.
- [ ] `git status` lists no file from `poc/local/`.
- [ ] **Graduation:** UC-005-01-S1–S4 `throwaway` (findings land in the guides, task 07); UC-005-03-S1, S2 `document`; UC-005-07-S1, S2 `document`.
- [ ] **Hard requirements:** none in this work package.
- [ ] **Documentation:** none — no shipped document changes; `poc/README.md` is new.
- [ ] **Tests:** the `selfcheck` above; `npm test` is not affected (nothing outside the work package changes).
- [ ] **Regression:** none needed; the task changes nothing the application runs (`git diff --stat` shows only `specs/` and `.gitignore`).
- [ ] **Code checks:** none apply (`specs` is excluded from prettier; the repo's ESLint covers no Python).

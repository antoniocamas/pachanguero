# What WP-006 needs to know about the Enable Banking sandbox

Raised 2026-10-17 by the design of `WP-006-bizum-payment-detection` (its `DESIGN_PLAN.md`, section 2.10.1). Nothing here is a requirement of WP-005; it is a request for a new iteration of experiments whose answers go into `output/enable-banking-control-panel-and-testing.md`.

## Why

The author's decision for WP-006: the solution must be validated against the **Enable Banking sandbox (Mock ASPSP)**, not only against our own fakes. Whether those tests can be **regression tests** (repeatable, unattended, from a known state) is open, and WP-006 cannot design that test methodology until the questions below are answered. WP-006's design is stopped at that point and waits for these answers.

## What WP-005 already established (do not redo)

From `output/enable-banking-control-panel-and-testing.md` §4, §5 and `poc/README.md`:

- A Sandbox application is active at once, has its own id and key, and uses the same API host as production (`BASE = "https://api.enablebanking.com"`, `poc/ebpoc.py`). Its banks: Banco de Sabadell, BBVA, Mock ASPSP, Genome.
- With the synthetic fixture (`poc/fixtures/mock-aspsp-bizum.json`, 21 entries): authorise, fetch (21 fetched, 20 stored, the pending one skipped), recognise (18 Bizums), second fetch reads nothing new, `DELETE /sessions` then fetch gives `CLOSED_SESSION`.
- Consent is completed by hand in a browser on `tilisy-sandbox.enablebanking.com` (*Continue authentication*, tick the account, *Authorize*). The fixture is uploaded in the browser behind an invisible reCAPTCHA that must not be bypassed. Uploaded data stays until removed.
- The Mock returned one page for 21 entries, though the docs promise batches of 10.

## The questions (experiments M-1 to M-7)

Run each against a **Sandbox** application. Record for each: what was done, what happened, and a verdict tag (`[PoC]` observed, `[docs]` stated, `[not determined]`).

| # | Question | What the answer decides in WP-006 |
| - | -------- | --------------------------------- |
| M-1 | Can the sandbox consent page (`tilisy-sandbox.enablebanking.com`) be driven by a script, for example Playwright? Does it show a bot check, a CAPTCHA, or MFA? Try it, without bypassing any protection. | Whether a sandbox test can run unattended (a regression suite) or only with a person at the keyboard (a guided check). |
| M-2 | Can Mock ASPSP data be created, appended to and removed by an API, or only on the Control Panel page? Can entries be added to an account **after** it was authorised, so that a later read sees a new Bizum? Is the data per application, per user, or global? | A repeatable test needs a known starting state each run, and "a new Bizum arrives between two reads" (the forced read) needs an entry added after the first read. If it is hand-only, the data is a fixed fixture and only the first read is testable. |
| M-3 | Is `http://localhost:<port>/api/bank/callback` accepted as an allowed redirect URL in a Sandbox application (this is WP-005's E-04, never run)? Accepted at registration **and** by `POST /auth`? If not, can a sandbox application list several `https` URLs, and which one could a test machine reach? | Whether the real callback route of a locally running server can be exercised, or the test must capture the redirect and replay `state` and `code` to the local server. |
| M-4 | Is the Mock ASPSP's `entry_reference` stable across fetches and across sessions? Does `date_from` filter on the Mock's side (use fixture entries older and newer than the date)? Does it return the entries newest first? | The once-only ledger and the start date rest on both; the sandbox may not be able to show them. |
| M-5 | Can the sandbox produce the edge cases the design handles: `EXPIRED_SESSION`, `REVOKED_SESSION`, a rate-limit answer (`ASPSP_RATE_LIMIT_EXCEEDED`), a very short `valid_until` (minutes), a pending entry that later becomes booked, a second page of results (try a large fixture)? | Which scenarios (session expiry and warning, session ended early, a read of many Bizums, a read that fails) can have a sandbox test and which stay on fakes. |
| M-6 | The sandbox application's limits: calls per day or hour, number of sessions, data retention at Enable Banking. May it be called from a CI machine, or only from the organiser's? | Whether the suite may run on every commit, nightly, or only on request, and where its key can live. |
| M-7 | Which bank name and country does `POST /auth` expect for the Mock ASPSP (WP-005 used `Mock ASPSP`, `ES`)? Are the fixture's entries shaped exactly like Revolut's real ones (the fixture was written from the guide's findings, not captured from the bank)? | WP-006 would need a test-only catalogue entry mapping the Mock to its Revolut dialect; whether that is honest depends on the shape match. |

## What to deliver

1. The answers, added to `output/enable-banking-control-panel-and-testing.md` (a new section, with the verdict tags above), and the README of the proof of concept updated where a command or fixture changed.
2. Anything else the experiments show that affects testing a service against the sandbox (surprises, instabilities, costs).
3. A one-line verdict for the author per question: *scriptable / hand only / not determined*.

## What WP-006 will do with it

Three test tiers (`inferred`, not decided): (1) the regression suite on our own fakes, every commit, no network; (2) a sandbox contract suite through the real connector and dialect against the Mock ASPSP, regression-grade only if M-1 and M-2 allow a known starting state without a person; (3) the manual live check on the real account. The answers decide the shape of tier 2 and which panel scenarios move from the fake bank server to the sandbox.

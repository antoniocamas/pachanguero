# Test strategy

Pachanguero tests follow the standard test pyramid: many fast, narrow tests at the bottom; a
handful of slow, full-stack tests at the top. Each layer verifies a different kind of claim, and
each has its own home, runner, time budget and gate. Beside the pyramid sit tiers that need a
network, a credential or a person (the bank's sandbox, a guided checklist, a live check): they
are chosen by the tree below, not by layer alone.

```
        ▲  slow, few, expensive
        │
        │   E2E (Playwright)
        │   real browser + real server + real DB
        │
        │   Integration (Vitest, server workspace)
        │   route handlers + the repository/service layer against a real SQLite file
        │
        │   Unit (Vitest, server/src/domain + web lib/ tests)
        │   pure functions
        │
        ▼  fast, many, cheap
```

## Choosing where a test goes

Decide on these axes, in this order:

1. **What claim can be false?** Take the smallest layer that can show it.
2. **What does the test need?** A network, a credential, a signed-in person, the real bank.
3. **How long does it take?**
4. **Is it deterministic?** A test that depends on someone else's service or on a person is not.
5. **Where may it run?** The pre-commit hook, before merging, before a release, or on request.

Ask the tree top to bottom and stop at the first yes:

1. A rule or calculation with no I/O → **unit**.
2. SQL or route wiring, or our code against an in-process fake → **integration**.
3. A setting the deployment must provide → **deployment settings test**.
4. Our bank connector speaking HTTP to the aggregator → **integration**, as the connector contract
   run against the fake aggregator server; the same contract runs against the sandbox when asked.
5. A journey across screens that no lower layer can show → **E2E**. Say in the test what no lower
   layer shows.
6. Whether the fake still matches the real API → the **sandbox suite**.
7. Something only a signed-in person can do (a fresh consent, data changed in the aggregator's
   control panel) → the **guided checklist**.
8. Something only the real bank shows (wording, limits, expiry, approval) → the **live check**.

If two layers can both show the claim, prefer the cheaper and faster one.

## Tiers: time and gate

Figures were measured on 2026-10-20 on the development machine; reproduce them with `time npm test` and `time npm run test:e2e`, and refresh them when a tier changes noticeably.

| Tier                     | Home                                                                             | Command                 | Needs                                   | Time                                                           | Gate                                                       |
| ------------------------ | -------------------------------------------------------------------------------- | ----------------------- | --------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Unit                     | `server/src/domain`, `server/src/bizum`, `web/src/lib`                           | `npm test`              | nothing                                 | each under 100 ms; `npm test` 49 s wall, 1655 + 235 tests      | every commit (pre-commit runs the server workspace)        |
| Integration              | `server/src/routes`, `server/src/repo`, `server/src/bank` (not the unit folders) | `npm test`              | nothing (fakes on a loopback port)      | each under 1 s; same run as unit                               | every commit                                               |
| Deployment settings test | `server/src/deployment-settings.test.ts`                                         | `npm test`              | nothing                                 | part of the run above                                          | every commit                                               |
| E2E                      | `e2e/tests/`                                                                     | `time npm run test:e2e` | the real servers and a fake bank        | 5 min 22 s wall for 44 tests; a new journey fits in about 10 s | before merging a feature or in CI                          |
| Sandbox suite            | `server/src/bank/sandbox/`                                                       | `npm run test:sandbox`  | sandbox key and a standing session      | not measured                                                   | on request and before a release that touches the bank feed |
| Guided checklist         | below                                                                            | by hand                 | a person signed in to the control panel | minutes                                                        | before a release that touches the bank feed                |
| Live check               | the real account, read-only                                                      | by hand                 | the real bank                           | manual                                                         | rarely                                                     |

## Limits

- Nothing the hook or `npm test` runs touches a network beyond the loopback or a secret.
- The sandbox suite only reads. It refuses to run unless its configuration names the sandbox
  application, never edits the sandbox data, and skips with a message (it does not fail) when
  unconfigured. Its key and session live in the local `.env`, never in the repository.
- E2E shares one database and one worker and stays small.
- A test that needs a person is a checklist item, not a suite.

## Unit tests — `server/src/domain/*.test.ts`, `web/src/lib/*.test.ts`

**What they verify:** a single pure function or component's logic in isolation — no DB, no
network, no filesystem.

**Use when:** the requirement is a calculation or a rule that can be expressed as
input → output. This is almost everything in `server/src/domain/` today: points, seniority,
convocatoria selection. On the web side, this is a component's render logic or a hook's state
transitions.

**Do not use for:** anything that depends on how a route wires the domain layer to the DB, or on
what a user actually sees end-to-end. A domain test that mocks a repository to test a route is
testing the mock, not the route.

The web side is the pure calculation modules in `web/src/lib/` (euros and their parsing, the
table's rows and columns per state, who holds which shares, the payment cell's buttons and labels,
the counters): plain TypeScript with no DOM, run by `vitest` in the `web` workspace. A component
is left to the E2E layer unless its logic moves into `lib/`.

**Run:** `npm test` (root, which runs the server and the web suites) or `npx vitest run` from
`server/` or `web/`.

**Time:** each test under 100 ms. **Gate:** the server suite gates every commit via the pre-commit hook.

## Integration tests — `server/src/routes/*.test.ts`

**What they verify:** an HTTP route, exercised through Express, against a real (temp-file or
in-memory) SQLite database created from `schema.sql`. No mocking the DB — a mocked DB only proves
the mock's shape matches the handler's assumptions, not that the SQL is correct.

**Use when:** the requirement spans the repository layer + a route — e.g. "POST /api/matches/:id/results
updates standings" — but doesn't need a browser to observe. Most Given/When/Then scenarios in a
work package's REQUIREMENTS.md land here: they describe API-observable behavior, not pixels.

**Do not use for:** anything about what renders in the browser, or multi-page/multi-request user
flows where the sequence itself is the point.

Performance claims belong here too: `server/src/repo/debt-query-cost.test.ts` seeds many played
games with every share paid and asserts through `EXPLAIN QUERY PLAN` that reading debt searches
`share_debts` by its indexes and never touches `participations`.

Tests of anything behind the login use the shared test application,
`server/src/routes/auth-test-support.ts` (`AuthTestApp`): the real server on a throwaway
database, a clock the test moves by hand (`ManualClock`), real tokens from the login or from
`tokenFor(role)`, and `createUser`/`login`/`request` helpers. Start it before anything imports
the composition root, since the database path is read at that import. There is no switch that
turns authentication off. `api.test.ts` is the exception: it mounts the bare organiser router,
which sits behind the guard, and so needs no token. `api-routes.test.ts` is the guard's own test:
it lists every route of every router and checks that each is public, session, own-data or
organiser, and that a path nobody declared is refused.

**Run:** same as unit tests — `vitest run` in `server/`, same `npm test` command. (There is no
dedicated integration script yet; add `server/src/routes/*.test.ts` files and they run alongside
the domain suite.)

**Time:** each test under 1 s. **Gate:** every commit, as the unit tests.

## Deployment settings test

**What it verifies** (`server/src/deployment-settings.test.ts`): every environment variable the server reads is accounted for in production:
set by the `Dockerfile`, passed by the Helm chart, or listed in the test as deliberately left to the
application's default. It reads the source, the `Dockerfile` and the chart templates as text; there
is no server, no database and no cluster.

**Use when:** a change adds, renames or removes a setting. The test fails until the deployment
catches up, so a variable that works locally through `.env` cannot be silently missing in the
cluster. The rest of what a change owes the deployment is in
[`deployment.md`](deployment.md#deployment-impact-of-a-change).

**Do not use for:** whether a value is correct, or whether the chart renders (`helm lint` and
`helm template` do that). It only finds variables read as `env.X` or `env['X']`.

**Run:** with the server suite (`npm test`).

**Time:** negligible. **Gate:** every commit.

## Bank connector contract — `server/src/bank/`

**What it verifies:** one set of assertions about the bank connector's behaviour (first read, paging
above 100 entries, the ledger across two reads, the start date, failing reads), run through the real
connector and dialect. On every commit it runs against a fake aggregator server on a loopback port;
that fake copies what the real sandbox was observed to do (pages of 100 with a continuation key,
newest first, exact matching of redirect addresses, the aggregator's error codes).

**Use when:** the claim is about how our connector talks to the aggregator.

**Do not use for:** the rules that judge a Bizum (unit) or the screens (E2E).

**Run:** with `npm test`. **Time:** each test under 1 s. **Gate:** every commit.

## Sandbox suite — `server/src/bank/sandbox/`

**What it verifies:** the same contract against the aggregator's Mock bank, from a standing session
read with the application key alone. It is the only automated check that the fake has not drifted
from the real API: the fake tests our logic against our idea of the API, the sandbox tests the idea.
Only the fake can produce a revoked session, a rate-limit answer or expiry driven by a clock; those
stay in the integration tier.

**Use when:** the bank feed, the connector or the fake changed, and before a release that touches
them.

**Do not use for:** anything the fake can show, or a schedule or CI job: it needs a session a
person authorised, which lasts up to 179 days.

**Run:** `npm run test:sandbox`. Without the `ENABLE_BANKING_SANDBOX*` variables of `.env.example`
it skips with a message. Before any call it refuses to run if the sandbox application or key equals
the production one, if the session is not the sandbox application's, or if one read does not count
the expected number of entries. It never ends the session. **Time:** not measured (the suite is not
configured on the development machine). **Gate:** on request and before a release that touches the
bank feed.

## E2E tests — `e2e/tests/*.spec.ts`

**What they verify:** a full user journey through a real browser, hitting the real Vite dev
server, which proxies `/api` to the real Express server, which reads/writes a real SQLite file.
Nothing is mocked — that is what makes it E2E rather than a frontend smoke test. See
`e2e/playwright.config.ts`: it boots both the server (pointed at an isolated `e2e/.tmp/e2e.db`
via `PACHANGUERO_DB`, on ports 8788/5174 so a manual `npm run dev` on 8787/5173 can stay up) and the web dev server before running. That database is **shared by every
spec in the run and never reset between them**, so a spec must either build the data it needs
through the API or not depend on a clean slate — and a spec that needs an empty database (the
first-season journey) has to run before any that create data, which today means it is the first
test of the file that holds the others, and the spec files are ordered by name after it
(`the-game-screen.spec.ts` runs after `season-and-player.spec.ts`). The suite therefore runs on a
single worker.

Every spec but `login.spec.ts` imports `test` and `expect` from `e2e/tests/auth.fixture.ts`
instead of `@playwright/test`. The fixture acts as an admin created by the operator's own tool:
`e2e/support/seed-admin.ts` (the Playwright `globalSetup`, run once the servers are up) runs the
`admin` command against the same database, sending the made-up password on standard input. The
`request` it provides carries that admin's access token, for setup calls made straight to the
API, and the `page` it provides is logged in before the test starts through the same login the
screen uses, so the browser context holds the refresh cookie and the app restores the session on
load. Each test logs in on its own: a refresh rotates the cookie, so a cookie snapshot shared by
several contexts would present a token that is already revoked. `login.spec.ts` uses the plain
test, since it is about the login itself.

The player's own view has a spec of its own (`the-own-view.spec.ts`, ordered after the others for
the same reason). It prepares two players and two played games through the admin `request`, creates
the accounts with `e2e/support/accounts.ts` (the same operator command, with `--player`), and then
logs in as each account in a fresh browser context at a 375 px viewport: the three own screens and
no organiser tab, contact data surviving a reload, the password change ending the session, and an
admin's switch to the player view and back across a reload.

The bank access has three specs, run against a fake Enable Banking server that the config starts as
a third `webServer` (`server/src/bank/fake/`, driven over HTTP by `e2e/support/fake-bank.ts`): the
Banco panel (`the-bank-panel.spec.ts`: connect through the fake's consent page and the real
callback, choose the account, set the start date, read, disconnect), the waiting Bizums in Deudas
(`the-waiting-bizums.spec.ts`) and the correction of a Bizum (`the-bizum-correction.spec.ts`).
The panel spec leaves the bank disconnected; the other two connect it through the API with
`e2e/support/bank-setup.ts`. The server keeps five minutes between two reads, which a run cannot
wait for, so `ReadGap` removes the record of the last read from the run's database before a
journey reads. Production lists one bank, so the run lists one; the second, fake bank is exercised
by the integration tests.

The game screen has a spec of its own that walks one game through every state and reads the state
and next action from the screen; then, for each state, at a desktop (1280 × 800) and a phone
(390 × 844) viewport, checks what is visible (the bar staying in view, the columns, no horizontal
scroll, tap-sized buttons). The drag across the line is driven with real mouse events on the
desktop. Touch cannot be driven faithfully by the runner, so a press-and-hold drag on a real phone
is checked by hand.

**Use when:** the requirement is a critical path that only exists as a sequence across
screens/requests, and where the wiring between frontend and backend is itself what's being
verified — e.g. "record a match result and see standings update", "sign up for a game and see it
appear in the roster". Write one E2E test per critical journey, not one per requirement or
Given/When/Then scenario — those belong at the unit/integration layer. E2E is expensive to run and
brittle to maintain; keep the suite small and aimed at the paths that would actually hurt if they
broke silently.

**Do not use for:** validating business rules (that's domain/unit), validating a single endpoint's
contract (that's integration), or anything that can be verified without a browser.

**Run:** `npm run test:e2e` (root) or `npm test` from `e2e/`.

**Time:** 6 to 9 s per test typically; a new journey names what no lower layer shows and fits in
about 10 s. **Gate:** before merging a feature or in CI; not part of the pre-commit hook, which it
would make too slow.

## Guided checklist for a release that touches the bank feed

For what the suites cannot do: they need a person signed in to the aggregator's control panel
(CAPTCHA, e-mail and SMS codes). Use the sandbox application with the Mock bank, never the
production account, from a browser on `localhost`.

1. **Fresh consent.** In the Banco panel press "Conectar con Revolut", approve in the Mock's consent page. Expect
   the return to the app and "Conectado hasta …" about 179 days ahead.
2. **An entry added after a read.** Press "Leer ahora", add a Bizum-shaped entry to the Mock data in the
   control panel, press "Leer ahora" again once the five-minute gap between reads has passed. Expect the new entry kept (a payment or in
   "Bizums en espera") and nothing already known repeated.
3. **A pending entry becoming booked.** Add a pending entry, read, confirm it is not kept; book it,
   read again. Expect it kept once.
4. Throughout, expect the server log to hold codes and counts only: no token, key or session id.

## Worked examples: Bizum payment detection

Where each kind of claim landed:

| Claim                                                                   | Tier                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------- |
| The rules that decide a Bizum, sender fit, nearest-debt order, seasons  | unit                                              |
| Recognising a Bizum and reading its sender                              | unit; sandbox on the Mock's entries               |
| A Bizum is handled once, also after a renewal                           | integration on the fake; sandbox across two reads |
| A read of many Bizums (above 100)                                       | integration; sandbox with a larger fixture        |
| A read that fails                                                       | integration; sandbox for the codes the Mock gives |
| Revoked session, rate limit                                             | integration only (the Mock cannot produce them)   |
| The consent, the callback route, "Conectado hasta …"                    | E2E on the fake; guided checklist on the Mock     |
| A new Bizum between two reads                                           | integration and E2E; guided checklist             |
| Waiting list, pairing, ruling, dismissal, undo, re-evaluation           | integration; one E2E journey each                 |
| The payment method; the player sees the method and nothing of the Bizum | integration; one E2E journey                      |
| What the bank really sends, its limits and expiry                       | live check                                        |

## Rule of thumb

Before writing a test, ask: what is the smallest layer that can make this claim false if it's
wrong?

- A calculation is wrong → domain/unit test.
- The SQL or route wiring is wrong → integration test.
- The server reads a setting the deployment does not provide → deployment settings test.
- Our connector and the aggregator disagree → connector contract test; whether the fake still
  matches the real API → sandbox suite.
- The frontend and backend disagree about a contract, or a multi-step journey breaks → E2E test.
- Only a person or the real bank can show it → guided checklist or live check.

Never write an E2E test to cover something an integration test could catch faster and more
reliably. Push assertions as far down the pyramid as they'll go, and prefer the cheaper and faster
of two layers that can both show the claim.

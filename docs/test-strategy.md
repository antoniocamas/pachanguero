# Test strategy

Pachanguero tests follow the standard test pyramid: many fast, narrow tests at the bottom; a
handful of slow, full-stack tests at the top. Each layer verifies a different kind of claim, and
each has its own home, runner, and speed budget.

```
        ▲  slow, few, expensive
        │
        │   E2E (Playwright)
        │   real browser + real server + real DB
        │
        │   Integration (Vitest, server workspace)
        │   route handlers + the repository/service layer against a real SQLite file
        │
        │   Unit (Vitest, server/src/domain + web component tests)
        │   pure functions, isolated components
        │
        ▼  fast, many, cheap
```

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
`server/` or `web/`. The server suite gates every commit via the pre-commit hook.

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

**Run:** same as unit tests — `vitest run` in `server/`, same `npm test` command, same pre-commit
gate. (There is no dedicated integration script yet; add `server/src/routes/*.test.ts` files and
they run alongside the domain suite.)

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

**Run:** `npm run test:e2e` (root) or `npm test` from `e2e/`. Not part of the pre-commit hook —
too slow for that; run it before merging a feature or in CI.

## Rule of thumb

Before writing a test, ask: what is the smallest layer that can make this claim false if it's
wrong?

- A calculation is wrong → domain/unit test.
- The SQL or route wiring is wrong → integration test.
- The frontend and backend disagree about a contract, or a multi-step journey breaks → E2E test.

Never write an E2E test to cover something an integration test could catch faster and more
reliably. Push assertions as far down the pyramid as they'll go.

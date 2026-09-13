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
        │   route handlers + repo.ts against a real SQLite file
        │
        │   Unit (Vitest, server/src/domain + web component tests)
        │   pure functions, isolated components
        │
        ▼  fast, many, cheap
```

## Unit tests — `server/src/domain/*.test.ts`, `web/src/**/*.test.tsx`

**What they verify:** a single pure function or component's logic in isolation — no DB, no
network, no filesystem.

**Use when:** the requirement is a calculation or a rule that can be expressed as
input → output. This is almost everything in `server/src/domain/` today: points, seniority,
convocatoria selection. On the web side, this is a component's render logic or a hook's state
transitions.

**Do not use for:** anything that depends on how a route wires the domain layer to the DB, or on
what a user actually sees end-to-end. A domain test that mocks `repo.ts` to test a route is
testing the mock, not the route.

**Run:** `npm test` (root) or `npx vitest run` from `server/`. Gates every commit via the
pre-commit hook.

## Integration tests — `server/src/routes/*.test.ts`

**What they verify:** an HTTP route, exercised through Express, against a real (temp-file or
in-memory) SQLite database created from `schema.sql`. No mocking the DB — a mocked DB only proves
the mock's shape matches the handler's assumptions, not that the SQL is correct.

**Use when:** the requirement spans repo.ts + a route — e.g. "POST /api/matches/:id/results
updates standings" — but doesn't need a browser to observe. Most Given/When/Then scenarios in a
work package's REQUIREMENTS.md land here: they describe API-observable behavior, not pixels.

**Do not use for:** anything about what renders in the browser, or multi-page/multi-request user
flows where the sequence itself is the point.

**Run:** same as unit tests — `vitest run` in `server/`, same `npm test` command, same pre-commit
gate. (There is no dedicated integration script yet; add `server/src/routes/*.test.ts` files and
they run alongside the domain suite.)

## E2E tests — `e2e/tests/*.spec.ts`

**What they verify:** a full user journey through a real browser, hitting the real Vite dev
server, which proxies `/api` to the real Express server, which reads/writes a real SQLite file.
Nothing is mocked — that is what makes it E2E rather than a frontend smoke test. See
`e2e/playwright.config.ts`: it boots both the server (pointed at an isolated `e2e/.tmp/e2e.db`
via `PACHANGUERO_DB`) and the web dev server before running.

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

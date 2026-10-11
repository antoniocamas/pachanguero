# Task 03 — An admin logs in and the rest of the API is closed, end to end

## Type

**Feature.** Iteration 1. Elements absorbed: **F1, F2, F3, F4, F8, F13**. Depends on: task 01 (the
migrator creates the new tables) and task 02 (the shells).

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md` and `.agents/rules/frontend-coding-standard.md`
- `docs/test-strategy.md`
- `DESIGN_PLAN.md` §2 (HLD: 2.4 interfaces, 2.5 mount order, 2.9 risks, 2.10 test methodology) and §3,
  subsections `F1`, `F2`, `F3`, `F8`, `F13`, `F4` (in the order written there)
- `design/diagrams/request-path.puml` and `components.puml`
- `REQUIREMENTS.md` UC-004-01, UC-004-02, UC-004-03 (S1…S5), UC-004-04 (S1…S4, S6…S13)
- Documentation of `jose` (the version installed), and of Playwright `test.extend` and `globalSetup`
  for the version in `e2e/`; add what you relied on here when done.
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/db/`, `server/src/domain/`, `server/src/repo/`, `server/src/routes/`, `server/src/cli/`,
  `web/src/` and `e2e/`.

## Description

After this task the server refuses every request without a valid session, an admin can log in (screen
and API), stay logged in by silent refresh, log out, and be created and managed by the operator CLI.
The existing organiser API is unchanged and sits behind the guard. Accounts, passwords, lockout,
tokens, the guard, the CLI, the web session and the test harness with the E2E login fixture land
together, because the guard cannot be switched on without a way to log in and a way for the tests to
do so.

## Guidelines

Read each element's subsection before touching its files; they fix names, rules and tables. In this
order:

1. **Install `jose`.** The author granted permission on 2026-10-11 (message "jose ok to install").
   Install the exact version with `npm install --workspace=server --save-exact jose`, run
   `npm audit` and report any advisory for `jose` before using it (the design's `assumed` item).
   Install nothing else.
2. **F1** — `schema.sql` tables `users` and `refresh_tokens`, the migration step added to the migrator
   (the first real step; the migrator's added test case), the four domain policies and hasher, the two
   repositories. No route yet.
3. **F13, server half** — `ManualClock`, `RouteLister`, `AuthTestApp`. They are written now because the
   F2 and F3 route tests use them. Their E2E counterpart is step 8.
4. **F2** — `AuthConfig`, `TokenService`, `AuthService`, `CookieJar`, `HttpError`, `AuthRouter`.
5. **F3** — `Authenticate`, `EffectiveRole`, `SecurityHeaders`, `ApiRoutes`, `ServerApp`, and the mount
   in `server/src/index.ts`. `api.ts` is not edited. The route-sweep test (every route of every router
   has a rule) is part of this step.
6. **F4** — `UserAdminService`, `UserCli`, `PasswordPrompt`/`TtyPasswordPrompt`, `main.ts`, the
   `admin` script, `PlayerRepository.findByName`, and the `PlayerMergeService` change for users.
   The `backup` command is not in this task (task 05).
7. **F8** — `sessionClient`, `useSession`, `Login.tsx`, `api.ts` `call()`, the root choosing between
   login and the admin shell.
8. **F13, E2E half** — `seed-admin.ts` (uses the CLI from step 6), `auth.fixture.ts`, `login.spec.ts`,
   `playwright.config.ts`, and the one-line import change in the two existing specs.
9. Run `npm run test:e2e` last. The E2E suite is expected to be red between steps 5 and 8 and green
   at the end; do not run it before step 8 and do not add any switch that turns authentication off.

Every refusal text shown to a person is Spanish; the code follows the coding standards (classes on the
server, hooks and `lib/` on the web).

## Tests

Testability: fully automatable, plus one manual check (HLD 2.10: F4 row). Test types and the table of
cases are in each element's Test Methodology; this task implements all of them:

- Unit (domain): the four policies, the hasher, `TokenService`, `EffectiveRole`.
- Integration (real SQLite, `AuthTestApp`): `user-repository`, `refresh-token-repository`,
  `auth-router`, `api-routes` (every route of every router, plus the token tables), `auth-config`,
  `user-admin-service`, `user-cli`, `password-prompt`, additions to `player-merge-service` and
  `player-repository`, and the added `schema-migrator` case.
- Web `lib/`: `sessionClient.test.ts` (three concurrent 401s cause one refresh).
- E2E (Playwright): `login.spec.ts` for the journeys F8 lists, and both existing specs through the
  fixture.
- `api.test.ts` stays as it is.

## Manual Test Plan

1. On a real terminal, run `npm run admin --workspace=server -- create --username <name> --role admin`.
2. Type a password when asked, twice.
3. Observe: no character is shown while typing and the prompt resumes on a fresh line.
4. Run `list`: the user appears, no hash is printed; open the login screen and log in with it; check the
   shell history holds no password.

## Definition of Done

- [ ] `jose` is installed at an exact version and `npm audit` shows no advisory for it, or the finding
      has been reported to the author.
- [ ] Every case in the Test Methodology of F1, F2, F3, F4, F8 and F13 exists and passes
      (`npm test`, `npm run test:e2e`).
- [ ] `GET /api/...` without a token answers 401 on every existing route, 403 for a regular user and
      404 for an unknown path as an admin (route-sweep test).
- [ ] Manual Test Plan above done and its outcome reported.
- [ ] The `JWT_SECRET` rule: the server refuses to start without a secret of at least 32
      characters (test). Until task 05 changes the `dev` script to read `.env`, pass the secret in the
      environment when running `npm run dev`.
- [ ] **Graduation:** UC-004-01-S1…S7, UC-004-02-S1…S8, UC-004-03-S1…S5, UC-004-11-S2 and
      UC-004-04-S1…S4, S6…S13 are hard requirements → the route, repository, CLI, `lib/` and E2E tests
      named above; UC-004-04's non-behavioural rules → `user-admin-service.test.ts`.
- [ ] **Hard requirements:** each scenario named in Graduation has a test whose title says what it
      asserts, with no work-package identifier in the code; this line is the record of which test
      carries which scenario.
- [ ] **Documentation:** `docs/test-strategy.md` (E2E section: specs log in through the fixture, no
      authentication-off switch; integration section: the shared test app, the bare admin router, the
      route-sweep). `AGENTS.md` (Commands: `npm run admin --workspace=server -- <command>` and
      `JWT_SECRET` from `.env`; Architecture list: the new domain, identity, routing, CLI and web
      places, and `App` choosing login or shell; Identity line: two roles and a login).
- [ ] **Tests:** `npm test` and `npm run test:e2e`.
- [ ] **Regression:** both commands above on the whole repository.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

# Design — WP-004-authentication-and-roles

**Depth: deep** (author decision, this session). At stake: a public-internet door in front of valuable,
unrecoverable data, 43 routes reclassified, and a schema change on the live database; a wrong shape is
found late and costs a security hole or lost data. Budget: about 25 pages once the Low Level Design is
written; this first stage is the High Level Design only.

Artifact types: **Code** (server classes, web components/hooks/functions), **Database** (tables, version
stamp), **Config** (environment keys), **Infrastructure** (Dockerfile, build script), **System
documentation** (documents), **Tests**.

Tags: `verified — source|invocation|document|traced`, `author decision`, `inferred`, `assumed` (see the
grounding rule). Requirement ids are `UC-004-nn[-Snn]` in `REQUIREMENTS.md`.

## 1. Current Implementation

Confirmed for this approach only; the Study did the discovery.

| Claim                                                                                                                                                                                                                                      | Tag                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The API is one Express `Router` (`api`) with 43 route registrations, mounted by `index.ts` behind only `express.json()`; no auth, CORS or headers middleware                                                                               | `verified — source` (`server/src/routes/api.ts` exports `api`; `server/src/index.ts` lines `app.use(express.json()); app.use('/api', api);`; `grep -cE "^\s*api\.(get\|post\|put\|patch\|delete)\("` = 43) |
| `api.test.ts` builds its own app with `express.json()` and the bare `api` router, then calls with `fetch`                                                                                                                                  | `verified — source` (`routes/api.test.ts` lines 20-31)                                                                                                                                                     |
| `db()` is a synchronous singleton that opens the file and runs all of `schema.sql` (all `CREATE TABLE IF NOT EXISTS`); `repo/index.ts`, the composition root, calls `db()` at import time                                                  | `verified — source` (`db/index.ts`; `repo/index.ts` `new SeasonRepository(db())`)                                                                                                                          |
| `players` has no email/phone/user link; every player-id column that must move on a merge is listed in `PlayerMergeService`'s `REFERENCES`; the merge deletes the absorbed `players` row, the only `DELETE FROM players` in non-test source | `verified — source` (`db/schema.sql`; `repo/player-merge-service.ts` lines 6-20, 73; grep)                                                                                                                 |
| `DebtRepository.outstanding()` and `PlayerReportService.report(playerId, today)` exist; the report already carries games, season stats and summary for one player id                                                                       | `verified — source` (`repo/debt-repository.ts`, `repo/player-report-service.ts`)                                                                                                                           |
| The web client sends every request through one `call()` in `web/src/api.ts`; `App.tsx` is the whole admin app (five tabs: Partido, Puntos, Deudas, Jugador, Ajustes = `Manage`) with no router                                             | `verified — source` (`web/src/api.ts` line 281; `web/src/App.tsx`)                                                                                                                                         |
| E2E specs call the API directly with `request.get/post/delete` and the server-ready probe is `GET /api/seasons`                                                                                                                            | `verified — source` (`e2e/tests/*.spec.ts`, `e2e/playwright.config.ts`)                                                                                                                                    |
| `server/tsconfig.json` compiles only `src/**` (excluding tests) into `dist`; `server/scripts/` is outside it                                                                                                                               | `verified — source` (`server/tsconfig.json`)                                                                                                                                                               |
| Express 5 exposes a router's registered routes in `router.stack` (`layer.route.path`, `layer.route.methods`)                                                                                                                               | `verified — invocation` (a throwaway script printed `[ '/a/:id', ['get'] ], [ '/b', ['post'] ]`)                                                                                                           |
| SQLite `VACUUM INTO` run on a WAL database with 12 unflushed rows (`-wal` 57 712 bytes, main file 4 096) produced a copy holding all 12 rows; `db.backup` exists in the installed better-sqlite3; SQLite 3.53.4                            | `verified — invocation` (scratch script, this session)                                                                                                                                                     |
| `node:crypto.scryptSync` works on Node v26.8.2                                                                                                                                                                                             | `verified — invocation` (same script)                                                                                                                                                                      |
| `jose` is published at 6.2.12                                                                                                                                                                                                              | `verified — invocation` (`npm view jose version`)                                                                                                                                                          |

Not found anywhere in the code: rate limiting, security headers, a user concept, a migration mechanism,
a `Dockerfile`. `deploy/` holds a systemd unit and a Caddyfile; where and how the app is deployed is out of scope for this work package (author decision).

## 2. High Level Design

### 2.1 Architecture

Physical inventory, by artifact type, then the components derived from it. `(new)` = created, `(mod)` =
modified.

| Unit                                                                                                                                                                                                                                                                                                                          | Type                         | Location                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------- |
| `schema.sql` (mod), `db/index.ts` (mod), `SchemaMigrator` (new), `DatabaseBackup` (new), `test-support.ts` (mod)                                                                                                                                                                                                              | tables, classes              | `server/src/db/`                            |
| `Clock`, `SystemClock`, `PasswordPolicy`, `UsernamePolicy`, `LockoutPolicy`, `PasswordHasher`, `TokenService`, `EffectiveRole`, `ContactValidator`, `OwnDisclosure` (all new; `ManualClock` is test support); `LocalCalendar`, `types.ts` (mod)                                                                               | classes                      | `server/src/domain/`                        |
| `UserRepository`, `RefreshTokenRepository`, `ContactRepository`, `AuthConfig`, `AuthService`, `UserAdminService`, `OwnDataService`, `ContactService`, `PasswordChangeService` (new); `PlayerMergeService`, `DebtRepository`, `PaymentRepository`, `index.ts` (mod)                                                            | classes                      | `server/src/repo/`                          |
| `ApiRoutes`, `Authenticate`, `CookieJar`, `HttpError` + error handler, `SecurityHeaders`, `AuthRouter`, `OwnRouter`, `SessionRouter`, `OwnPlayer`, `ServerApp` (new); `index.ts` (mod); `api.ts` (unchanged)                                                                                                                  | classes                      | `server/src/routes/`, `server/src/index.ts` |
| `UserCli`, `CliIo`, `PasswordPrompt`, `TtyPasswordPrompt`, `main.ts` (new); tool name `pachanguero-admin`                                                                                                                                                                                                                     | classes, entry               | `server/src/cli/`                           |
| `api.ts` (mod), `lib/sessionClient.ts`, `lib/ownDebts.ts` (new), `hooks/useSession.ts`, `hooks/useOwn*.ts` (new), `pages/Login.tsx`, `pages/OwnView.tsx`, `pages/AdminShell.tsx` (new), `App.tsx` (mod), `components/Own*.tsx`, `ContactForm.tsx`, `PasswordForm.tsx`, `ViewSwitch.tsx` (new), `Manage.tsx` (mod: the switch) | components, hooks, functions | `web/src/`                                  |
| `Dockerfile`, `.dockerignore`, `.env.example` (new)                                                                                                                                                                                                                                                                           | infrastructure               | repo root                                   |
| `AGENTS.md`, `README.md`, `docs/test-strategy.md`, `docs/domain-model/glossary.md`, `docs/domain-model/README.md` (mod); `docs/domain-model/usuarios-y-roles.md` (new)                                                                                                                                                        | documents                    | repo                                        |
| `api.test.ts` (kept), new `*.test.ts` per class, `e2e/tests/auth.fixture.ts` (new), `e2e/playwright.config.ts` (mod), the two specs (mod)                                                                                                                                                                                     | test modules, fixture        | `server/src/**`, `e2e/`                     |

Components (each a grouping of the units above; the `Component` vocabulary of the element tables):

| Component              | Units                                                                                               | Responsibility                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schema and backup**  | `server/src/db/*`                                                                                   | the file, its version stamp, migration, consistent copies                                                                                     |
| **Access domain**      | new `server/src/domain/*` classes above                                                             | rules with no SQLite or HTTP: credential policy, lockout, hashing, tokens, effective role, what a player may see of a share, contact validity |
| **Identity services**  | `server/src/repo/*` new + the three modified classes                                                | persistence and use cases for users, tokens, contact data, own data, user administration                                                      |
| **HTTP edge**          | `server/src/routes/*` new, `server/src/index.ts`                                                    | authentication, authorisation by router, cookies, headers, error mapping                                                                      |
| **Operator CLI**       | `server/src/cli/*`                                                                                  | user commands and `backup`, run inside the container                                                                                          |
| **Web session**        | `web/src/api.ts`, `lib/sessionClient.ts`, `hooks/useSession.ts`, `pages/Login.tsx`                  | access token in memory, refresh single-flight, login/logout                                                                                   |
| **Web shells**         | `App.tsx`, `pages/AdminShell.tsx`, `pages/OwnView.tsx`, own-view components/hooks/lib, `ViewSwitch` | which screen a principal gets, the player's own screens                                                                                       |
| **Packaging and docs** | `Dockerfile`, `.dockerignore`, `.env.example`, documents                                            | image, configuration, operator and domain documents                                                                                           |
| **Test support**       | `db/test-support.ts`, `e2e/*` fixture and config                                                    | tokens and logged-in sessions for existing suites                                                                                             |

Logical groupings that do **not** coincide with a component: the two roles and the "view" are a
behaviour spread over Access domain, HTTP edge and Web shells; no component carries them alone.

Diagram: [`components.puml`](design/diagrams/components.puml).

### 2.2 Approach

**What the solution is.** A new, deny-by-default front door on the existing server: the current 43-route
`api` router stays byte-for-byte as it is and is mounted behind an authentication and an admin check,
next to three new routers (public `auth`, session-level, own-data `me`), all composed by a new
`ApiRoutes` in the HTTP edge. Identity lives in new tables behind new Identity services, rules in new
Access-domain classes, JWT access tokens (in memory on the web) plus rotating hashed refresh tokens
(HttpOnly cookie). The database gains a version stamp and a backup-before-migration step (Schema and
backup); users and backups are handled by one Operator CLI. On the web, the current `App` becomes the
admin shell, and a `Root` chooses between login, admin shell and the player's own view.

**Why this shape.**

1. **Authorisation by router membership, not by per-route annotations.** Deny-by-default is structural:
   the final mount is `authenticate → requireEffective('admin') → api`, so an unclassified or new route in
   `api.ts` is admin-only and an unknown path is 401/403 for non-admins. Cost: UC-004-03-S5's wording
   ("every route declared… a route with no declaration fails the suite") is met as: nothing can be
   undeclared (every route belongs to exactly one router) and a test pins the exact route set of the
   public, session and own-data routers, so adding a route outside admin fails the suite. `inferred`;
   confirmation owed (see the end of the document).
2. **Guard mounted outside `api.ts`.** `api.test.ts` keeps passing untouched and the 43 handlers are
   unchanged (study Q-02 decision input). Admin behaviour "exactly as before" (UC-004-03-S3) holds by
   construction: it is the same router object.
3. **A fourth class, _session_, beside public/admin/own-data.** Changing one's password (UC-004-09) and
   switching view (UC-004-11) must work for an admin with no linked player and for an admin who is
   currently in the regular view, so they fit neither "own-data" (needs a player) nor "admin" (refused in
   the regular view). `author decision` needed; flagged below.
4. **The player comes from the database, not the token.** The access token carries `sub` (user id),
   `role`, `view`, `type`, `exp`; own-data routes read `users.player_id` by `sub` on each call, so a merge
   (UC-004-04-S13) cannot leave a token pointing at a deleted player. The 30-minute limit on deactivation
   and demotion (author decision) is unchanged; it is not tightened for this one lookup.
5. **Contact data in a new table `player_contacts`**, not columns on `players` (study Q-05): no `ALTER`
   of an existing table. The migration mechanism is still built (UC-004-10-S5-S7 require a version stamp
   and a backup before a migration), so the next real `ALTER` has a place to go.
6. **No new dependency for passwords:** `node:crypto.scrypt` with a per-user salt and `timingSafeEqual`.
   One dependency for tokens: `jose` (HS256, algorithm pinned on verify; author decision), installed only with the
   author's go-ahead at task time.
7. **CLI inside `server/src/cli/`, not `server/scripts/`** (the requirements' guess): only `src/**` is
   compiled into `dist`, and the production image runs compiled JavaScript with no `tsx`.
8. **Refresh cookie `Path=/api/auth`** rather than `/`, so it is sent only to the routes that use it
   (refresh, logout, view). Compatible with the examples, which are illustrative.
9. **Backup by `VACUUM INTO`** (synchronous, consistent with the WAL, verified above) rather than the
   asynchronous `db.backup`, because the migration runs inside the synchronous `db()` at import time; a
   backup failure throws, so the server does not start (UC-004-10-S5).

Sacrificed: no IP rate limit (only the per-account lockout the requirements specify; a known username can
be locked out by anyone, the cost of the author-accepted disclosure in UC-004-01); no access-token
revocation (author-accepted, 30 minutes).

**Alternatives recorded** (hard to reverse): _where the token lives_ and _authorisation style_ are
decided above and by author decision (Q-13) respectively; the one recorded here is the migration shape.

|               | Contact data as columns of `players` + versioned `ALTER` step                                   | **Chosen:** new `player_contacts` table                     |
| ------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Entails       | first real migration step, backup before it                                                     | `CREATE TABLE IF NOT EXISTS`; merge copies contact          |
| Advantages    | one row per player, simpler reads                                                               | no `ALTER`, migration of the live DB is table creation only |
| Disadvantages | rewrites a 43-player table in a live DB; `schema.sql` must also change the `players` definition | one more join; the merge must move the row                  |
| Risks         | the one step that can really lose data                                                          | none to existing data                                       |
| Scope         | same elements, plus the first `ALTER` test                                                      | same                                                        |

### 2.3 Impacted Units (Component level)

Component grain; rows fill in as each unit's owning element is drafted. Initial rows from 2.1:

| Unit                                                        | Type                      | Location                   | Action        | Notes                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------- | -------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `SchemaMigrator`, `DatabaseBackup`                          | class                     | `server/src/db/`           | Create        | version stamp, backup before migration                                                                                                 |
| `db()`                                                      | function (existing)       | `server/src/db/index.ts`   | Modify        | calls the migrator instead of the bare `exec`                                                                                          |
| `users`, `refresh_tokens`, `player_contacts`                | table                     | `server/src/db/schema.sql` | Create        | no existing table altered                                                                                                              |
| Access-domain classes (10)                                  | class                     | `server/src/domain/`       | Create        | with tests                                                                                                                             |
| Identity services (7 new)                                   | class                     | `server/src/repo/`         | Create        | with tests                                                                                                                             |
| `PlayerMergeService`, `DebtRepository`, `PaymentRepository` | class                     | `server/src/repo/`         | Modify        | merge handles user and contact; two own-data queries                                                                                   |
| `ApiRoutes` and edge classes                                | class                     | `server/src/routes/`       | Create        | `index.ts` Modify                                                                                                                      |
| `UserCli`, `PasswordPrompt`                                 | class                     | `server/src/cli/`          | Create        | entry `main.ts`                                                                                                                        |
| Web session, shells, own view                               | hook, component, function | `web/src/`                 | Create/Modify | `App.tsx` split, `api.ts` `call()`                                                                                                     |
| `Dockerfile`, `.dockerignore`, `.env.example`               | infrastructure            | repo root                  | Create        | the only deployment artefacts (committed fake values, no real secret); compose or k8s manifests are out of scope; `deploy/*` untouched |
| Six documents                                               | document                  | repo                       | Modify/Create | section 4                                                                                                                              |

### 2.4 Interface Specification

Full shapes are written per element in the Low Level Design; the HLD fixes names and classes.

| Route                                                                      | Router      | Rule                                                                 |
| -------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| `POST /api/auth/login`, `/refresh`, `/logout`                              | public      | no token; refresh and logout read the cookie                         |
| `POST /api/auth/view`, `PUT /api/me/password`                              | session     | any verified principal; `view` additionally requires base role admin |
| `GET /api/me/debts`, `/payments`, `/report`, `GET`+`PATCH /api/me/contact` | own-data    | effective role regular, player read from `users`                     |
| all 43 existing routes                                                     | admin       | effective role admin                                                 |
| any other path under `/api`                                                | admin mount | 401 anonymous, 403 regular, 404 admin                                |

Token claims: access `{iss, sub, role, view, type:"access", iat, exp}` (30 min); refresh `{iss, sub, type:"refresh",
jti, iat, exp}` (30 days), stored as SHA-256 of the token string. The random `jti` is required: two
rotations in the same second would otherwise produce identical tokens (`inferred`, same-second `iat`).

Configuration keys (environment): `JWT_SECRET` (required, at least 32 characters, the server refuses to
start without it), `ACCESS_TOKEN_MINUTES` (30), `REFRESH_TOKEN_DAYS` (30), `COOKIE_SECURE` (default:
on when `NODE_ENV=production`), `PACHANGUERO_DB` (existing), `PACHANGUERO_BACKUPS` (directory for backups; default `backups/` next to the database file, so it can be a separate volume readable outside the container). The CLI needs none of the token keys.

Errors from the new routers are `HttpError(status, message)` mapped by a router-level handler to
`{error}` with the status in the requirements (401, 403, 422, 423). The old `route()` behaviour in
`api.ts` is not touched.

### 2.5 Unit Communication

Request path and mount order: [`request-path.puml`](design/diagrams/request-path.puml). Component
dependencies: [`components.puml`](design/diagrams/components.puml). Dependencies point inward: edge →
services → domain/db; the CLI and the edge both call the same `UserAdminService`/`AuthService` layer, so
the lockout, policy and last-admin rules exist once.

Startup order: `repo/index.ts` imports → `db()` → `SchemaMigrator` (backup if migrating; a failure
aborts the process) → repositories built. `AuthConfig` and token-dependent wiring are built in
`server/src/index.ts` from the environment, not at import of `repo/index.ts`, so route tests and the CLI
that import the repositories do not need `JWT_SECRET`.

### 2.6 Refactors

| #   | Refactor                                        | Component         | Units                                                                       | Scenarios                                | Status   | Verification                                                                                                | Mandatory Reading |
| --- | ----------------------------------------------- | ----------------- | --------------------------------------------------------------------------- | ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- | ----------------- |
| R1  | Versioned schema with a backup before migration | Schema and backup | `SchemaMigrator`, `DatabaseBackup`, `db()`, `schema.sql`, `test-support.ts` | UC-004-10-S5, UC-004-10-S6, UC-004-10-S7 | terminal | existing suites pass; fresh and migrated schemas equal; live-data copy counts equal before and after, twice | HLD, R1 LLD       |
| R2  | The admin app becomes one of two shells         | Web shells        | `App.tsx`, `pages/AdminShell.tsx`, new `Root`                               | UC-004-03-S7                             | terminal | E2E specs unchanged and green; admin tabs identical                                                         | HLD, R2 LLD       |

### 2.7 New Functionality

| #   | Feature                                                                                  | Component                                           | Units                                                                                                                                        | Scenarios                                                  | Status   | Verification                                                                                                                                                                                                                         | Mandatory Reading |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| F1  | Accounts and credential rules                                                            | Access domain, Identity services, Schema and backup | `PasswordPolicy`, `LockoutPolicy`, `PasswordHasher`, `UserRepository`, `RefreshTokenRepository`, `users`, `refresh_tokens`                   | UC-004-04-S5, UC-004-01-S2 (count), UC-004-01-S4           | terminal | domain tests; repository tests on `TestDatabase`                                                                                                                                                                                     | HLD, F1 LLD       |
| F2  | Login, refresh and logout                                                                | HTTP edge, Identity services, Access domain         | `AuthConfig`, `TokenService`, `AuthService`, `CookieJar`, `AuthRouter`, `HttpError`                                                          | UC-004-01-S1…S7, UC-004-02-S1, S4…S8                       | terminal | route tests per scenario                                                                                                                                                                                                             | HLD, F2 LLD       |
| F3  | Access guard on the API                                                                  | HTTP edge                                           | `ApiRoutes`, `Authenticate`, `EffectiveRole`, `SecurityHeaders`, `index.ts`                                                                  | UC-004-03-S1…S5, UC-004-11-S2                              | terminal | route sweep over every router's stack; token tables                                                                                                                                                                                  | HLD, F3 LLD       |
| F4  | User administration (CLI and player merge)                                               | Operator CLI, Identity services                     | `UserCli`, `PasswordPrompt`, `UserAdminService`, `PlayerMergeService`                                                                        | UC-004-04-S1…S4, S6…S13                                    | terminal | CLI tests on in-memory DB; merge test                                                                                                                                                                                                | HLD, F4 LLD       |
| F5  | Own debts, payments and statistics                                                       | Identity services, HTTP edge, Access domain         | `OwnDataService`, `OwnDisclosure`, `OwnPlayer`, `DebtRepository`, `PaymentRepository`, `PaymentStat`, `OwnRouter`                            | UC-004-05-S1…S6, UC-004-06-S1…S5, UC-004-07-S1…S6          | terminal | two-players route tests; disclosure tests                                                                                                                                                                                            | HLD, F5 LLD       |
| F6  | Contact data and password change                                                         | Identity services, Access domain, HTTP edge         | `ContactRepository`, `ContactValidator`, `player_contacts`, `ContactService`, `PasswordChangeService`, `OwnRouter`, `SessionRouter`          | UC-004-08-S1…S6, UC-004-09-S1…S5                           | terminal | route tests on the tables                                                                                                                                                                                                            | HLD, F6 LLD       |
| F7  | Switching between admin view and regular view                                            | HTTP edge, Identity services                        | `AuthService.switchView`, `refresh_tokens.view`, `SessionRouter`                                                                             | UC-004-11-S3, S5, S6, S7, S8, S9                           | terminal | route tests incl. refresh keeping the view                                                                                                                                                                                           | HLD, F7 LLD       |
| F8  | Web session, login and logout                                                            | Web session                                         | `api.ts`, `lib/sessionClient.ts`, `hooks/useSession.ts`, `pages/Login.tsx`                                                                   | UC-004-01-S1 (screen), UC-004-02-S1, S2, S3, S6, S8        | terminal | `lib/` test: 3 concurrent 401 → 1 refresh; E2E login                                                                                                                                                                                 | HLD, F8 LLD       |
| F9  | The player's own view                                                                    | Web shells                                          | `pages/OwnView.tsx`, `components/Own*.tsx`, `ContactForm`, `PasswordForm`, `ViewSwitch`, `hooks/useOwn*.ts`, `lib/ownDebts.ts`, `Manage.tsx` | UC-004-03-S6, UC-004-05…09 (screens), UC-004-11-S1, S4, S5 | terminal | `lib/` tests; E2E switch and return                                                                                                                                                                                                  | HLD, F9 LLD       |
| F10 | Database backup command                                                                  | Operator CLI, Schema and backup                     | `UserCli` (`backup`), `DatabaseBackup`                                                                                                       | UC-004-10-S1, S2, S3                                       | terminal | backup of a database with unflushed WAL rows                                                                                                                                                                                         | HLD, F10 LLD      |
| F11 | Dockerfile and `.env.example`, ready for compose or Kubernetes                           | Packaging and docs                                  | `Dockerfile`, `.dockerignore`, `.env.example` (database and backups on two separate volume paths)                                            | — (constraint: Docker, data on a volume)                   | terminal | image builds; container starts, refuses without `JWT_SECRET`, takes all configuration from environment variables, every key of which `.env.example` lists with a fake value, keeps data on a mounted volume, runs the CLI via `exec` | HLD, F11 LLD      |
| F12 | _Retracted: deployment target is out of scope (author decision). Identifier not reused._ | —                                                   | —                                                                                                                                            | —                                                          | —        | —                                                                                                                                                                                                                                    | —                 |
| F13 | Test harness and E2E session fixture                                                     | Test support                                        | `e2e/tests/auth.fixture.ts`, `playwright.config.ts`, both specs, route-test token helper                                                     | UC-004-03-S3                                               | terminal | `npm test` and `npm run test:e2e` green                                                                                                                                                                                              | HLD, F13 LLD      |
| F14 | Documentation for operators and the domain                                               | Packaging and docs                                  | the documents of section 4, including the new `docs/backup_and_restore.md`                                                                   | UC-004-10-S4                                               | terminal | review against the code                                                                                                                                                                                                              | HLD, F14 LLD      |

Every requirement scenario is claimed by at least one element above except UC-004-02-S3's server half
(covered by F2's refresh route) and UC-004-02-S1's server half (F2); both are named in F2's row.

### 2.8 Documentation Impact

From the Study's doc map, stated once; per-document detail in section 4.

- `AGENTS.md`: "no migration system" paragraph (migrations now exist), the Architecture list and
  Commands block (new classes, `pachanguero-admin` commands, required `JWT_SECRET`), the Identity line.
- `README.md`: configuration table (new keys), backup and restore text. The deployment section is left as it is: deployment is out of scope.
- `docs/test-strategy.md`: how route and E2E tests authenticate.
- `docs/backup_and_restore.md` (new, in Spanish like the README): the two kinds of backup, the `backup` command, mounting a separate volume for `PACHANGUERO_BACKUPS` so the copies are readable outside the container (a compose or Kubernetes snippet shown as text only; deployment files stay out of scope), and the manual restore (UC-004-10-S4).
- `docs/domain-model/glossary.md` and `README.md`: user, role, admin, regular, view; index gains
  `usuarios-y-roles.md` (new).
- `deploy/pachanguero.service`: one comment line (it sets `NODE_ENV=production` and so now needs `JWT_SECRET`); `deploy/Caddyfile`: not touched (deployment is out of scope).
- Coding standards: not made untrue; the new code is written to them.

### 2.9 Risks

| Risk                                                                                                                 | Handling                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Locking out the only admin by a mistake, or never creating one                                                       | `create --role admin` documented as the first step; the CLI refuses to deactivate/demote the last active admin (UC-004-04-S11); `JWT_SECRET` check and first-run instructions in `README` (F14)  |
| Migration damages the live data                                                                                      | backup first and refuse to start without it; the migration step runs in one transaction; test on a copy of the live data twice (UC-004-10-S6/S7)                                                 |
| Two tabs refresh at once; the second presents a rotated token and is sent to login                                   | accepted consequence of the author-decided rotation (UC-004-02-S5); single-flight within a tab only                                                                                              |
| `Secure` cookie on plain HTTP (container reached over LAN without TLS) leaves the browser unable to keep the session | `COOKIE_SECURE` override documented; the README states that the cookie needs HTTPS in production                                                                                                 |
| Account lock-out used against a known username                                                                       | accepted in UC-004-01; no IP rate limit added; revisit only if seen                                                                                                                              |
| Authorisation by router membership could be bypassed by a future route added to the wrong router                     | route-set pin tests (UC-004-03-S5); default mount is admin                                                                                                                                       |
| `jose` has a published advisory the offline check cannot see                                                         | its API is `verified — document` (type declarations of 6.2.12); the advisory check (study Q-10) is made at install with the author's go-ahead; `TokenService` keeps the library behind one class |
| Native module (`better-sqlite3`) on the image's architecture                                                         | prebuilds for linux x64 and arm64 ship in the package and load on Node 26 here (`verified — source`/`invocation`); the arm64 run is `inferred`, resolved by building on the Pi (F11 manual plan) |
| Stale `playerId`/role in a still-valid token                                                                         | player read from `users`; role and view in token only; 30-minute limit is author-accepted                                                                                                        |

**Detector results (all four run).**

- **D1 Grounding:** section 1 holds every claim about what exists with a citation. Claims about behaviour
  that does not exist yet are decisions (`inferred`/`author decision`) or listed above as `assumed`.
  Result: the claims still `assumed` are listed in D2; each has a named check and none blocks a decision.
- **D2 Assumption register:** (a) `jose` advisories at install time — checked then; (b) the arm64 run of
  the image — `inferred`, built on the Pi; (b2) Playwright cookie sharing (F13), echo-free password entry
  (F4), the official image's `node` user (F11), scrypt time on the Pi (F1) — `assumed`, each with its check
  in that element's plan; (c) Pi versus registry deployment and TLS end — ruled out of scope by the author;
  (d) `inferred` S5 reinterpretation, the _session_ class, `Path=/api/auth`, `scrypt` — owed to the author;
  (e) live-data counts (43/53/67/2) — `verified — invocation` in the requirements, re-run on the actual
  copy at implementation. Findings converted to confirmations owed below; no deferral remains.
- **D3 Breakdown reachability:** every part has named units (2.1) and every element names its units; no
  "figure out X" part. Result: nothing found.
- **D4 Pre-mortem per element:** R1 — a legacy DB with `user_version` already set by something else
  (finding: the migrator treats an unknown non-zero version as an error and refuses to start; to be
  specified in LLD). R2 — `App` state (season, games) moving under a conditional render would remount and
  refetch (finding: the admin shell owns that state, `Root` owns only the session). F1 — scrypt cost too
  high for the Pi (finding: the cost parameters get a timing check on target hardware, carried to the LLD
  as a deferral R1 if needed). F2 — time comparison for unknown usernames (finding: verify against a
  dummy hash). F3 — Express 5 path patterns in the sweep (`:id` substitution; verified shape above).
  F4 — password read without echo when stdin is not a TTY (tests inject `PasswordPrompt`). F5 — a guest's
  host name leaking through another route (finding: the DTO is built only by `OwnDisclosure`). F8 —
  retry loops when refresh itself returns 401 (finding: refresh calls bypass the retry wrapper). F11 —
  data written into the image layer instead of the volume (finding: DB path under the volume, test that a
  container recreate keeps the data).

### 2.10 Test Methodology

Per `docs/test-strategy.md`: domain classes get unit tests (`server/src/domain/*.test.ts`); every route
and CLI command gets integration tests against a real SQLite built from `schema.sql`
(`routes/*.test.ts`, `repo/*.test.ts`, `cli/*.test.ts`), never a mocked database; web calculations get
`lib/` tests; the few user journeys (login, view switch, own screens) get E2E. Existing suites stay
green; `api.test.ts` is unchanged because the guard is outside `api.ts`; the E2E specs log in through a
new fixture (no auth-off flag).

| #   | Element                       | Fully automatable? | Manual verification needed                                       |
| --- | ----------------------------- | ------------------ | ---------------------------------------------------------------- |
| R1  | Versioned schema with backup  | Yes                | —                                                                |
| R2  | Shells                        | Yes                | —                                                                |
| F1  | Accounts and credential rules | Yes                | scrypt time on the Pi: hash one password and read the time (LLD) |
| F2  | Login, refresh, logout        | Yes                | —                                                                |
| F3  | Access guard                  | Yes                | —                                                                |
| F4  | User administration           | Yes                | echo-free password entry in a real terminal                      |
| F5  | Own data                      | Yes                | —                                                                |
| F6  | Contact and password          | Yes                | —                                                                |
| F7  | View switch                   | Yes                | —                                                                |
| F8  | Web session                   | Yes                | —                                                                |
| F9  | Own view                      | Yes                | the Spanish copy and layout on a phone width (LLD guidelines)    |
| F10 | Backup                        | Yes                | restore by hand on a copy (UC-004-10-S4)                         |
| F11 | Docker image                  | Partly             | build and run the container; recreate it and see the data stay   |
| F13 | Test harness                  | Yes                | —                                                                |
| F14 | Documentation                 | No                 | read against the code                                            |

Manual-test guidelines for each `No`/partial are written in that element's LLD.

### 2.11 Patterns and Conventions

- **Server:** objects with behaviour, no free functions, no stateless statics, SOLID
  (`.agents/rules/coding-standard.md`). Strategy-like injection of `PasswordPrompt` and the clock;
  `TokenService` and `PasswordHasher` behind narrow interfaces (DIP) so tests need no library; repositories
  convert rows to domain types as the existing ones do; composition in `repo/index.ts` (repositories) and
  `server/src/index.ts` (secret-dependent wiring).
- **Routes:** thin handlers, errors as `HttpError`, no logic beyond translating a request to a service call.
- **Web:** function components and hooks, data access in a hook, pure calculation in `lib/`, `api.ts`
  as the only seam (`.agents/rules/frontend-coding-standard.md`); the two shells fill the same slot and take
  compatible props (Liskov, §5 of that standard).
- **Database:** `CREATE TABLE IF NOT EXISTS` for new tables, snake_case, integer cents (unchanged), an
  explicit version stamp for the first time.
- **Naming:** UI and messages in Spanish; code, columns and routes in English.

## 3. Low Level Design

One `#### <id> — <name>` subsection per element, each with the same seven parts. Examples are worked by
hand and marked `not yet run`.

#### R1 — Versioned schema with a backup before migration

**Current Implementation**

| Claim                                                                                                                                                                                                                                                                                                                                              | Tag                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db()` opens the file, sets `foreign_keys = ON`, and runs all of `schema.sql` on every first call; `tx()` has no caller outside `db/index.ts`                                                                                                                                                                                                      | `verified — source` (`server/src/db/index.ts` lines 14-26; `grep -rn "\btx\b" src` finds none elsewhere)                                                                                 |
| Consumers of `db()`: `src/index.ts:27`, every `new …(db())` line of `repo/index.ts` (so it runs at import), and `TestDatabase` builds its own connection from `schema.sql`                                                                                                                                                                         | `verified — source` (`grep "db()"` over `src` and `scripts`: only `src/index.ts`, `src/db/index.ts`, `src/repo/index.ts`; `scripts/import-season.ts` reaches it through `repo/index.js`) |
| `schema.sql` starts with `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`                                                                                                                                                                                                                                                                    | `verified — source` (`schema.sql` lines 1-2)                                                                                                                                             |
| The live database has `user_version` 0, WAL journal, 43 players, 53 games, 67 payments, 2 debts                                                                                                                                                                                                                                                    | `verified — invocation` (scratch script on a copy of `data/pachanguero.db`)                                                                                                              |
| Running the whole of `schema.sql` between `BEGIN` and `COMMIT` on that copy, plus `PRAGMA user_version = 1`, succeeds; the version persists and `foreign_keys` stays 1                                                                                                                                                                             | `verified — invocation` (same script)                                                                                                                                                    |
| `VACUUM INTO` copies a WAL database with its unflushed rows; the copy gets the process umask (`644` seen); it raised no error when the target was an existing 1-byte file (so it cannot be trusted to refuse an existing target); it fails with `SQLITE_CANTOPEN` and leaves nothing in an unwritable directory; a `'` in the path must be doubled | `verified — invocation` (scratch scripts, this session)                                                                                                                                  |
| `PRAGMA user_version = ?` cannot be parameterised; `transaction(fn).immediate()` exists                                                                                                                                                                                                                                                            | `verified — invocation` (same)                                                                                                                                                           |
| `LocalCalendar` has only `dateOf`; no clock abstraction exists                                                                                                                                                                                                                                                                                     | `verified — source` (`domain/local-calendar.ts`; `grep "new Date()"` over `src` finds ad-hoc `new Date()` calls and no `Clock`)                                                          |
| 22 files reference `TestDatabase` (tests, `test-support.ts`, `game-flow-test-support.ts`)                                                                                                                                                                                                                                                          | `verified — source` (`grep -rln TestDatabase src`)                                                                                                                                       |

**Approach**

Delta only. `db()` stops running `schema.sql` directly and instead runs a `SchemaMigrator` on the open
connection. The migrator reads `PRAGMA user_version` and the presence of the `players` table:

| State found                                                                | Action                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_version` greater than the latest known                               | refuse: `La base de datos es de una versión más nueva (N) que esta aplicación (M)`; nothing touched                                                                                                                                                                               |
| no `players` table (new file)                                              | run `schema.sql`; stamp the latest version; **no backup**                                                                                                                                                                                                                         |
| version equals the latest                                                  | run `schema.sql` (idempotent, as today); no backup                                                                                                                                                                                                                                |
| `players` exists and version below the latest (a legacy file is version 0) | create the backup `…-before-migration.db` **first**; if it fails, throw and change nothing; then, in one `IMMEDIATE` transaction, re-read the version (a second process may have migrated), run `schema.sql`, run each `MigrationStep` above the stored version, stamp the latest |

`LATEST = 1`; `steps` is empty: version 1 is "schema.sql plus the version stamp", whose only visible
effect on the live data is the new, empty tables of this work package. The first real `ALTER` later
adds a `MigrationStep` and raises `LATEST`, and updates `schema.sql` to the final shape.

`DatabaseBackup.create(label)` writes one consistent copy with `VACUUM INTO`: ensure the backups
directory (`PACHANGUERO_BACKUPS`, else `<dir of the database>/backups`; mode `0700` when the
application creates it, a mounted volume keeps the mode it has), choose a name that does not exist
(`pachanguero-YYYYMMDD-HHMMSS[-label].db`, then `-2`, `-3`… on a clash), write to `<name>.part`
(removing any stale one first), `chmod 0600`, rename, and delete the `.part` on any failure; return
the final path. It never overwrites. Sequence and naming are exactly what UC-004-10-S1/S5 specify.

Hand-worked (`not yet run`): clock `2026-10-11 19:30:00`, legacy file: backup
`data/backups/pachanguero-20261011-193000-before-migration.db`; version 0 → 1; a second start: version
1, no new file.

Edge cases this element handles (from the pre-mortem): a crash after the backup but before the commit
leaves version 0, so the next start makes another backup and migrates (an extra file, harmless); two
processes starting together (server and CLI) cannot both migrate (the `IMMEDIATE` re-check); a backup
name clash never overwrites; the backup directory may be another mount (the copy is written and renamed inside it, so the rename never crosses file systems); an in-memory connection has no file to back up and is only ever "fresh".

**Impacted Units**

| Unit                                                                              | File                                  | Change                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Clock`, `SystemClock`                                                            | `server/src/domain/clock.ts`          | create: `interface Clock { now(): Date }`, `SystemClock` returns `new Date()`                                                                                                                                                                                                                                                    |
| `LocalCalendar.timestampOf(d: Date): string`                                      | `server/src/domain/local-calendar.ts` | modify: add `'YYYYMMDD-HHMMSS'` (local time, same padding helper)                                                                                                                                                                                                                                                                |
| `MigrationBackup`, `MigrationStep`, `SchemaMigrator` (`run(): void`)              | `server/src/db/schema-migrator.ts`    | create                                                                                                                                                                                                                                                                                                                           |
| `DatabaseBackup` (`create(label?: string): string`), implements `MigrationBackup` | `server/src/db/database-backup.ts`    | create                                                                                                                                                                                                                                                                                                                           |
| `db()`                                                                            | `server/src/db/index.ts`              | modify: build the migrator with `new DatabaseBackup(instance, BACKUP_DIR, new SystemClock(), new LocalCalendar())`, where `BACKUP_DIR = resolve(process.env.PACHANGUERO_BACKUPS ?? join(dirname(DB_PATH), 'backups'))` is exported next to `DB_PATH`, `readFileSync(schema.sql)`, `LATEST`, `[]`; call `run()` instead of `exec` |
| `TestDatabase.create()`                                                           | `server/src/db/test-support.ts`       | modify: use the migrator with a backup that throws (a new database must never need one), so tests exercise the same path and the version is stamped                                                                                                                                                                              |

**Test Methodology**

Per HLD 2.10 (integration, real SQLite, no mocks). `server/src/db/schema-migrator.test.ts`, on files in
a temp directory:

| Test                                                                                                                                                                                                                                                                                                                                                          | Scenario                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| a new file ends at `LATEST`, has the tables, and the backups directory does not exist                                                                                                                                                                                                                                                                         | UC-004-10-S5 (negative: no backup when nothing to migrate) |
| a copy of the schema before this work package (fixture `server/src/db/fixtures/schema-v0.sql`, a copy of `schema.sql` at commit `58e2049`) filled with rows in `players`, `games`, `payments`, `share_debts`, `participations`, `convocatorias`, started with the migrator: row counts, amounts, dates, payers and game states are identical before and after | UC-004-10-S6                                               |
| the same file started twice: one `…-before-migration.db` exists, and the stamp is `LATEST`                                                                                                                                                                                                                                                                    | UC-004-10-S5, S7                                           |
| the backup opens as a database holding the same rows as the file before migration                                                                                                                                                                                                                                                                             | UC-004-10-S5                                               |
| the backup object throws: the version stays 0, no new table exists, the error reaches the caller                                                                                                                                                                                                                                                              | UC-004-10-S5 (does not migrate, does not start)            |
| `user_version` above `LATEST` is refused, nothing changed                                                                                                                                                                                                                                                                                                     | pre-mortem                                                 |
| `sqlite_master` of a new file equals that of the migrated legacy file (names and SQL)                                                                                                                                                                                                                                                                         | study Q-05                                                 |

`server/src/db/database-backup.test.ts`: name pattern and label for a fixed clock; the directory given by `PACHANGUERO_BACKUPS` is used instead of the default; directory `0700` and
file `0600`; the copy holds rows still only in the WAL (`wal_autocheckpoint = 0`, then check the `-wal`
file is non-empty before copying); an existing target is never overwritten (`-2`); an unwritable
directory throws and leaves no `.part`; a stale `.part` is replaced. The disk-full case (UC-004-10-S3)
is simulated by the unwritable directory (`inferred`: both fail inside `VACUUM INTO` with a thrown
error and leave no final file).

One-off check at implementation, not a repeatable test: copy `data/pachanguero.db` (with its `-wal` and
`-shm`) to a scratch directory, start the server on it with `PACHANGUERO_DB`, and compare the counts
43/53/67/2 and the `…-before-migration.db` file; start again and see no second file. Fully automatable
otherwise (HLD 2.10: Yes).

**Data Contract Verification**

| Stored                                                                                           | Written by                                                                                                     | Read by                                                                    | Shape                                                                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `PRAGMA user_version` (integer in the file header)                                               | `SchemaMigrator` (`pragma('user_version = ' + LATEST)`, an integer literal because it cannot be parameterised) | `SchemaMigrator.run` (`pragma('user_version', { simple: true })`)          | 0 for every file written before this work package (verified on the live copy), `LATEST` after |
| `<PACHANGUERO_BACKUPS, else db dir/backups>/pachanguero-<YYYYMMDD-HHMMSS>[-before-migration].db` | `DatabaseBackup.create`                                                                                        | the operator (restore by hand, F14); `sqlite3`/`better-sqlite3` opening it | a complete SQLite file, mode `0600`                                                           |

No user-editable data. A file with a user_version other than an integer cannot occur (SQLite stores
integers). Create/read/update/delete: only create (backups are never deleted by the application,
author decision).

**Patterns and Conventions**

Dependency inversion: `SchemaMigrator` depends on the `MigrationBackup` and `MigrationStep` interfaces
(a future migration is a new class in the `steps` array, no branch added), `DatabaseBackup` on `Clock`.
Classes with no free functions or stateless statics (`.agents/rules/coding-standard.md`); `db()` and
`tx()` already exist as functions and are only edited. Messages in Spanish.

**File Changes**

- Modify: `server/src/db/index.ts`, `server/src/db/test-support.ts`, `server/src/domain/local-calendar.ts`.
- Create: `server/src/domain/clock.ts`, `server/src/db/schema-migrator.ts`, `server/src/db/database-backup.ts`,
  `server/src/db/fixtures/schema-v0.sql`.
- Delete: none. Migrate: none (the live file is migrated by starting the server).
- Tests: `server/src/db/schema-migrator.test.ts`, `server/src/db/database-backup.test.ts`,
  `server/src/domain/local-calendar.test.ts` (the new method).

#### F1 — Accounts and credential rules

**Current Implementation**

| Claim                                                                                                                                                                                                                                                                                                   | Tag                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| No user, role or credential concept exists; `schema.sql` has no `users` or token table; `domain/types.ts` holds shared domain types                                                                                                                                                                     | `verified — source` (`db/schema.sql`; `grep -ril "password\|username" server/src` finds nothing)                                      |
| Repositories take a `Database.Database`, convert rows to camelCase domain shapes, and are tested against `TestDatabase.create()`; services take the connection too                                                                                                                                      | `verified — source` (`repo/player-repository.ts`, `repo/payment-repository.ts`, `repo/payment-service.test.ts` via `GameFlow`)        |
| The reference's policy: 12+ characters, an uppercase letter, a lowercase letter, a digit, and one of `!@#$%^&*()_+-=[]{}\|;':",./<>?`; every violated rule is reported                                                                                                                                  | `verified — document` (`trading-monolith/docs/administration.md`, "Password Policy")                                                  |
| The reference counts a failed attempt, locks at the 5th for 15 minutes, but does not save the incremented count in the locking branch (the stored count stays 4), so after the lock expires one wrong password locks again; it resets count and lock on success; it reports remaining time rounded down | `verified — source` (`auth_service.py` `authenticate_user` lines 53-76; `user_repository.py` `lock_account`, `reset_failed_attempts`) |
| `scrypt` with N=2^15, r=8, p=1 takes about 377 ms on this 8-core machine; N=2^14 188 ms, 2^16 701 ms, 2^17 1 358 ms; N=2^15 needs a `maxmem` above the 32 MiB default or Node throws `memory limit exceeded`                                                                                            | `verified — invocation` (scratch script, this session)                                                                                |
| `scrypt` has an asynchronous form that runs in the thread pool (`crypto.scrypt`), so a login does not block the event loop                                                                                                                                                                              | `inferred` from the Node API (not exercised here); the hasher's tests call it                                                         |

**Approach**

Delta only. Three groups of units.

_Rules (domain, no I/O):_

- `PasswordPolicy.violations(password): PasswordRule[]` returns every failed rule among `length`,
  `uppercase`, `lowercase`, `digit`, `special` (the reference's set, author decision UC-004-04); empty
  means compliant. `PasswordPolicy.describe(rule): string` gives the Spanish sentence the CLI and the
  API show.
- `UsernamePolicy.normalise(raw)`: trim and lower-case; `isValid(username)`: `^[a-z0-9][a-z0-9._-]{2,31}$`.
  Usernames are stored normalised, so lookups need no collation. `inferred`: the requirements fix only
  "a username"; this keeps `Carlos` and `carlos` one account.
- `LockoutPolicy` with constants 5 attempts and 15 minutes (UC-004-01, author decision):
  `isLocked(lockedUntil, now)`, `minutesLeft(lockedUntil, now)` (rounded **up**, at least 1 while
  locked), `exhausted(failedAttempts)` (5 or more), `lockUntil(now)` (`now + 15 min`) and
  `attemptsAfterExpiry()` (4). **The count is kept when the lock is applied and is not cleared when
  the lock expires**: when an expired lock is found, the count restarts at 4, so exactly one more wrong
  password locks again; only a correct login, `unlock` or `reset-pwd` clears it. This matches what the reference does in effect and is the stricter reading of
  UC-004-01-S4/S5 (96 guesses a day per account at most, against 480). `inferred` from the reference;
  confirmation owed.
- `PasswordHasher` (`async hash(password): Promise<string>`, `async verify(password, stored):
Promise<boolean>`, `async burn(password): Promise<void>`): `node:crypto.scrypt`, 16-byte random salt,
  64-byte key, parameters N=2^15, r=8, p=1 and `maxmem` of 64 MiB. Stored form
  `scrypt$<N>$<r>$<p>$<salt base64>$<key base64>`; `verify` reads the parameters from the stored string
  (so raising the cost later does not break old hashes), compares with `timingSafeEqual`, and returns
  `false` for any malformed string. `burn` hashes the password against a dummy of the same cost so a
  login for an unknown username takes comparable time (UC-004-01-S3). The cost is a constructor
  argument; tests pass N=2^10.

_Storage (db and repositories):_ two tables and two repositories.

```sql
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  username        TEXT    NOT NULL UNIQUE,
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK (role IN ('admin','regular')),
  player_id       INTEGER UNIQUE REFERENCES players(id),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (role = 'admin' OR player_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  view       TEXT    NOT NULL DEFAULT 'admin' CHECK (view IN ('admin','regular')),
  expires_at TEXT    NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
```

`users.player_id` has no `ON DELETE` action, so deleting a player who has a user fails instead of
silently removing the account (the merge moves the link first, F4). `locked_until`, `expires_at` and
`last_login` are ISO-8601 UTC text written by `Date.toISOString()` (sorts as text, compared in code
with the injected `Clock`); `created_at` keeps the file's `datetime('now')` convention.

- `UserRepository` (SQL only, rules stay in the services): `create({username, passwordHash, role,
playerId})`, `byId`, `byUsername(normalised)`, `byPlayer(playerId)`, `list()`,
  `reserveAttempt(id, now, countAfterExpiredLock)` (**one** `UPDATE … RETURNING` that increments the
  failure count, first resetting it to `countAfterExpiredLock` and clearing the lock if the lock has
  expired, and returns the new count and lock), `lockUntil(id, until)`, `recordSuccess(id, at)`,
  `clearLock(id)`, `setPasswordHash(id, hash)`,
  `setActive(id, active)`, `setRole(id, role)`, `activeAdminCount()`. It returns `UserRecord`
  `{ id, username, passwordHash, role, playerId, active, failedAttempts, lockedUntil: Date | null,
lastLogin: Date | null }`; `Role` (`'admin' | 'regular'`) is added to `domain/types.ts`. A
  `locked_until` that does not parse is read as locked until further notice (fail closed).
- `RefreshTokenRepository`: `insert({userId, tokenHash, view, expiresAt})`, `findByHash(hash)`,
  `revokeIfLive(id): boolean` (an `UPDATE … WHERE id = ? AND revoked = 0`, true when one row changed, so
  a token cannot be rotated twice), `revokeAllFor(userId): number`, `setView(id, view)`,
  `purge(now)` (deletes rows that expired, or were revoked more than a day ago, so rotation every 30
  minutes does not grow the table without bound).

Not in this element: `player_contacts` (F6), the token string and its SHA-256 (F2), the use cases that
combine these (F2, F4).

Pre-mortem findings carried into the units: scrypt cost on the Raspberry Pi is unmeasured (a manual
check below; the cost lives in the stored string, so it can be changed without a migration);
concurrent logins each hold about 32 MiB and four thread-pool slots, so an attacker without an IP limit
can slow the server (accepted, same as the lock-out risk in HLD 2.9).

**Impacted Units**

| Unit                                        | File                                          | Change                                 |
| ------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| `PasswordPolicy`, `PasswordRule`            | `server/src/domain/password-policy.ts`        | create                                 |
| `UsernamePolicy`                            | `server/src/domain/username-policy.ts`        | create                                 |
| `LockoutPolicy`                             | `server/src/domain/lockout-policy.ts`         | create                                 |
| `PasswordHasher`                            | `server/src/domain/password-hasher.ts`        | create                                 |
| `Role`                                      | `server/src/domain/types.ts`                  | modify: add the type                   |
| `users`, `refresh_tokens`, index            | `server/src/db/schema.sql`                    | modify: append                         |
| `UserRepository`, `UserRecord`              | `server/src/repo/user-repository.ts`          | create                                 |
| `RefreshTokenRepository`, `RefreshTokenRow` | `server/src/repo/refresh-token-repository.ts` | create                                 |
| exports `users`, `refreshTokens`            | `server/src/repo/index.ts`                    | modify: construct the two repositories |

**Test Methodology**

Per HLD 2.10. Domain unit tests, then repository tests on `TestDatabase.create()`.

| Test file                                       | Cases (scenario)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `password-policy.test.ts`                       | the five outline rows of UC-004-04-S5 / UC-004-09-S4, each failing **only** its rule (worked by hand: `Gol-7` length; `gol-del-miercoles7` uppercase; `GOL-DEL-MIERCOLES7` lowercase; `Gol-del-miercoles` digit; `Goldelmiercoles77` special); `Gol-del-Miercoles7` and `Penalti-en-Mayo42` pass; a password failing two rules lists both                                                                                                                                                                                                       |
| `username-policy.test.ts`                       | `Carlos ` → `carlos`; too short, too long, spaces, `@` rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lockout-policy.test.ts`                        | `exhausted` false at 4 and true at 5; `lockUntil` is now + 15 min (UC-004-01-S4); `isLocked`, `minutesLeft` 10 at 10 minutes left, rounded up (S5); `attemptsAfterExpiry` 4                                                                                                                                                                                                                                                                                                                                                                     |
| `password-hasher.test.ts`                       | round trip; wrong password false; two hashes of one password differ; the stored form has six `$` fields; a hash made at one cost verifies with a hasher configured for another; a malformed stored string returns false; `burn` resolves                                                                                                                                                                                                                                                                                                        |
| `user-repository.test.ts`                       | create and read back with `lockedUntil` round-tripping as a `Date`; duplicate username, duplicate player, a regular user without a player, an unknown role all rejected by the schema (UC-004-04-S2/S3/S4 at the storage level); `reserveAttempt` (counts up from 0; an expired lock restarts the count at the given value and clears the lock; a live lock is kept; two calls in a row give consecutive counts), `lockUntil`, `recordSuccess`, `clearLock`; `activeAdminCount` ignores inactive admins; a player with a user cannot be deleted |
| `refresh-token-repository.test.ts`              | insert and find by hash; `revokeIfLive` true once then false; `revokeAllFor` count; `setView`; `purge` removes expired and old revoked, keeps live; user delete cascades                                                                                                                                                                                                                                                                                                                                                                        |
| `schema-migrator.test.ts` (R1's file, extended) | after migrating the legacy fixture the new tables exist and are empty (UC-004-10-S6, last clause)                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Manual (HLD 2.10, F1 row): once F4 exists, run `create` on the Raspberry Pi and read the time taken by
the hashing. What to observe: elapsed time of the password step. Acceptable up to about one second; if
it is above, lower N to 2^14 (the constructor argument) and note it. State that must persist: the hash
in `users.password_hash` verifies afterwards at the new cost as well as the old.

**Data Contract Verification**

| Stored                                                          | Written by                                                                   | Read by                                                               | Shape / handling                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `users.password_hash`                                           | `UserRepository.create`, `setPasswordHash` (hash from `PasswordHasher.hash`) | `PasswordHasher.verify` via `AuthService`/`UserAdminService` (F2, F4) | `scrypt$N$r$p$salt$key`; `verify` parses every field and returns false on any malformed value            |
| `users.locked_until`, `last_login`, `refresh_tokens.expires_at` | repositories (`toISOString()`)                                               | repositories (`new Date(text)`), compared in code                     | ISO UTC text; an unparsable `locked_until` is treated as locked; the others are written only by our code |
| `users.role`, `refresh_tokens.view`                             | repositories                                                                 | `EffectiveRole` (F3)                                                  | closed set enforced by `CHECK` and by the `Role` type                                                    |
| `users.player_id`                                               | `create` (CLI, F4), merge (F4)                                               | own-data services (F5), `AuthService`                                 | `INTEGER` or null; unique; `CHECK` ties it to the regular role                                           |

Create/read/update/delete: users are created and changed only through `UserAdminService` and
`AuthService`; there is no web edit and no delete (author decision UC-004-04). Refresh-token rows are
created by login/refresh, revoked by logout, rotation, password change, deactivation and `reset-pwd`,
and deleted only by `purge`. Mismatch found: the requirements' schema example kept `revoked` without a
`CHECK`; the design adds `CHECK (revoked IN (0,1))` so a stray value cannot read as live.

**Patterns and Conventions**

A policy that is an instance with named rules, not a static (the
coding standard); repositories hold SQL only and return domain shapes, as the existing ones do;
`Clock` injected where time matters; `PasswordHasher` has a constructor-argument cost (strategy by
parameter, no subclass); Spanish text lives in `describe`, not in the rule logic. Tests follow
`docs/test-strategy.md` (no mocked database).

**File Changes**

- Modify: `server/src/db/schema.sql`, `server/src/domain/types.ts`, `server/src/repo/index.ts`.
- Create: `server/src/domain/{password-policy,username-policy,lockout-policy,password-hasher}.ts`,
  `server/src/repo/{user-repository,refresh-token-repository}.ts`.
- Delete: none. Migrate: none beyond the new tables, which R1's migrator creates on the live file.
- Tests: `server/src/domain/{password-policy,username-policy,lockout-policy,password-hasher}.test.ts`,
  `server/src/repo/{user-repository,refresh-token-repository}.test.ts`, and the added case in
  `server/src/db/schema-migrator.test.ts`.

#### F2 — Login, refresh and logout

**Current Implementation**

| Claim                                                                                                                                                                                                                                                                                                                                           | Tag                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing in the server issues, reads or checks a token; `index.ts` mounts `api` behind `express.json()` only                                                                                                                                                                                                                                     | `verified — source` (`server/src/index.ts`)                                                                                                                                                                                                   |
| `jose` 6.2.12 exports `SignJWT` (`setProtectedHeader`, `setSubject`, `setJti`, `setIssuedAt`, `setExpirationTime(number \| string \| Date)`, `sign(key)`) and `jwtVerify(jwt, key, options)` with `algorithms`, `currentDate`, `requiredClaims`, `typ`; the key may be a `Uint8Array` secret; unsecured `alg: "none"` tokens are never accepted | `verified — document` (the published type declarations of the 6.2.12 tarball, `dist/types/jwt/sign.d.ts`, `verify.d.ts`, `types.d.ts` lines 253, 506-525, 695-735; read from `npm pack` in a scratch directory, not installed in the project) |
| `jose` has no runtime dependencies and exports typed errors (`JWTExpired`, `JWSSignatureVerificationFailed`, `JWTClaimValidationFailed`, `JWTInvalid`, `JOSEAlgNotAllowed`)                                                                                                                                                                     | `verified — invocation` (`npm view jose` shows no `dependencies`; `dist/types/util/errors.d.ts`)                                                                                                                                              |
| Express 5.2.1 sends a rejected promise from an async handler to the error middleware of its router (here with `status` 418 and a JSON body)                                                                                                                                                                                                     | `verified — invocation` (scratch script)                                                                                                                                                                                                      |
| `PlayerRepository.nameOf(id)` exists and is used by the merge                                                                                                                                                                                                                                                                                   | `verified — source` (`repo/player-merge-service.ts` lines 33-34)                                                                                                                                                                              |
| The reference rotates the refresh token on refresh, stores it hashed with a revoked flag, and answers 401 for a reused one                                                                                                                                                                                                                      | `verified — source` (`auth_service.py` `refresh_access_token`, as recorded in the requirements)                                                                                                                                               |

**Approach**

Delta only. A login is checked, a pair of tokens is issued, and the refresh token rotates.

_Domain._ `TokenService` (`domain/token-service.ts`) wraps `jose` and nothing else knows the library.
It is built with the secret (a `Uint8Array`) and the two lifetimes.

```ts
export interface AccessClaims {
  userId: number;
  role: Role;
  view: View;
}
export interface RefreshClaims {
  userId: number;
  jti: string;
}
class TokenService {
  issueAccess(claims: AccessClaims, now: Date): Promise<string>; // HS256, iss "pachanguero", type "access"
  issueRefresh(
    userId: number,
    now: Date
  ): Promise<{ token: string; expiresAt: Date }>; // type "refresh", random jti
  verifyAccess(token: string, now: Date): Promise<AccessClaims>; // throws InvalidTokenError
  verifyRefresh(token: string, now: Date): Promise<RefreshClaims>;
  hashOf(token: string): string; // sha-256, hex
}
```

`verify*` call `jwtVerify(token, secret, { algorithms: ['HS256'], issuer: 'pachanguero', currentDate:
now, requiredClaims: ['exp','iat','sub','type'] })` and then require `type` to be the expected one and
`sub` to be a positive integer string, `role` and `view` to be members of their sets. Any failure is
one `InvalidTokenError` with no detail (the caller answers 401). `Role` already exists (F1); `View`
(`'admin' | 'regular'`) is added to `domain/types.ts`. `jti` is `crypto.randomUUID()`.

_Configuration._ `AuthConfig` (`repo/auth-config.ts`) with named constructors `fromEnv(env)` and
`of(values)`: `jwtSecret` (from `JWT_SECRET`, at least 32 characters, otherwise it throws and the
server does not start), `accessSeconds` (`ACCESS_TOKEN_MINUTES`, 30), `refreshSeconds`
(`REFRESH_TOKEN_DAYS`, 30), `cookieSecure` (`COOKIE_SECURE`, default `NODE_ENV === 'production'`).

_Use cases._ `AuthService` (`repo/auth-service.ts`) takes `UserRepository`, `RefreshTokenRepository`,
`PlayerRepository`, `PasswordHasher`, `TokenService`, `LockoutPolicy`, `Clock`, `AuthConfig` and the
connection. It returns

```ts
interface SessionUser {
  username: string;
  role: Role;
  mode: Role;
  playerName: string | null;
  canSwitchView: boolean;
}
interface Session {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: SessionUser;
}
```

`mode` is the effective role (`EffectiveRole`, F3), what the web uses to choose a screen.

- `login(username, password)`:
  1. normalise the username; unknown **or inactive** user: `await hasher.burn(password)`, then 401
     "usuario o contraseña incorrectos" (S3, S7: the same body and comparable time);
  2. locked (`lockedUntil` in the future): **423** `{error, lockedMinutes}` without checking the
     password and without changing the count (S5);
  3. **reserve the attempt before verifying**: `users.reserveAttempt(id, now, lockout.attemptsAfterExpiry())`
     increments the failure count in one SQL statement and returns the new count and lock; if that
     count is above 5 (parallel guesses beyond the limit) the lock is set if absent and the answer is
     423; otherwise `hasher.verify`;
  4. wrong password: if the count reached 5, `users.lockUntil(id, lockout.lockUntil(now))` and 423 (S4),
     else 401 (S2, count now 1 for a first failure);
  5. correct: `users.recordSuccess(id, now)` (count 0, no lock, `last_login`; S6), `refreshTokens.purge(now)`,
     issue the pair with view `'admin'`, store the refresh hash, return the session (S1).

  Reserving first means a burst of parallel guesses cannot all be tried before the lock lands: each
  one consumes an attempt in the database before its expensive check. This was found in the
  pre-mortem; checking the count and then writing it after the check would let N concurrent requests
  each see "0 failures". F1's repository and policy are amended accordingly (see F1).

- `refresh(token)`: `verifyRefresh`; find the row by `hashOf`; refuse (one 401 for all causes) when it
  is missing, revoked or expired, or its user is missing or inactive (S7); then, in one
  `conn.transaction`, `revokeIfLive(row.id)` (false → 401) and insert the new row with the **same
  view** and the new expiry (S4); return the session whose access token carries that view.
- `logout(token | undefined)`: if the token verifies and its row exists, revoke it; never throws (S8
  idempotent).

_HTTP._ `AuthRouter` (`routes/auth-router.ts`, `router(): Router`): `POST /login` (body
`{username, password}`, both strings of at most 1 024 characters, else 400), `POST /refresh`,
`POST /logout` (204). Each reads/writes the refresh cookie through `CookieJar`. Responses: 200
`{accessToken, expiresIn, user}`; 401 `{error}`; 423 `{error, lockedMinutes}`. All carry
`Cache-Control: no-store`. A router-level error middleware maps `HttpError(status, message, extra?)`
to `{error, ...extra}`; anything else is passed on untouched.

`CookieJar` (`routes/cookie-jar.ts`): `read(req)` parses the `Cookie` header for `pachanguero_refresh`;
`set(res, token, maxAgeSeconds, secure)` and `clear(res)` write `Set-Cookie:
pachanguero_refresh=<token>; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=<n>[; Secure]`. A
refused refresh also clears the cookie (S5).

Sacrificed / accepted: a refused request after a lock is a fast 423 and a wrong password is a slow
401, so the existence of a _locked_ account is observable (author-accepted in UC-004-01); access
tokens are not revocable (author-accepted); two tabs refreshing together can log one out (HLD risk).

**Impacted Units**

| Unit                                                                 | File                                 | Change                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `TokenService`, `InvalidTokenError`, `AccessClaims`, `RefreshClaims` | `server/src/domain/token-service.ts` | create                                                                                                                        |
| `View`                                                               | `server/src/domain/types.ts`         | modify (with F1's `Role`)                                                                                                     |
| `AuthConfig`                                                         | `server/src/repo/auth-config.ts`     | create                                                                                                                        |
| `AuthService`, `Session`, `SessionUser`                              | `server/src/repo/auth-service.ts`    | create                                                                                                                        |
| `HttpError`, error middleware                                        | `server/src/routes/http-error.ts`    | create                                                                                                                        |
| `CookieJar`                                                          | `server/src/routes/cookie-jar.ts`    | create                                                                                                                        |
| `AuthRouter`                                                         | `server/src/routes/auth-router.ts`   | create                                                                                                                        |
| `jose`                                                               | `server/package.json`                | modify: dependency, **only with the author's go-ahead when the task starts**; version pinned at the one checked here (6.2.12) |

**Test Methodology**

Per HLD 2.10: route tests through the real router on a temp SQLite file, using F13's `AuthTestApp`
(a manual clock and a test secret). `server/src/routes/auth-router.test.ts`:

| Case                                                                                                                                                                                                  | Scenario                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| admin and regular logins return 200, an access token that verifies with the right claims, a cookie with `HttpOnly; SameSite=Strict; Path=/api/auth` (and `Secure` when configured), `expiresIn` 1 800 | UC-004-01-S1               |
| wrong password: 401, no cookie, count 1; unknown user and deactivated user: **identical** status and body to the wrong password                                                                       | S2, S3, S7                 |
| 4 failures then a wrong one: 423 with `lockedMinutes` 15, locked 15 minutes                                                                                                                           | S4                         |
| locked with 10 minutes left and the correct password: 423, no token, count unchanged                                                                                                                  | S5                         |
| 3 failures then the correct password: success, count 0                                                                                                                                                | S6                         |
| after the lock expires with count 5, one wrong password locks again; one correct password logs in                                                                                                     | F1 rule                    |
| 20 parallel wrong passwords on a fresh account: at most 5 reach `verify` (count the hasher calls) and the rest get 423                                                                                | pre-mortem                 |
| after 31 minutes the old access token gets 401 on an admin route; `refresh` returns a new one that works                                                                                              | UC-004-02-S1 (server half) |
| refresh with token A: A revoked, B stored hashed (the DB holds no token text), A again 401 with the cookie cleared, B works                                                                           | UC-004-02-S4, S5           |
| refresh after 31 days: 401; after the user is deactivated: 401                                                                                                                                        | UC-004-02-S6, S7           |
| logout revokes the presented token and clears the cookie; refresh with it is 401; logout with no cookie is 204                                                                                        | UC-004-02-S8               |
| a login response, a 401 and a log capture contain no `password_hash` or password                                                                                                                      | non-behavioural            |
| `JWT_SECRET` missing or shorter than 32 characters makes `AuthConfig.fromEnv` throw                                                                                                                   | non-behavioural            |

`server/src/domain/token-service.test.ts`: round trips; wrong type, wrong issuer, wrong secret, expired,
tampered payload, `alg: none`, a missing claim and a non-numeric `sub` all throw `InvalidTokenError`.
Fully automatable (HLD 2.10: Yes).

**Data Contract Verification**

| Stored / exchanged                          | Written by                            | Read by                                | Shape                                                                                                        |
| ------------------------------------------- | ------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| access JWT (never stored server-side)       | `TokenService.issueAccess`            | `Authenticate` (F3) via `verifyAccess` | header `{alg: HS256}`; claims `iss`, `sub` (user id as text), `role`, `view`, `type: "access"`, `iat`, `exp` |
| refresh JWT in cookie `pachanguero_refresh` | `issueRefresh`, `CookieJar.set`       | `CookieJar.read`, `verifyRefresh`      | claims `iss`, `sub`, `jti`, `type: "refresh"`, `iat`, `exp`                                                  |
| `refresh_tokens.token_hash`                 | `AuthService` (`hashOf`, hex SHA-256) | `findByHash` with the same function    | 64 hex characters, unique                                                                                    |
| login/refresh response                      | `AuthRouter`                          | web `sessionClient` (F8)               | `{accessToken, expiresIn, user: {username, role, mode, playerName, canSwitchView}}`                          |

Create/read/update/delete of a session: created by login, rotated by refresh, ended by logout (and by
F4/F6/F7 events); no user edit. Mismatch found: none; the requirements' examples named the lock key
`lockedUntilMinutes`, the design uses `lockedMinutes` (the examples were marked illustrative).

**Patterns and Conventions**

DIP: `AuthService` depends on `TokenService`/`PasswordHasher`/repositories, not on `jose` or `crypto`;
`Clock` injected so tests move time; routes thin (parse, call the service, set the cookie); a typed
error carries its status (`HttpError`) instead of status codes sprinkled in services; Spanish
messages. No free functions or stateless statics.

**File Changes**

- Modify: `server/src/domain/types.ts`, `server/package.json` (with go-ahead).
- Create: `server/src/domain/token-service.ts`, `server/src/repo/{auth-config,auth-service}.ts`,
  `server/src/routes/{http-error,cookie-jar,auth-router}.ts`.
- Delete / Migrate: none.
- Tests: `server/src/domain/token-service.test.ts`, `server/src/routes/auth-router.test.ts`,
  `server/src/repo/auth-config.test.ts`.

#### F3 — Access guard on the API

**Current Implementation**

| Claim                                                                                                                                                                                                  | Tag                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `api` has 43 route registrations in one router with the sync `route()` wrapper; `index.ts` mounts it at `/api` after `express.json()` and then serves `web/dist` and an SPA fallback excluding `/api/` | `verified — source` (`routes/api.ts`; `index.ts` lines 11-22; count by grep)                                                      |
| Express 5 lists a router's routes in `router.stack` (`layer.route.path`, `layer.route.methods`); nested routers expose their own `stack`                                                               | `verified — invocation` (scratch script; nested form `inferred` from the same structure, exercised by the pin test)               |
| `api.test.ts` mounts the bare `api` router with `express.json()` and calls it with `fetch`; the E2E specs call the API with Playwright `request` and use `GET /api/seasons` as the readiness probe     | `verified — source` (`api.test.ts` lines 20-31; `e2e/playwright.config.ts`)                                                       |
| Playwright treats a URL as ready when it answers a status from 200 up to (not including) 404, so a 401 from the probe still counts as ready                                                            | `verified — source` (`node_modules/playwright-core/lib/coreBundle.js`, `isURLAvailable`: `statusCode >= 200 && statusCode < 404`) |
| `tseslint.configs.recommended` is enabled in the lint configuration                                                                                                                                    | `verified — source` (`eslint.config.js`)                                                                                          |

**Approach**

Delta only. Four routers, one guard class, one app class.

_Composition._ `ApiRoutes` (`routes/api-routes.ts`) is built with the four routers and `Authenticate`
and returns the router mounted at `/api`, in this order:

```text
1. publicRouter    (F2 AuthRouter: /auth/login, /auth/refresh, /auth/logout)
2. authenticate    -> every request below needs a valid access token (401 otherwise)
3. sessionRouter   (F6 PUT /me/password, F7 POST /auth/view)           any principal
4. requireEffective('regular') -> ownRouter (F5, F6: /me/...)          403 unless effective regular
5. requireEffective('admin')   -> adminRouter (the existing `api`)     403 unless effective admin
```

Because `authenticate` runs before the last two guards for **any** path that is not public, a path
nobody declared is answered 401 (anonymous), 403 (regular) or, for an admin, falls through to the
usual 404. A route added to `api.ts` is admin-only without anyone remembering to say so.
`sessionRouter` and `ownRouter` are empty until F5-F7 add their routes.

_Principal._ `Authenticate.middleware()` reads `Authorization: Bearer <token>` (scheme
case-insensitive), calls `TokenService.verifyAccess(token, clock.now())`, builds a `Principal`
`{ userId, role, view, effective }` and stores it in `res.locals.principal` (no type augmentation of
Express). `Principals.of(res)` is the one typed reader. No database access: a deactivated or demoted
user keeps working until the token expires, author-accepted (UC-004-02). Missing or invalid token:
401 `{error: "No autorizado"}`. `Authenticate.requireEffective(role)` answers 403 `{error: "Prohibido"}`.

`EffectiveRole` (`domain/effective-role.ts`, instance over `(role, view)`): `value()` is `'admin'` only
when the base role is admin **and** the view is `'admin'`, otherwise `'regular'`; `isAdmin()`,
`isRegular()`. A regular user can never be admin whatever the token says (`view` of a regular user is
ignored).

_App._ `ServerApp` (`server/src/server-app.ts`, `build(): Express`) holds today's `index.ts`
composition: `SecurityHeaders`, `express.json()`, `/api` (ApiRoutes), then the static SPA and fallback
when `webDist` exists. `index.ts` builds the dependencies (`AuthConfig.fromEnv`, `TokenService`,
`AuthService`, routers), calls `ServerApp.build().listen(...)` and keeps the port/host handling.
This lets tests build the real app, including the static files, without listening on a fixed port.

`SecurityHeaders` (`routes/security-headers.ts`): `x-powered-by` off, `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store` on
`/api` responses. **No Content-Security-Policy**: it cannot be verified here against the built SPA
and the requirements do not ask for it (a risk, not a deferral).

_Route classification (UC-004-03-S5)._ Declaration is "which router holds the route". The test pins the
exact routes of the public, session and own routers and checks that the admin router is exactly
`api.stack`. `RouteLister` (test support) lists `METHOD /path` recursively from a router's `stack`.

Pre-mortem findings carried: the E2E readiness probe still passes (401 is "ready"); `api.test.ts` stays
valid because it mounts `api` itself; the sweep substitutes `:id` style segments with `1`; a body
parser error (malformed JSON) is raised before the guard and keeps Express's default 400, unchanged
from today.

**Impacted Units**

| Unit                                      | File                                    | Change                                       |
| ----------------------------------------- | --------------------------------------- | -------------------------------------------- |
| `EffectiveRole`                           | `server/src/domain/effective-role.ts`   | create                                       |
| `Authenticate`, `Principal`, `Principals` | `server/src/routes/authenticate.ts`     | create                                       |
| `ApiRoutes`                               | `server/src/routes/api-routes.ts`       | create                                       |
| `SecurityHeaders`                         | `server/src/routes/security-headers.ts` | create                                       |
| `ServerApp`                               | `server/src/server-app.ts`              | create                                       |
| `index.ts`                                | `server/src/index.ts`                   | modify: wiring, listen, error on listen kept |
| `api.ts`                                  | `server/src/routes/api.ts`              | **unchanged**                                |

**Test Methodology**

Per HLD 2.10, route tests on the real composed app (`ServerApp`) with F13's `AuthTestApp`.
`server/src/routes/api-routes.test.ts`:

| Case                                                                                                                                                                                                                                      | Scenario             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| the 8 requests of the anonymous table: 401, response has no data, row counts of every table unchanged                                                                                                                                     | UC-004-03-S1         |
| the 8 requests of the regular-user table (including carlos's own `/api/players/3/report`): 403, nothing changed                                                                                                                           | UC-004-03-S2         |
| sweep over **every** route in `api.stack`: anonymous 401, regular 403, admin neither 401 nor 403                                                                                                                                          | S1, S2, S3           |
| the six tokens of the S4 table (expired; other secret; payload edited keeping the signature; `alg: none`; refresh token as Bearer; token of a user deactivated more than 30 minutes ago = expired) on `GET /api/seasons/current`: all 401 | UC-004-03-S4         |
| exact pin of the public, session and own routers' routes; `ApiRoutes`' admin router is the same object as `api`                                                                                                                           | UC-004-03-S5         |
| an unknown path under `/api`: 401 anonymous, 403 regular, 404 admin                                                                                                                                                                       | S5 (run-time denial) |
| an admin whose token says `view: "regular"` gets 403 on `GET /api/debts`, `GET /api/seasons/2/standings`, `POST /api/games/12/payments`, `PATCH /api/players/1`                                                                           | UC-004-11-S2         |
| the static `index.html` of a temporary `webDist` is served without a token; `/api/...` is never answered by the SPA fallback                                                                                                              | non-behavioural      |
| `Cache-Control: no-store` and `nosniff` are present on `/api` responses                                                                                                                                                                   | design               |

`server/src/domain/effective-role.test.ts`: the four combinations. `api.test.ts` is **not changed**
and must still pass. Fully automatable.

**Data Contract Verification**

The element stores no data. Consumption path of the one contract it adds: `TokenService.verifyAccess`
(F2) → `Authenticate` builds `Principal` → `Principals.of(res)` is read by `requireEffective` and by
F5-F7 handlers. The claims `role` and `view` it reads are exactly those `issueAccess` writes; a token
missing either is rejected by `verifyAccess`, so no handler sees an undefined principal.

**Patterns and Conventions**

Chain of responsibility (Express middleware order) with deny-by-default placement; the guard is a class
with methods returning handlers; composition over annotation (SOLID: new route classes extend the
mount table, existing routers untouched). `res.locals` instead of module augmentation, which keeps the
lint rules as they are. No rule is disabled.

**File Changes**

- Modify: `server/src/index.ts`.
- Create: `server/src/domain/effective-role.ts`, `server/src/routes/{authenticate,api-routes,security-headers}.ts`,
  `server/src/server-app.ts`.
- Delete / Migrate: none. `api.ts` untouched.
- Tests: `server/src/domain/effective-role.test.ts`, `server/src/routes/api-routes.test.ts`.

#### R2 — The admin app becomes one of two shells

**Current Implementation**

| Claim                                                                                                                                                                                                                                                      | Tag                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `App.tsx` is the whole admin application: it owns `tab`, `seasons`, `season`, `players`, `games`, `missingSeason`, `error`, loads them with `api.*`, and renders `GameDay`, `Standings`, `Debts`, `PlayerReportPage`, `Manage` and the five-button tab bar | `verified — source` (`web/src/App.tsx` lines 1-170) |
| `main.tsx` renders `<App />` inside `StrictMode`; no router                                                                                                                                                                                                | `verified — source` (`web/src/main.tsx`)            |
| The two E2E specs reach the screens through `page.goto('/')`, button names (`Ajustes`, `Crear la temporada …`) and test ids                                                                                                                                | `verified — source` (`e2e/tests/*.spec.ts`)         |
| `eslint-plugin-react-refresh` warns when a file exports more than components                                                                                                                                                                               | `verified — source` (`eslint.config.js`)            |

**Approach**

Pure move, no behaviour change. The current body of `App` moves unchanged into `AdminShell`
(`web/src/pages/AdminShell.tsx`), which still owns the season/game state and its effects, so a later
conditional render in `App` cannot remount it and refetch (pre-mortem). `App.tsx` becomes a thin
component that renders `<AdminShell />`; F8 turns it into the component that chooses between login,
admin shell and the player's own view, and gives `AdminShell` its `user` and `onLogout` props. Nothing
else changes in this element, including the `app` / `wide` class names and the tab bar.

**Impacted Units**

| Unit         | File                           | Change                            |
| ------------ | ------------------------------ | --------------------------------- |
| `AdminShell` | `web/src/pages/AdminShell.tsx` | create (content of today's `App`) |
| `App`        | `web/src/App.tsx`              | modify: renders `AdminShell`      |

**Test Methodology**

Per HLD 2.10. No new unit test (the web unit tests are `lib/` only and no logic moves). Verification:
`npm test`, `npm run lint`, `npm run format:check`, and `npm run test:e2e` (both specs, unchanged),
which exercise the five tabs through the real shell. Fully automatable.

**Data Contract Verification**

Not relevant: no data is stored or reshaped.

**Patterns and Conventions**

Composition over branching (frontend standard §2): the shell is a component in its own file; `App` is
a selector. Two shells will fill one slot with compatible props (§5): `{ user, onLogout }`, added in F8
and F9. The file exports only the component (react-refresh rule).

**File Changes**

- Create: `web/src/pages/AdminShell.tsx`.
- Modify: `web/src/App.tsx`.
- Delete / Migrate: none.
- Tests: none new; existing suites as above.

#### F8 — Web session, login and logout

**Current Implementation**

| Claim                                                                                                                                                                                                                        | Tag                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Every request goes through `call()` in `web/src/api.ts` (36 `call` uses), which sets `Content-Type: application/json`, throws `Error(body.error ?? 'HTTP n')` on a non-2xx and returns the JSON; no other file calls `fetch` | `verified — source` (`web/src/api.ts` lines 281-290; `grep "fetch(" web/src` finds only `api.ts`)         |
| Hooks hold data access (`useDebts`, `usePlayerReport`, …) and components call hooks, not `fetch`                                                                                                                             | `verified — source` (`web/src/hooks/*.ts`)                                                                |
| The web tests are `vitest` on `web/src/lib/*.test.ts`                                                                                                                                                                        | `verified — source` (`docs/test-strategy.md`; `web/src/lib`)                                              |
| `main.tsx` uses `StrictMode`, which runs effects twice in development                                                                                                                                                        | `verified — source` (`main.tsx`) for the use; the double run is React's documented behaviour (`inferred`) |
| `fetch` sends same-origin cookies by default and keeps `Set-Cookie` for the page                                                                                                                                             | `inferred` (platform behaviour; the login E2E exercises it)                                               |

**Approach**

Delta only. A session client with the access token in memory, a hook for the session state, and a login
page; `call()` becomes a thin caller of the client.

`lib/sessionClient.ts` (a function module over an injected `fetch`, so it can be tested without a
browser):

```ts
export interface SessionUser {
  username: string;
  role: 'admin' | 'regular';
  mode: 'admin' | 'regular';
  playerName: string | null;
  canSwitchView: boolean;
}
export interface SessionClient {
  request<T>(path: string, init?: RequestInit): Promise<T>; // adds Bearer; on 401 refreshes once and retries once
  login(username: string, password: string): Promise<SessionUser>;
  restore(): Promise<SessionUser | null>; // refresh from the cookie on start
  logout(): Promise<void>;
  switchView(view: 'admin' | 'regular'): Promise<SessionUser>; // POST /auth/view, keeps the new token
  onExpired(listener: () => void): () => void;
}
export function createSessionClient(fetchImpl: typeof fetch): SessionClient;
```

Behaviour: the token lives in a closure variable only. `request` retries after a 401 with a single
shared in-flight refresh promise (so three concurrent 401s make one refresh, S2). The calls to
`/auth/login`, `/auth/refresh` and `/auth/logout` bypass the retry (a failed refresh must not retry
itself, and a wrong current password on `PUT /me/password` is a 422, never a 401, so it does not
refresh). If the refresh fails: the token is dropped, listeners fire once, the original request
rejects (S6). `restore()` shares the same in-flight refresh promise, so React's double effect in
development makes one refresh call, not two (a second would present a rotated token and log the user
out). `logout()` calls the server and clears the token whether or not the call succeeds. An
`ApiError` (status + message) is thrown for non-2xx so callers can tell a 422 from a network failure;
the message is still the server's `error`, so existing `catch` blocks keep working.

`api.ts`: `call()` delegates to one module-level `sessionClient`; `api` gains `login`, `restore`,
`logout`, `onExpired` re-exports. `hooks/useSession.ts`: state `loading | anonymous | authenticated`,
`restore()` on mount, `login(u, p)`, `logout()`, and subscription to `onExpired` that returns to
anonymous (S6). `pages/Login.tsx`: a form with "Usuario", "Contraseña" and "Entrar"; messages from the
server; a locked account shows "Cuenta bloqueada. Inténtalo de nuevo en N minutos." from `lockedMinutes`.
`App.tsx`: `loading` → "Cargando…"; `anonymous` → `Login`; authenticated admin mode → `AdminShell` with
`user` and `onLogout`; authenticated regular mode → `OwnView` (F9). `AdminShell`'s header gains a "Salir"
button. A reload of the page restores the session through the cookie (S3).

**Impacted Units**

| Unit                                                              | File                           | Change                              |
| ----------------------------------------------------------------- | ------------------------------ | ----------------------------------- |
| `createSessionClient`, `SessionUser`, `SessionClient`, `ApiError` | `web/src/lib/sessionClient.ts` | create                              |
| `call()`, `api.login/restore/logout/onExpired`                    | `web/src/api.ts`               | modify                              |
| `useSession`                                                      | `web/src/hooks/useSession.ts`  | create                              |
| `Login`                                                           | `web/src/pages/Login.tsx`      | create                              |
| `App`                                                             | `web/src/App.tsx`              | modify: selects the screen          |
| `AdminShell`                                                      | `web/src/pages/AdminShell.tsx` | modify: `user`, `onLogout`, "Salir" |
| styles                                                            | `web/src/styles.css`           | modify: login form, header action   |

**Test Methodology**

Per HLD 2.10: pure `lib/` tests with a fake `fetch`, plus E2E.
`web/src/lib/sessionClient.test.ts`:

| Case                                                                                                                   | Scenario                      |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| a request carries `Authorization: Bearer` after login and none before                                                  | UC-004-02                     |
| 401 → exactly one refresh → the original request repeated once with the new token                                      | UC-004-02-S1                  |
| three concurrent 401s → **one** refresh call, three repeats                                                            | UC-004-02-S2                  |
| `restore()` calls refresh and returns the user; no cookie (401) returns null; two concurrent `restore()` make one call | UC-004-02-S3 (and StrictMode) |
| a refresh answered 401: token dropped, one `onExpired`, the request rejects, no loop                                   | UC-004-02-S6                  |
| a second 401 after a successful refresh rejects (no second refresh)                                                    | design                        |
| login 401 and 423 reject with the server message and do not call refresh                                               | UC-004-01-S2, S4              |
| a 422 does not refresh and rejects with the message                                                                    | UC-004-09 non-behavioural     |
| logout clears the token even when the call fails                                                                       | UC-004-02-S8                  |

E2E (F13's fixture): log in through the form, see the admin tabs; reload and still see them; "Salir"
shows the login; after login `localStorage` and `sessionStorage` hold no token (UC-004-02 non-behavioural).
Manual (HLD 2.10 says Yes): none beyond a look at the login on a phone width.

**Data Contract Verification**

| Exchanged          | Produced by                 | Consumed by                             | Shape                                                                                                                                            |
| ------------------ | --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| login/refresh JSON | `AuthRouter` (F2)           | `sessionClient`                         | `{accessToken, expiresIn, user: {username, role, mode, playerName, canSwitchView}}`; the client keeps only the token (memory) and returns `user` |
| error JSON         | `HttpError` middleware (F2) | `ApiError`                              | `{error: string, lockedMinutes?: number}`; a non-JSON body falls back to the status text, as `call()` does today                                 |
| refresh cookie     | `CookieJar` (F2)            | the browser, sent only to `/api/auth/*` | HttpOnly: the client never reads it                                                                                                              |

Nothing is persisted in the browser: no `localStorage`, no `sessionStorage` (checked by E2E and by a
grep for both names in `web/src` at review).

**Patterns and Conventions**

Frontend standard: data access in a hook (`useSession`), pure logic in `lib/` (`sessionClient`),
`api.ts` stays the one seam (§4), the component only renders (`Login`). Single-flight promise for
concurrent refreshes. Spanish UI text.

**File Changes**

- Modify: `web/src/api.ts`, `web/src/App.tsx`, `web/src/pages/AdminShell.tsx`, `web/src/styles.css`.
- Create: `web/src/lib/sessionClient.ts`, `web/src/hooks/useSession.ts`, `web/src/pages/Login.tsx`.
- Delete / Migrate: none.
- Tests: `web/src/lib/sessionClient.test.ts`; E2E in F13.

#### F13 — Test harness and E2E session fixture

**Current Implementation**

| Claim                                                                                                                                                                                          | Tag                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.test.ts` builds its own app and needs no token                                                                                                                                            | `verified — source` (`routes/api.test.ts` lines 20-31)                                                                                                          |
| `playwright.config.ts` starts the API with `PACHANGUERO_DB` and `PORT` on a fresh file and the web dev server on 5174 with `PACHANGUERO_API_PORT`; specs share one database and run one by one | `verified — source` (`e2e/playwright.config.ts`)                                                                                                                |
| The specs use the `request` fixture for API setup and `page` for the screen; both import `test` from `@playwright/test`                                                                        | `verified — source` (`e2e/tests/*.spec.ts` headers)                                                                                                             |
| A browser context's `request` shares the context's cookies; the standalone `request` fixture does not                                                                                          | `assumed` (Playwright documentation, not read in this environment); checked by the first E2E run — a failure would only change how the fixture logs the page in |

**Approach**

Delta only. Two things: server-side route-test support, and the E2E login.

_Server._ `AuthTestApp` (`server/src/routes/auth-test-support.ts`, a support file like
`game-flow-test-support.ts`): points `PACHANGUERO_DB` at a temp file, imports the composition root,
builds `AuthConfig.of({...})` with a test secret, a `ManualClock`, `TokenService`, `AuthService`,
`Authenticate`, `ApiRoutes`, `ServerApp`, listens on port 0, and offers `createUser(username, role,
playerName?)`, `login(username)`, `tokenFor(role | {role, view})`, `advance(minutes)`, `base`, `close()`.
`ManualClock` (`domain/clock-test-support.ts`, implements `Clock`, `advance(ms)`). `RouteLister`
(`routes/route-lister-test-support.ts`) lists a router's `METHOD /path` recursively. Passwords in
tests are made-up policy-compliant strings.

_E2E._ A `globalSetup` (`e2e/support/seed-admin.ts`) runs after the web servers are up and creates the
E2E admin with the server CLI against the same database, passing the (fake) password on standard input
(F4's `PasswordPrompt` reads a line when stdin is not a terminal). `e2e/tests/auth.fixture.ts`
extends Playwright's `test`: a worker-scoped `adminToken` (logs in through a standalone request
context), a `request` override that sends `Authorization: Bearer <adminToken>`, and a `page` override that,
before the test, calls `page.request.post('/api/auth/login', …)` so the browser context holds the refresh
cookie and the SPA restores the session on load (UC-004-02-S3). Every login is made at the start of the
test (never a shared `storageState`), because each refresh rotates the cookie and a second context
reusing an old snapshot would present a revoked token. The two specs change one import line.
`playwright.config.ts` adds `JWT_SECRET` (a clearly fake constant) and `globalSetup`; the readiness
probe stays (a 401 counts as ready).

Dependency note for the breakdown: the E2E seeding needs F4's CLI; the server-side support has none.

**Impacted Units**

| Unit          | File                                                             | Change                                          |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `ManualClock` | `server/src/domain/clock-test-support.ts`                        | create                                          |
| `AuthTestApp` | `server/src/routes/auth-test-support.ts`                         | create                                          |
| `RouteLister` | `server/src/routes/route-lister-test-support.ts`                 | create                                          |
| E2E fixture   | `e2e/tests/auth.fixture.ts`                                      | create                                          |
| E2E seed      | `e2e/support/seed-admin.ts`                                      | create                                          |
| config        | `e2e/playwright.config.ts`                                       | modify                                          |
| specs         | `e2e/tests/season-and-player.spec.ts`, `the-game-screen.spec.ts` | modify: import `test`/`expect` from the fixture |

**Test Methodology**

Per HLD 2.10 and `docs/test-strategy.md` (E2E boots the real server and web server on an isolated
database, no mocks). Verification of this element is that everything else uses it and stays green:
`npm test`, `npm run test:e2e`, `npm run lint`, `npm run format:check`. A short E2E spec,
`e2e/tests/login.spec.ts`, covers the journeys F8 lists. The `assumed` cookie-sharing claim is
resolved by that first run. Fully automatable.

**Data Contract Verification**

Test-only data: the E2E admin's username and password are fixed fake constants in the fixture and the
seed script; the database is the disposable E2E file removed at every start. No real secret or user
is committed.

**Patterns and Conventions**

Test support files follow the existing `*-test-support.ts` precedent; the E2E fixture uses Playwright's
`test.extend`; no flag disables authentication anywhere (study Q-02 rejected it).

**File Changes**

- Modify: `e2e/playwright.config.ts`, `e2e/tests/season-and-player.spec.ts`,
  `e2e/tests/the-game-screen.spec.ts`.
- Create: `server/src/domain/clock-test-support.ts`, `server/src/routes/{auth-test-support,route-lister-test-support}.ts`,
  `e2e/tests/auth.fixture.ts`, `e2e/support/seed-admin.ts`, `e2e/tests/login.spec.ts`.
- Delete / Migrate: none.
- Tests: the specs above.

#### F4 — User administration (CLI and player merge)

**Current Implementation**

| Claim                                                                                                                                                                                                                                                                                                        | Tag                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The only script today is `server/scripts/import-season.ts`, run with `tsx` and parsing flags by hand; `tsc` compiles only `src/**` into `dist`, so a script outside `src` does not exist in the built output                                                                                                 | `verified — source` (`scripts/import-season.ts`; `server/tsconfig.json` `include: ["src/**/*"]`; `server/package.json` `"seed": "tsx scripts/import-season.ts"`) |
| `PlayerMergeService.merge(intoId, fromId)` refuses a shared game, updates every column of its `REFERENCES` list, then `DELETE FROM players WHERE id = fromId`; it is built with `(players, aliases, conn)` in `repo/index.ts:50` and in `player-merge-service.test.ts:28`, and called by `routes/api.ts:194` | `verified — source` (those lines; `grep "new PlayerMergeService("`)                                                                                              |
| With `foreign_keys = ON`, deleting a player that a `users.player_id` row references fails with `SQLITE_CONSTRAINT_FOREIGNKEY`, and succeeds after the link is moved to the survivor                                                                                                                          | `verified — invocation` (scratch script on a minimal schema; the real `users` definition is F1's, same `REFERENCES players(id)` with no action)                  |
| Piped standard input can be read as a sequence of lines with one `readline` interface and its async iterator (two lines in, then done)                                                                                                                                                                       | `verified — invocation` (scratch script with `printf 'x\ny\n' \|`)                                                                                               |
| `process.stdin.isTTY` is undefined when piped                                                                                                                                                                                                                                                                | `verified — invocation` (same script)                                                                                                                            |
| Echo-free entry on a real terminal                                                                                                                                                                                                                                                                           | `assumed` (needs a TTY, none here); resolved by the manual check below                                                                                           |
| `PlayerRepository.nameOf`, `listAll`, `register` exist; there is no lookup by name for a player                                                                                                                                                                                                              | `verified — source` (`repo/player-repository.ts`)                                                                                                                |
| The reference's command set and password policy                                                                                                                                                                                                                                                              | `verified — document` (as recorded in UC-004-04)                                                                                                                 |

**Approach**

Delta only. Rules live in a service; the CLI is a thin shell over it; the merge learns about users.

_`UserAdminService`_ (`repo/user-admin-service.ts`; takes `UserRepository`, `RefreshTokenRepository`,
`PlayerRepository`, `PasswordHasher`, `PasswordPolicy`, `UsernamePolicy`, `Clock`, the connection).
Every refusal is a `UserAdminError` whose message is the Spanish sentence the CLI prints. Hashing is
asynchronous and done **before** the transaction; all checks and writes then run inside one
synchronous `conn.transaction`, so a failing command changes nothing and a concurrent writer is caught
by the unique constraints.

| Method                                        | Rules (scenario)                                                                                                                                                                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create({username, password, role, player?})` | username valid and free (S4); password meets the policy, all failed rules listed (S5); role `regular` requires a player (S2); the player exists and has no user, error names the existing one (S3); an admin may have a player or none (S6); result has the hash only |
| `resetPassword(username, password)`           | policy; replaces the hash; revokes all the user's refresh tokens; clears count and lock (S7)                                                                                                                                                                          |
| `unlock(username)`                            | clears count and lock (S8)                                                                                                                                                                                                                                            |
| `activate(username)` / `deactivate(username)` | deactivate revokes the refresh tokens (S9); refused when the user is the last active admin (S11)                                                                                                                                                                      |
| `promote(username)` / `demote(username)`      | promote keeps the player link (S10); demote refused without a linked player (S10) and for the last active admin (S11)                                                                                                                                                 |
| `list()`                                      | username, role, player's full name, active, locked now (S12); never the hash                                                                                                                                                                                          |

_Players are identified by id or by full name._ Player names carry surnames and users have their own
`username`; the link is `users.player_id`, never derived from the name. `--player` takes an integer id
or an exact name compared without case; `PlayerRepository.findByName(name)` returns every match and
the service refuses if there are none or more than one, naming the candidates and their ids.

_`UserCli`_ (`cli/user-cli.ts`) parses `argv` with `node:util.parseArgs`, dispatches to the service, and
prints through a `CliIo` (`out`, `err`) so tests can capture it. Commands: `create`, `list`, `reset-pwd`,
`unlock`, `activate`, `deactivate`, `promote`, `demote` (this element) and `backup` (F10). Exit status
0 on success, 1 on a refusal (`✗ <message>`), 2 on a usage error. Passwords are **never** a flag or an
argument: `create` and `reset-pwd` ask for them through a `PasswordPrompt` (twice, to confirm; a
mismatch refuses). `TtyPasswordPrompt` writes the question to standard error, mutes the output while
the user types when standard input is a terminal, and otherwise reads two lines from the piped input
(used by the E2E seeding and by scripts). Nothing prints a password or a hash.

The tool is called `pachanguero-admin` (the requirements' name was illustrative). `cli/main.ts` builds
the real dependencies from `repo/index.ts` and runs `UserCli`; in development `npm run admin
--workspace=server -- <command>` (a `tsx` script), in the image `node dist/cli/main.js <command>`
through a wrapper F11 installs. Running it opens the same database file as the server; no network.

_Merge._ `PlayerMergeService` gains a `UserRepository` dependency. Before touching anything it refuses
when both players have a user (`No se puede fundir X con Y: los dos tienen usuario (a, b)`), next to the
existing shared-game refusal; inside its transaction, when only the absorbed player has one, it moves
`users.player_id` to the survivor **before** the delete. The `REFERENCES` list does not include `users`
(a `UPDATE` there would hit the unique constraint when both exist, with a worse message). F6 adds its
contact row to the same method.

Pre-mortem findings carried: a non-interactive `create` must still ask twice (the seeding sends two
lines); a deactivated last admin could have been reached by `demote` as well as `deactivate` (both
checked); players with the same name differing only in case are possible (the column is case-sensitive
unique), hence the ambiguity refusal.

**Impacted Units**

| Unit                                              | File                                      | Change                                                        |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `UserAdminService`, `UserAdminError`              | `server/src/repo/user-admin-service.ts`   | create                                                        |
| `PlayerRepository.findByName(name)`               | `server/src/repo/player-repository.ts`    | modify: add the method                                        |
| `UserCli`, `CliIo`                                | `server/src/cli/user-cli.ts`              | create                                                        |
| `PasswordPrompt` (interface), `TtyPasswordPrompt` | `server/src/cli/password-prompt.ts`       | create                                                        |
| entry                                             | `server/src/cli/main.ts`                  | create                                                        |
| `PlayerMergeService` (`merge`)                    | `server/src/repo/player-merge-service.ts` | modify: constructor, refusal, move                            |
| wiring                                            | `server/src/repo/index.ts`                | modify: pass `users` to the merge service; export `userAdmin` |
| script                                            | `server/package.json`                     | modify: `"admin": "tsx src/cli/main.ts"`                      |

**Test Methodology**

Per HLD 2.10. `cli/user-cli.test.ts` and `repo/user-admin-service.test.ts` on `TestDatabase.create()`
with a fixed `PasswordPrompt`, a captured `CliIo` and `ManualClock`:

| Case                                                                                                                                                             | Scenario        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| create a regular user for player "Carlos" (id 3): active, linked, hash stored (not the text), confirmation printed                                               | UC-004-04-S1    |
| regular without `--player`: refused, names the missing player, nothing created                                                                                   | S2              |
| second user for the same player: refused, names the existing user                                                                                                | S3              |
| username taken (also with different case): refused                                                                                                               | S4              |
| the five password rows: refused, the failed rule listed, nothing created                                                                                         | S5              |
| admin with no player and admin with player "Antonio"                                                                                                             | S6              |
| `reset-pwd` on a locked user with 5 failures and 2 live tokens: hash replaced, tokens revoked, lock and count cleared; only the new password verifies            | S7              |
| `unlock`                                                                                                                                                         | S8              |
| `deactivate` revokes the token and blocks `AuthService.login` and `refresh`; `activate` restores the same password                                               | S9              |
| `promote` keeps the player; `demote` refused without a player, accepted with one                                                                                 | S10             |
| `deactivate` and `demote` of the only active admin refused; with a second admin they succeed                                                                     | S11             |
| `list` of 3 users, one locked: columns and flags, no hash in the output                                                                                          | S12             |
| `--player` by id, by exact name, by name differing in case; two matches refused with both ids                                                                    | design          |
| a command that fails midway leaves the database unchanged (hash failure injected, row counts equal)                                                              | non-behavioural |
| password mismatch on confirmation refuses                                                                                                                        | design          |
| `player-merge-service.test.ts`: the user follows the survivor; both having users refuses naming both, nothing changed; `PRAGMA foreign_key_check` is empty after | UC-004-04-S13   |
| `password-prompt.test.ts`: piped input yields two lines; with a terminal-like output stream the typed text never reaches the output                              | non-behavioural |

Manual Test Plan (HLD 2.10: echo-free entry): on a real terminal run `create` and type a password.
Observe: no character is shown while typing, and the prompt appears on a fresh line afterwards. After
the action: `list` shows the user, the password works at the login screen, and the shell history holds
no password. Also the timing check from F1: observe how long `create` takes on the Raspberry Pi.

**Data Contract Verification**

| Stored                   | Written by                                            | Read by                                      | Notes                                                                                                    |
| ------------------------ | ----------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `users` rows             | `UserAdminService` (create, role, active, hash, lock) | `AuthService` (login/refresh), `list`, F5-F7 | the stored hash is `PasswordHasher`'s string; `active`, `role` read by login and by the last-admin count |
| `refresh_tokens.revoked` | `reset-pwd`, `deactivate` through `revokeAllFor`      | `AuthService.refresh`                        | a revoked row is refused                                                                                 |
| `users.player_id`        | `create`, `PlayerMergeService`                        | `AuthService` (name), F5-F7                  | unique, `NO ACTION` on delete: the merge moves it first                                                  |

Create/read/update/delete: create (`create`), read (`list`), update (every other command and the
merge), delete: none by design (author decision UC-004-04: `delete` is not needed).

**Patterns and Conventions**

Thin command shell over a service (SRP); `CliIo` and `PasswordPrompt` are narrow interfaces injected for
tests (ISP, DIP); a table of commands to methods so a new command is a new row; typed refusal errors;
no free functions. Spanish output with the `✓`/`✗` markers of the requirements' examples.

**File Changes**

- Modify: `server/src/repo/{player-repository,player-merge-service,index}.ts`, `server/package.json`.
- Create: `server/src/repo/user-admin-service.ts`, `server/src/cli/{user-cli,password-prompt,main}.ts`.
- Delete / Migrate: none.
- Tests: `server/src/repo/user-admin-service.test.ts`, `server/src/cli/{user-cli,password-prompt}.test.ts`,
  additions to `server/src/repo/player-merge-service.test.ts` and `player-repository.test.ts`.

#### F10 — Database backup command

**Current Implementation**

| Claim                                                                                                                                                                                                                           | Tag                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| The README documents a backup with the `sqlite3` command-line tool, which is not installed on this machine and need not exist in the container                                                                                  | `verified — document` (`README.md`) and `verified — invocation` (`sqlite3: command not found`, from the requirements)     |
| `DatabaseBackup` (R1) writes a consistent copy with `VACUUM INTO`, including rows only in the WAL, into a backups directory chosen by `PACHANGUERO_BACKUPS` or `<db dir>/backups`, never overwriting, removing any partial file | `verified — invocation` for the SQL behaviour (R1's scratch runs); the class itself is designed in R1 and not yet written |
| `VACUUM INTO` can read from an in-memory database, so the CLI tests can use `TestDatabase`                                                                                                                                      | `verified — invocation` (scratch script, in-memory source)                                                                |
| A second process can read the live database while the server holds it in WAL mode                                                                                                                                               | `inferred` from WAL's reader/writer model; exercised by the manual check                                                  |

**Approach**

Delta only. `UserCli` gains `backup`: it calls `DatabaseBackup.create()` with no label and prints
`✓ <absolute path>`; on failure it prints `✗ No se pudo crear la copia: <reason>` and exits 1, leaving
no partial file (R1 removes it) and the live database unchanged. The command needs no user, no password
and no `JWT_SECRET`; it works whether or not the server is running. `cli/main.ts` builds
`new DatabaseBackup(db(), BACKUP_DIR, new SystemClock(), new LocalCalendar())` (both exported by R1's
`db/index.ts`). Restoring is a manual, offline operation described in `docs/backup_and_restore.md` (F14);
the application has no restore command.

**Impacted Units**

| Unit                     | File                         | Change                          |
| ------------------------ | ---------------------------- | ------------------------------- |
| `UserCli` (`backup` row) | `server/src/cli/user-cli.ts` | part of the F4 file, one method |
| `main.ts`                | `server/src/cli/main.ts`     | builds `DatabaseBackup`         |

**Test Methodology**

Per HLD 2.10. `cli/user-cli.test.ts` (backup cases), with a temporary backups directory:

| Case                                                                                                                                                               | Scenario     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `backup` prints a path inside the directory matching `pachanguero-YYYYMMDD-HHMMSS.db`; the file opens as a database whose tables and row counts equal the source's | UC-004-10-S1 |
| a file database with 12 rows still only in its `-wal` (`wal_autocheckpoint = 0`): the backup holds them                                                            | UC-004-10-S2 |
| an unwritable backups directory: exit 1, `✗` message, no `.part` or final file, the source unchanged                                                               | UC-004-10-S3 |
| the command works with no users and no token configuration                                                                                                         | design       |

Manual (HLD 2.10 row F10): with the dev server running and a user logged in, run `backup`; observe the
path printed, that the app keeps answering and the user stays logged in. Then, on a **copy**, restore as
described in the document: stop the server, replace the database file with the backup, start it, and
check the player, game, payment and user counts equal those at the backup (UC-004-10-S4). State that
must persist: the live file is untouched by the backup itself; the restore replaces it only in the copy.

**Data Contract Verification**

Stored: the backup file. Written by `DatabaseBackup.create` (R1), read by SQLite when restored (copied
over the database file by the operator) and by any SQLite client. It is a full database: it holds users
and password hashes and contact data, so it is created readable by its owner only (R1). Create: this
command; read: the operator; update/delete: by hand, never by the application.

**Patterns and Conventions**

The same shell and injection as F4; no new class. The backup logic stays in R1's class (single
responsibility); this element only exposes it.

**File Changes**

- Modify: `server/src/cli/user-cli.ts`, `server/src/cli/main.ts` (created in F4).
- Create / Delete / Migrate: none.
- Tests: backup cases in `server/src/cli/user-cli.test.ts`.

#### F5 — Own debts, payments and statistics

**Current Implementation**

| Claim                                                                                                                                                                                                                                                                                                                                                                                      | Tag                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `share_debts` and `payments` carry `holder_player_id`, `beneficiary_player_id` (null for an anonymous plus-one, which has `guest_ordinal`), and `payments` also `payer_player_id` and `paid_on`; the debt table has indexes on game and holder and a partial unique index on `(game_id, beneficiary_player_id)`; payments have indexes on game and payer and the same partial unique index | `verified — source` (`db/schema.sql` lines 172-206)                                                     |
| `DebtRepository.outstanding()` returns every owed share with holder and beneficiary names for the whole group; `PaymentRepository` has no read by player                                                                                                                                                                                                                                   | `verified — source` (`repo/debt-repository.ts`, `repo/payment-repository.ts`)                           |
| `PlayerReportService.report(playerId, today)` returns the player, a games list with per-game `stats` (`callUp`, `payment`), the current season, `seasonStats` (`points`, `mercy`) and a `summary`                                                                                                                                                                                          | `verified — source` (`repo/player-report-service.ts`)                                                   |
| **The report is not safe to hand to a player as it is.** `PaymentStat` returns, for a paid share, `payerId` and `payerName`, and for an owed one `holderId` and `holderName`; `PointsSeasonStat` returns `rank` and `of` (position among all players)                                                                                                                                      | `verified — source` (`repo/payment-stat.ts` lines 6-20, 36-60; `repo/points-season-stat.ts` lines 5-30) |
| The admin screen renders the payer as ` · por <payerName>` and the points as `Puesto <rank> de <of>`                                                                                                                                                                                                                                                                                       | `verified — source` (`web/src/lib/playerStats.ts` lines 26, 106)                                        |
| A query-cost test already guards the debt read with `EXPLAIN QUERY PLAN`                                                                                                                                                                                                                                                                                                                   | `verified — source` (`repo/debt-query-cost.test.ts`)                                                    |
| Amounts are integer cents and the screens show `euros(cents)`                                                                                                                                                                                                                                                                                                                              | `verified — source` (`web/src/lib/money.ts`)                                                            |

**Approach**

Delta only. Three read routes for the caller's own player, each answering only what the author's rules
allow, decided on the server.

_Who is the player._ `OwnPlayer` (`routes/own-player.ts`) is a middleware class: it reads the
principal, loads `users.byId(principal.userId)`, answers 403 `{error: "No tienes un jugador asociado"}`
when the user or its `player_id` is missing (an admin with no player, UC-004-05 to 07 non-behavioural),
and stores the id in `res.locals`; `OwnPlayer.of(res)` is the one reader. No route takes a player id from
the path, query or body; a request carrying one is simply not read. `requireEffective('regular')`
(F3) has already run, so an admin in the admin view never gets here (403).

_What is shown_ (`OwnDisclosure`, `domain/own-disclosure.ts`, pure, takes the viewer's id and raw rows):

| Row                                                                       | Shown to player P as                                                                                                                                                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a debt held by P for P's own share                                        | `mine`, kind `own` ("tu parte"); counts in `owedCents`                                                                                                                                                            |
| a debt held by P for anyone else (a named guest or an anonymous plus-one) | `mine`, kind `guest` ("invitado"), **no name, no id**; counts in `owedCents`                                                                                                                                      |
| a debt for P's share held by someone else                                 | `heldByHost`, with the holder's name ("lo paga Ana"); **not** in `owedCents`                                                                                                                                      |
| a debt that is neither held by nor for P                                  | never read                                                                                                                                                                                                        |
| a payment whose payer is P or whose beneficiary is P                      | a payment, kind `own` when P is the beneficiary, else `guest`; `paidBy` is `null` when P paid, `{name}` when someone else paid **and** that someone is the share's holder, and `"other"` when a third person paid |

The report is passed through `OwnDisclosure.report`, which removes every player id from the payment
statistic, keeps `payerName` only when the payer is the share's holder or P, and removes `rank` and `of`
from the points statistic (a position among the others is a standing; Q-12 says a player sees no
standings). `author decision`: the player's statistics are the admin's report minus the standing position
(overriding "the same statistics" in UC-004-07 on this one figure). To tell holder from third payer, `PaymentStat`'s paid value gains `holderId`
(additive; its test is updated); the sanitiser strips it again.

_Reads._ `DebtRepository.outstandingFor(playerId)`: the existing `outstanding()` select with `WHERE
d.holder_player_id = @p OR d.beneficiary_player_id = @p`, same order (oldest game first).
`PaymentRepository.paidFor(playerId)`: payments joined to the game and the payer's name, `WHERE
payer_player_id = @p OR beneficiary_player_id = @p`, newest `paid_on` first. `OwnDataService`
(`repo/own-data-service.ts`; takes both repositories, `PlayerReportService`, `OwnDisclosure`, `Clock`)
exposes `debts(playerId)`, `payments(playerId)` and `report(playerId)` (today from the clock).

```ts
interface OwnDebts {
  owedCents: number;
  mine: OwnDebtRow[];
  heldByHost: HeldRow[];
}
interface OwnDebtRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  kind: 'own' | 'guest';
}
interface HeldRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  holderName: string;
}
interface OwnPaymentRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  paidOn: string;
  kind: 'own' | 'guest';
  paidBy: { name: string } | 'other' | null;
}
```

Routes (`OwnRouter`, `routes/own-router.ts`, all GET here): `/me/debts`, `/me/payments`, `/me/report`. The
router has no mutating verb in this element (UC-004-07-S6); F6 adds contact to it.

Imported payments keep the game's date as `paid_on`; the screen does not say otherwise.

Pre-mortem findings carried: the payer-name and rank leaks above; an `OR` read over two indexes (the
cost test is extended); a host paying for a guest who is a named player (shown to the host as "invitado",
to the guest as "pagado por <host>").

**Impacted Units**

| Unit                                      | File                                              | Change |
| ----------------------------------------- | ------------------------------------------------- | ------ |
| `OwnDisclosure`                           | `server/src/domain/own-disclosure.ts`             | create |
| `DebtRepository.outstandingFor`           | `server/src/repo/debt-repository.ts`              | modify |
| `PaymentRepository.paidFor`               | `server/src/repo/payment-repository.ts`           | modify |
| `PaymentStat` paid value gains `holderId` | `server/src/repo/payment-stat.ts`                 | modify |
| `OwnDataService`                          | `server/src/repo/own-data-service.ts`             | create |
| `OwnPlayer`                               | `server/src/routes/own-player.ts`                 | create |
| `OwnRouter`                               | `server/src/routes/own-router.ts`                 | create |
| wiring                                    | `server/src/repo/index.ts`, `server/src/index.ts` | modify |

**Test Methodology**

Per HLD 2.10: unit tests for the disclosure rules, route tests with two or three players' data in one
database (rows written with the repositories at chosen amounts: Carlos 500, Ana 1 500).

| Case                                                                                                                             | Scenario                      |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Carlos holds his own 500: one `mine` row "own", total 500                                                                        | UC-004-05-S1                  |
| Ana holds Carlos's 500: Carlos sees it in `heldByHost` with "Ana" and the total excludes it                                      | S2                            |
| Ana holds her own and two guests' shares: three rows, two kind `guest`, no guest name or id in the JSON, total 1 500             | S3                            |
| nothing owed: empty lists, total 0                                                                                               | S4                            |
| Carlos's response JSON contains neither "Ana", nor 1500, nor any of her ids except where S2 allows the host name                 | S5                            |
| after `PaymentService.pay` the share is gone and the total drops                                                                 | S6                            |
| payments: own, paid by host (named), paid for guests (marked), third-person payer ("other"), newest first, empty                 | UC-004-06-S1…S5               |
| report: equals the player report minus ids and `rank`/`of`; a payment by a third person has no `payerName`                       | UC-004-07-S1…S5, design       |
| no `POST/PUT/PATCH/DELETE` exists under `/me/debts`, `/me/payments`, `/me/report`; an admin with no player gets 403 on all three | UC-004-07-S6, non-behavioural |
| a request carrying `?playerId=` or a body id is read as the caller's own                                                         | non-behavioural               |
| `outstandingFor` plan uses an index (no full scan) in `debt-query-cost.test.ts`                                                  | design                        |

`own-disclosure.test.ts` covers every row of the table above including kinds and `paidBy`. Fully
automatable (HLD 2.10: Yes).

**Data Contract Verification**

| Read     | Source                                                   | Shape handed on                                                                                                                                                                        |
| -------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| debts    | `share_debts` joined to `games`, `players` (holder name) | `OwnDebts`; ids of other players never leave the server                                                                                                                                |
| payments | `payments` joined to `games`, `players` (payer name)     | `OwnPaymentRow[]`                                                                                                                                                                      |
| report   | `PlayerReportService`                                    | `PlayerReport` with ids, `rank`, `of` removed and `payerName` conditional; web type `PaymentValue` already tolerates a missing `payerName`, and F9 makes `payerId`/`holderId` optional |

Nothing is written by this element. Consumers: F9's hooks, one per route, same field names.

**Patterns and Conventions**

Disclosure rules in one domain class so no route or SQL decides privacy; repositories keep SQL only;
the route keeps nothing but parse-call-respond; Spanish labels are made by the web (`lib/ownDebts.ts`),
the server sends kinds.

**File Changes**

- Modify: `server/src/repo/{debt-repository,payment-repository,payment-stat,index}.ts`, `server/src/index.ts`.
- Create: `server/src/domain/own-disclosure.ts`, `server/src/repo/own-data-service.ts`,
  `server/src/routes/{own-player,own-router}.ts`.
- Delete / Migrate: none.
- Tests: `server/src/domain/own-disclosure.test.ts`, `server/src/routes/own-router.test.ts`,
  `server/src/repo/payment-stat.test.ts` (if absent, in `player-report-service.test.ts`), the added case in
  `debt-query-cost.test.ts`.

#### F6 — Contact data and password change

**Current Implementation**

| Claim                                                                                                                                                                                                                                         | Tag                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `players` has no email or phone; nothing stores contact data                                                                                                                                                                                  | `verified — source` (`db/schema.sql` lines 21-26)                                     |
| `players` rows are deleted only by the merge; `ON DELETE CASCADE` on a child table removes its rows then                                                                                                                                      | `verified — source` (`player-merge-service.ts` line 73; `schema.sql` cascade clauses) |
| The reference's `change_password` checks the current password, requires new and confirmation to match, applies the policy, stores the new hash and revokes all the user's tokens; a wrong current password does not touch the failure counter | `verified — source` (as recorded in UC-004-09)                                        |
| `PasswordPolicy`, `PasswordHasher`, `UserRepository.setPasswordHash`, `RefreshTokenRepository.revokeAllFor` are designed in F1                                                                                                                | `verified — document` (this document, F1)                                             |
| `PlayerMergeService` is edited by F4 (users); this element adds the contact row to the same method                                                                                                                                            | `verified — document` (F4 above)                                                      |

**Approach**

Delta only.

_Contact._ A new table, one optional row per player, no `ALTER` of an existing table:

```sql
CREATE TABLE IF NOT EXISTS player_contacts (
  player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  email     TEXT,
  phone     TEXT
);
```

- `ContactValidator` (domain): `check(input: unknown): ContactPatch` where the input must be an object
  whose keys are within `email` and `phone` (anything else → `ContactError`, "campo no permitido: <name>",
  UC-004-08-S4/S5); each value is a string or `null`; trimmed; empty means "clear" (`null`); an absent key
  means "leave as is". Email valid when `^[^\s@]+@[^\s@]+\.[^\s@]+$` and at most 254 characters
  (`carlos`, `carlos@example`, `@example.com` fail); phone valid when, with spaces removed, it matches
  `^\+?\d{9,15}$` (`12345`, `abc`, `1234567890123456` fail; `+34 600 123 456` passes). The stored text is
  the trimmed text as typed. Errors name the field (`email no válido`, `teléfono no válido`).
- `ContactRepository`: `get(playerId): {email, phone}` (nulls when no row), `save(playerId, patch)` as an
  upsert that changes only the given fields and deletes the row when both end `null`.
- `ContactService` (`repo/contact-service.ts`): `get(playerId)`, `save(playerId, input)` (validate, then
  save in one transaction, return the stored values).
- Routes on `OwnRouter` (so effective-regular + a linked player, UC-004-08-S6): `GET /me/contact` and
  `PATCH /me/contact` (200 with the stored values; `ContactError` → 422 `{error}`; body not an object → 400).
  The admin does not edit anyone's contact data (no admin route).
- Merge: in `PlayerMergeService`'s transaction, before the delete, the absorbed player's contact is
  folded into the survivor (`INSERT … SELECT … ON CONFLICT (player_id) DO UPDATE SET email =
COALESCE(player_contacts.email, excluded.email), phone = COALESCE(player_contacts.phone,
excluded.phone)`), so the survivor's own values win and gaps are filled; the absorbed row then
  cascades away with the player.

_Password change._ `PasswordChangeService` (`repo/password-change-service.ts`; takes `UserRepository`,
`RefreshTokenRepository`, `PasswordHasher`, `PasswordPolicy`, the connection):
`change(userId, current, next, confirm)`, each refusal a `PasswordChangeError` (→ 422, never 401):
(1) `current` does not verify: "La contraseña actual no es correcta" (S2), **not** counted toward the
lock-out (author decision UC-004-09); (2) `next !== confirm` (S3); (3) the policy lists failed rules,
returned as `{error, rules: [...]}` (S4); (4) `next === current` (S5). On success: hash the new password,
then in one transaction `setPasswordHash` and `revokeAllFor(userId)` (S1) → 204. Route: `PUT
/me/password` on `SessionRouter` (`routes/session-router.ts`, any principal, so an admin with no player
or in the regular view can use it). The user's already issued access token stays valid up to 30
minutes (author-accepted); the web leaves the session at once. The user is the principal's, never taken
from the body.

Risks noted: a thief of an access token can guess the current password without a lock-out (author
decision), bounded by the scrypt cost and the token's 30-minute life.

**Impacted Units**

| Unit                                                            | File                                              | Change                     |
| --------------------------------------------------------------- | ------------------------------------------------- | -------------------------- |
| `player_contacts`                                               | `server/src/db/schema.sql`                        | modify: append             |
| `ContactValidator`, `ContactError`, `ContactPatch`              | `server/src/domain/contact-validator.ts`          | create                     |
| `ContactRepository`                                             | `server/src/repo/contact-repository.ts`           | create                     |
| `ContactService`                                                | `server/src/repo/contact-service.ts`              | create                     |
| `PasswordChangeService`, `PasswordChangeError`                  | `server/src/repo/password-change-service.ts`      | create                     |
| `OwnRouter` (contact routes)                                    | `server/src/routes/own-router.ts`                 | modify (created in F5)     |
| `SessionRouter` (`PUT /me/password`; F7 adds `POST /auth/view`) | `server/src/routes/session-router.ts`             | create                     |
| `PlayerMergeService.merge`                                      | `server/src/repo/player-merge-service.ts`         | modify (after F4's change) |
| wiring                                                          | `server/src/repo/index.ts`, `server/src/index.ts` | modify                     |

**Test Methodology**

Per HLD 2.10. `contact-validator.test.ts`; `own-router.test.ts` (contact cases); `session-router.test.ts`
(password cases); the added merge case.

| Case                                                                                                                             | Scenario                |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| save `carlos@example.com` and `+34 600 123 456`, read them back                                                                  | UC-004-08-S1            |
| the six invalid rows, each 422 naming the field, previous values kept                                                            | S2                      |
| clear the phone: phone null, email kept; a row with both null is removed                                                         | S3                      |
| body with `name`, `introducedBy`, `games` or `playerId`: 422, the player's name and introducer unchanged                         | S4, S5                  |
| an admin with no player: 403 on `GET` and `PATCH`                                                                                | S6                      |
| two players may hold the same email                                                                                              | design                  |
| merge: survivor's values win, gaps filled from the absorbed, no row left for the absorbed                                        | UC-004-04-S13 (contact) |
| change password with two live refresh tokens: 204, hash replaced, both tokens revoked, old password fails and new works at login | UC-004-09-S1            |
| wrong current: 422 and the current-password message, nothing changed, no failed attempt recorded, the access token still works   | S2                      |
| confirmation differs; the five policy rows with the failed rule listed; same password                                            | S3, S4, S5              |
| an admin with no player and an admin in the regular view can change their password                                               | design                  |
| the migrated legacy fixture gets an empty `player_contacts`                                                                      | UC-004-10-S6            |

Fully automatable (HLD 2.10: Yes).

**Data Contract Verification**

| Stored                            | Written by                                              | Read by                                               | Handling                                                                                 |
| --------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `player_contacts.email`, `.phone` | `ContactRepository.save` after `ContactValidator.check` | `ContactRepository.get` → `GET /me/contact` → F9 form | any stored text came through the validator; the reader treats a missing row as two nulls |
| `users.password_hash`             | `PasswordChangeService`                                 | `PasswordHasher.verify` (login, next change)          | same string format as F1                                                                 |
| `refresh_tokens.revoked`          | `revokeAllFor`                                          | `AuthService.refresh`                                 | revoked rows refused                                                                     |

Create/read/update/delete for contact: create and update by the upsert, read by `get`, delete by saving
two empty values (the row goes) or by the cascade when the player is merged away.

**Patterns and Conventions**

Validator as a domain class with a typed error; repository SQL only; services orchestrate one use case
each (as `PaymentService`, `GameLifecycleService`); the router maps typed errors to 422. Spanish messages.

**File Changes**

- Modify: `server/src/db/schema.sql`, `server/src/routes/own-router.ts`,
  `server/src/repo/{player-merge-service,index}.ts`, `server/src/index.ts`.
- Create: `server/src/domain/contact-validator.ts`, `server/src/repo/{contact-repository,contact-service,password-change-service}.ts`,
  `server/src/routes/session-router.ts`.
- Delete / Migrate: none beyond the new empty table created by the migrator.
- Tests: `server/src/domain/contact-validator.test.ts`, `server/src/repo/{contact-repository,contact-service,password-change-service}.test.ts`,
  `server/src/routes/{own-router,session-router}.test.ts`, additions to `player-merge-service.test.ts` and
  `schema-migrator.test.ts`.

#### F7 — Switching between admin view and regular view

**Current Implementation**

| Claim                                                                                                                                                  | Tag                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Nothing today distinguishes a view; the admin app is the only app                                                                                      | `verified — source` (`web/src/App.tsx`)               |
| `refresh_tokens.view` and `TokenService`'s `view` claim are designed in F1 and F2; refresh rotation copies the stored view; login stores `'admin'`     | `verified — document` (this document, F1, F2)         |
| `EffectiveRole` makes an admin effective as a player only when `view` is `'regular'`; the guard, `own` routes and the web pick their behaviour from it | `verified — document` (F3)                            |
| "Ajustes" is the `Manage` tab of the admin shell                                                                                                       | `verified — source` (`web/src/App.tsx` lines 158-165) |

**Approach**

Delta only; the server owns the view, the web asks.

`AuthService.switchView(userId, view, refreshToken)` returns `{accessToken, expiresIn, user}` (no new
cookie): load the user; the **base role must be admin** (else 403, UC-004-11-S9); `view === 'regular'`
needs a linked player (else 403, S8); `view === 'admin'` is always allowed to an admin; find the live
refresh row by `hashOf(token)` that belongs to this user (missing or revoked → 401, which makes the
client leave the session); `refreshTokens.setView(row.id, view)`; issue an access token with that
`view`. Because the choice lives in the refresh row, a reload (restore), a refresh after expiry and
a rotation keep it (S6); a new login creates a row with `'admin'` (S7); nothing in the domain tables
changes. An access token issued before the switch keeps its old `view` until it expires, up to 30
minutes (author-accepted).

`SessionUser` (F2) gains `canSwitchView: boolean` = role admin and a linked player, built by one private
method used by login, refresh and switch, so the web can offer or hide "Ver como jugador" (S8).

Route: `POST /api/auth/view` `{view: 'admin' | 'regular'}` on `SessionRouter` (needs the Bearer token
**and** the refresh cookie; a request without the cookie is a 401). A `view` of any other value: 400.

**Impacted Units**

| Unit                                                  | File                                  | Change                 |
| ----------------------------------------------------- | ------------------------------------- | ---------------------- |
| `AuthService.switchView`, `SessionUser.canSwitchView` | `server/src/repo/auth-service.ts`     | modify (created in F2) |
| `POST /auth/view`                                     | `server/src/routes/session-router.ts` | modify (created in F6) |

**Test Methodology**

Per HLD 2.10, route tests with `AuthTestApp`:

| Case                                                                                                                                 | Scenario                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| admin linked to player 1 switches: response `user.mode` is `regular`; `GET /api/debts` is 403 afterwards; `GET /api/me/debts` is 200 | UC-004-11-S1 (server), S2 |
| in the regular view the four own-data routes answer exactly what `OwnDataService` gives player 1                                     | S3                        |
| switching back: organiser routes answer again                                                                                        | S5                        |
| expire the access token (advance 31 minutes) and refresh: still regular; reload-style `restore` too                                  | S6                        |
| log out and log in: admin view                                                                                                       | S7                        |
| admin with no player: `canSwitchView` false and the switch to regular is 403                                                         | S8                        |
| a regular user requesting either view: 403, stays regular                                                                            | S9                        |
| invalid `view`: 400; no cookie: 401; the DB tables other than `refresh_tokens` unchanged                                             | design, non-behavioural   |

Fully automatable.

**Data Contract Verification**

| Stored / exchanged               | Written by                       | Read by                                                                  | Shape                                     |
| -------------------------------- | -------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `refresh_tokens.view`            | `RefreshTokenRepository.setView` | `AuthService.refresh` (copies it into the next row and the access token) | `'admin'` or `'regular'`, `CHECK`-guarded |
| `view` claim of the access token | `TokenService.issueAccess`       | `Authenticate` → `EffectiveRole`                                         | same two values                           |
| `canSwitchView`                  | `AuthService`                    | web `SessionUser`                                                        | boolean                                   |

**Patterns and Conventions**

State kept server-side in the session record, not in client storage; one builder for `SessionUser`; the
route delegates to the service; Spanish messages.

**File Changes**

- Modify: `server/src/repo/auth-service.ts`, `server/src/routes/session-router.ts`.
- Create / Delete / Migrate: none.
- Tests: `server/src/routes/session-router.test.ts` (view cases), `auth-router.test.ts` (`canSwitchView`).

#### F9 — The player's own view

**Current Implementation**

| Claim                                                                                                                                                                                  | Tag                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| The admin shell has five tabs in a bottom `nav.tabs`; `Manage` is the "Ajustes" tab and has sections chosen from a `SECTIONS` list                                                     | `verified — source` (`web/src/App.tsx`; `web/src/pages/Manage.tsx` lines 15-40)                         |
| `PlayerReportPage` holds the picker, the report cards (summary, season statistics, games with an "Otras temporadas" box) and uses `gamesToShow`, `PLAYER_STATS`, `PLAYER_SEASON_STATS` | `verified — source` (`web/src/pages/PlayerReportPage.tsx`; `lib/playerReport.ts`, `lib/playerStats.ts`) |
| The points statistic shows `Puesto <rank> de <of>`                                                                                                                                     | `verified — source` (`lib/playerStats.ts` line 106)                                                     |
| Money is shown with `euros(cents)`, dates with `fmtDate`; hooks fetch with `api.*`                                                                                                     | `verified — source` (`lib/money.ts`, `lib/dates.ts`, `hooks/useDebts.ts`)                               |
| `PaymentValue` in `api.ts` has `payerId` and `holderId` as required numbers                                                                                                            | `verified — source` (`web/src/api.ts` lines 109-132)                                                    |

**Approach**

Delta only. A second shell for the player, small shared pieces, one new section in the admin's Ajustes.

Static mockups of every new screen and state (plain HTML and CSS, sample data) are in
[`design/mockups/index.html`](design/mockups/index.html); the Spanish texts below are the ones they show.

_Shell._ `pages/OwnView.tsx` with props `{ user, onLogout, onSwitchView }` (the same shape `AdminShell`
receives, so either fills the `App` slot): header with the title, the player's name and a "Salir"
button; a bottom `nav.tabs` with **Deudas**, **Pagos**, **Estadísticas**, **Ajustes**; no organiser
tab and no call to an organiser route (UC-004-03-S6). `App` shows it when `user.mode === 'regular'`
(this includes the admin in the regular view).

_Tabs._

- **Deudas** (`components/OwnDebts.tsx`, hook `useOwnDebts`): "Debes" with one line per row (date, amount,
  "tu parte" or "invitado") and the total; if there are rows held by hosts, "Pagan otros por ti" with
  "lo paga <nombre>"; nothing owed: "Estás al día." and `0 €` (S1-S4).
- **Pagos** (`OwnPayments.tsx`, `useOwnPayments`): newest first; date, amount, game; notes "invitado",
  "pagado por <nombre>" or "pagado por otra persona"; empty: "Todavía no hay pagos."
- **Estadísticas** (`OwnStats.tsx`, `useOwnReport`): the report cards extracted from
  `PlayerReportPage` into `components/PlayerReportView.tsx` (props `{report, allSeasons,
onAllSeasons}`), used by both pages, identical for the admin; no editing control anywhere (S6).
- **Ajustes**: `ContactForm` ("Correo electrónico", "Teléfono", "Guardar", messages from the server) with
  `useContact`; and the `AccountPanel`.

_Account panel_ (`components/AccountPanel.tsx`): `PasswordForm` ("Contraseña actual", "Nueva contraseña",
"Repite la nueva contraseña", "Cambiar contraseña"; shows the server's message and failed rules; on
success it calls `onLogout`, so the user lands on the login screen, UC-004-09-S1) and `ViewSwitch`.
`ViewSwitch` renders from the pure `viewSwitchAction(user)`: an admin in the admin view who
`canSwitchView` → "Ver como jugador"; an admin in the regular view → "Volver a administrador"; anyone
else → nothing (S8, S9). It calls `onSwitchView('regular' | 'admin')`.

_In the admin's Ajustes._ `Manage` gets an `account` prop (a node) and a new section **Mi cuenta** that
renders it; `AdminShell` passes `<AccountPanel …/>`. `Manage` knows nothing about users. Decision
(inferred from UC-004-09, "any logged-in user"): the admin changes the password and starts the player
view there; the admin's contact data are edited only from the player view.

_Session glue._ `useSession` (F8) exposes `switchView(view)`, which calls `SessionClient.switchView`
(F8 gains this method: a `POST /auth/view` through the normal request path, storing the new token and
returning the updated `SessionUser`), so `App` re-renders the other shell without a reload. After a
password change `onLogout()` ends the session.

_API client and types._ `api.ts` gains `ownDebts`, `ownPayments`, `ownReport`, `contact`,
`saveContact`, `changePassword` and the types of F5/F6; `SessionUser` gains `canSwitchView`;
`PaymentValue`'s `payerId` and `holderId` become optional (the player's report has none).

_Pure logic_ in `lib/ownDebts.ts`: `debtLines(debts)`, `heldLines(debts)`, `paymentLines(payments)`
(date, euros, the Spanish notes) and `viewSwitchAction(user)`; `lib/playerStats.ts` omits the "Puesto"
figure when the server sent no `rank`.

**Impacted Units**

| Unit                                                                                                                   | File                                                             | Change                              |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| `OwnView`                                                                                                              | `web/src/pages/OwnView.tsx`                                      | create                              |
| `OwnDebts`, `OwnPayments`, `OwnStats`, `PlayerReportView`, `ContactForm`, `PasswordForm`, `ViewSwitch`, `AccountPanel` | `web/src/components/*.tsx`                                       | create                              |
| `useOwnDebts`, `useOwnPayments`, `useOwnReport`, `useContact`, `usePasswordChange`                                     | `web/src/hooks/*.ts`                                             | create                              |
| `debtLines`, `heldLines`, `paymentLines`, `viewSwitchAction`                                                           | `web/src/lib/ownDebts.ts`                                        | create                              |
| `PlayerReportPage`                                                                                                     | `web/src/pages/PlayerReportPage.tsx`                             | modify: uses `PlayerReportView`     |
| `Manage`                                                                                                               | `web/src/pages/Manage.tsx`                                       | modify: `account` prop and section  |
| `AdminShell`                                                                                                           | `web/src/pages/AdminShell.tsx`                                   | modify: passes the account panel    |
| `App`, `useSession`, `SessionClient`                                                                                   | `web/src/App.tsx`, `hooks/useSession.ts`, `lib/sessionClient.ts` | modify: `switchView`, regular shell |
| `api.ts`, `playerStats.ts`                                                                                             | `web/src/api.ts`, `web/src/lib/playerStats.ts`                   | modify                              |
| styles                                                                                                                 | `web/src/styles.css`                                             | modify                              |

**Test Methodology**

Per HLD 2.10: `lib/` unit tests, E2E for the journeys, a manual look at copy and layout.

| Test                        | Cases                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/ownDebts.test.ts`      | "tu parte" row and total 5,00 € (UC-004-05-S1); "lo paga Ana" in its own list and out of the total (S2); two "invitado" rows with no name (S3); empty (S4); payments newest-first notes "pagado por Ana", "invitado", "pagado por otra persona" (UC-004-06); `viewSwitchAction` for admin with player, admin in regular view, admin without player, regular (UC-004-11-S1, S5, S8, S9)                                               |
| `lib/playerStats.test.ts`   | the points figures omit "Puesto" without a rank and keep it with one                                                                                                                                                                                                                                                                                                                                                                 |
| `lib/sessionClient.test.ts` | `switchView` stores the new token and returns the user; a 401 triggers the normal refresh                                                                                                                                                                                                                                                                                                                                            |
| E2E `own-view.spec.ts`      | a regular user logs in and sees only Deudas/Pagos/Estadísticas/Ajustes and no organiser tab (UC-004-03-S6); an admin linked to a player presses "Ver como jugador" in Ajustes, sees the player view, then "Volver a administrador" and the organiser tabs return (UC-004-11-S1, S5); reload in the player view stays there (S6); a contact save shows on reopening; changing the password returns to the login screen (UC-004-09-S1) |

The E2E users are created with the CLI helper of F13 (`create --role regular --player …`), the player
through the admin API. Manual Test Plan (HLD 2.10 row F9; `No` because layout and copy are judged by a
person): at 375 px width, after logging in as a regular user, read each tab: the Spanish text is
natural, amounts show a comma and `€`, nothing overflows horizontally, the "Salir" and tab buttons are
reachable with a thumb; after saving contact data and reloading the page, the values are still shown
(state must persist); after the password change the old password is refused at login.

**Data Contract Verification**

| Consumed                      | Produced by                         | Parsed by                                           | Check                                                                                                                                   |
| ----------------------------- | ----------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `OwnDebts`, `OwnPaymentRow[]` | `OwnRouter` (F5)                    | `useOwnDebts`, `useOwnPayments` → `lib/ownDebts.ts` | field names identical to F5's interfaces; `kind` and `paidBy` handled for every value (`'own' \| 'guest'`; `{name} \| 'other' \| null`) |
| own report                    | `OwnRouter`                         | `useOwnReport` → `PlayerReportView`                 | `rank`, `of`, `payerId`, `holderId` may be absent; `PLAYER_STATS` cell uses `payerName` only when present                               |
| contact                       | `OwnRouter` (F6)                    | `useContact` → form                                 | nulls become empty fields; saving sends only changed keys, `""` to clear                                                                |
| 422 body `{error, rules?}`    | `PasswordChangeError` route mapping | `PasswordForm`                                      | shows `error` and the listed rules                                                                                                      |
| `SessionUser.canSwitchView`   | F7                                  | `viewSwitchAction`                                  | boolean present on login, refresh and switch                                                                                            |

Contact create/read/update/delete: create/update by save, read on open, clear by empty values. No local
storage of any of it.

**Patterns and Conventions**

Frontend standard: data in hooks, pure text and totals in `lib/`, components render (§1); a new shell is
a new component, not a branch inside `AdminShell` (§2); the account panel and report view are shared by
composition; narrow props (§3); `api.ts` is the only seam (§4); two shells share the `{user, onLogout,
onSwitchView}` shape (§5).

**File Changes**

- Modify: `web/src/{api.ts,App.tsx,styles.css}`, `web/src/pages/{AdminShell,Manage,PlayerReportPage}.tsx`,
  `web/src/hooks/useSession.ts`, `web/src/lib/{playerStats,sessionClient}.ts`.
- Create: `web/src/pages/OwnView.tsx`,
  `web/src/components/{OwnDebts,OwnPayments,OwnStats,PlayerReportView,ContactForm,PasswordForm,ViewSwitch,AccountPanel}.tsx`,
  `web/src/hooks/{useOwnDebts,useOwnPayments,useOwnReport,useContact,usePasswordChange}.ts`,
  `web/src/lib/ownDebts.ts`.
- Delete / Migrate: none.
- Tests: `web/src/lib/{ownDebts,playerStats,sessionClient}.test.ts`, `e2e/tests/own-view.spec.ts`.

#### F11 — Dockerfile and `.env.example`, ready for compose or Kubernetes

**Current Implementation**

| Claim                                                                                                                                                                                                                                                          | Tag                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `Dockerfile`, `.dockerignore` or `.env.example` exists; `.env` and `*.db*` and `dist` are git-ignored                                                                                                                                                       | `verified — source` (`ls`; `.gitignore`)                                                                                                                                      |
| `npm run build` builds the web (`web/dist`) then the server (`server/dist`, with `schema.sql` copied to `dist/db`); the server serves `web/dist` found two directories above its own `dist` and its default database path is three directories above `dist/db` | `verified — source` (root and `server/package.json` scripts; `server/src/index.ts` `join(here, '../../web/dist')`; `server/src/db/index.ts` `DB_PATH`)                        |
| `PORT` (8787) and `HOST` (0.0.0.0) are read from the environment                                                                                                                                                                                               | `verified — source` (`server/src/index.ts`)                                                                                                                                   |
| `better-sqlite3` 13.0.3 ships prebuilt binaries for linux x64 and arm64 (glibc and musl) and has no install script, so no compiler is needed; it loads on Node v26.8.2 here from those prebuilds                                                               | `verified — source` (`node_modules/better-sqlite3/prebuilds/`, `package.json`: `"gypfile": false`, no `install` script; no `build/Release` directory yet the test suite runs) |
| The official image `node:26-slim` exists for `amd64` and `arm64`                                                                                                                                                                                               | `verified — invocation` (`docker manifest inspect node:26-slim`)                                                                                                              |
| The `docker` client 29.9.0 is installed here; whether a daemon is reachable is not known                                                                                                                                                                       | `verified — invocation` (`docker info` printed the client section)                                                                                                            |
| `tsx` accepts Node's `--env-file-if-exists=<file>` and only notes a missing file                                                                                                                                                                               | `verified — invocation` (scratch script with and without the file)                                                                                                            |
| The systemd unit sets `NODE_ENV=production` and no secret                                                                                                                                                                                                      | `verified — source` (`deploy/pachanguero.service`)                                                                                                                            |
| The image's `node` user and `node` as process 1 behave as in the official image documentation                                                                                                                                                                  | `assumed` (not read here); resolved by the first run                                                                                                                          |

**Approach**

Delta only. One image serves the SPA and the API as today, takes every setting from the environment,
keeps data and backups on two volume paths, runs as a non-root user, and carries the admin tool.
Shape of the file (final text is written with the task):

```dockerfile
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/      # also web/ and e2e/ package.json so the workspaces resolve
RUN npm ci --ignore-scripts           # no husky/prepare in an image; better-sqlite3 needs none
COPY server server
COPY web web
RUN npm run build && npm prune --omit=dev

FROM node:26-slim
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 \
    PACHANGUERO_DB=/data/pachanguero.db PACHANGUERO_BACKUPS=/backups
WORKDIR /app
# package.json, node_modules, server/package.json, server/dist, web/package.json, web/dist
RUN mkdir -p /data /backups && chown node:node /data /backups
RUN printf '#!/bin/sh\nexec node /app/server/dist/cli/main.js "$@"\n' > /usr/local/bin/pachanguero-admin \
 && chmod +x /usr/local/bin/pachanguero-admin
USER node
VOLUME ["/data", "/backups"]
EXPOSE 8787
CMD ["node", "server/dist/index.js"]
```

- `JWT_SECRET` has **no default** in the image: the server refuses to start without it (F2's
  `AuthConfig`), and the same happens if it is shorter than 32 characters.
- `.env.example` (repository root, committed, fake values) lists every setting with a comment:
  `JWT_SECRET` (placeholder `replace-me`, deliberately shorter than the minimum so an unedited copy does
  **not** start; the comment shows how to make a real one with `node -e` and `crypto.randomBytes`),
  `ACCESS_TOKEN_MINUTES=30`, `REFRESH_TOKEN_DAYS=30`, `COOKIE_SECURE` (commented, with when to set it),
  `PACHANGUERO_DB=/data/pachanguero.db`, `PACHANGUERO_BACKUPS=/backups`, `PORT=8787`, `HOST=0.0.0.0`.
  The real `.env` stays git-ignored.
- `.dockerignore` (new, a companion the build cannot safely lack): `.git`, `node_modules`,
  `**/node_modules`, `**/dist`, `data`, `.env`, `*.db`, `*.db-wal`, `*.db-shm`, `specs`, `e2e/.tmp`,
  `e2e/test-results`, `e2e/playwright-report`. Without it the build context would carry `data/` with
  the live database; the `COPY` lines are explicit as a second guard.
- Development reads the same file: `server/package.json`'s `dev` script becomes `tsx watch
--env-file-if-exists=../.env src/index.ts` (the script runs in `server/`, so `../.env` is the
  repository root's). A developer copies `.env.example` to `.env` and puts a real secret in it.
- Not in scope (author decision): compose or Kubernetes manifests, a registry, TLS, a build script. The
  image is only "ready for" them: configuration by environment, two volumes, one port, a non-root user.

Pre-mortem findings carried: the live database leaking into the build context (`.dockerignore`); the
husky `prepare` hook failing without `.git` (`--ignore-scripts`); Node as process 1 ignores `SIGTERM` by
default, so `docker stop` waits and kills (SQLite's WAL tolerates that; `docs/backup_and_restore.md` and
the README advise `--init`/`init: true`); a bind-mounted volume owned by another user cannot be written
by `node` (the document says to `chown` it to uid 1000, the official image's `node` user, `assumed`).

**Impacted Units**

| Unit                 | File                  | Change |
| -------------------- | --------------------- | ------ |
| image definition     | `Dockerfile`          | create |
| build context filter | `.dockerignore`       | create |
| settings template    | `.env.example`        | create |
| `dev` script         | `server/package.json` | modify |

**Test Methodology**

Per HLD 2.10 (partly automatable). Automated, in the server suite: `server/src/repo/auth-config.test.ts`
reads `.env.example` and checks (a) it names every environment key `AuthConfig` and `db/index.ts` read
(so the template cannot drift), and (b) `AuthConfig.fromEnv` throws when given the example's values
(the placeholder must not start a server). Manual Test Plan (needs a Docker daemon, which this
environment may lack):

1. `docker build -t pachanguero .` completes (on amd64; repeat on the Raspberry Pi or with
   `--platform linux/arm64` for the `arm64` prebuild).
2. `docker run` with no `JWT_SECRET`: the container exits non-zero and the log names the missing key.
3. With a real secret and two named volumes: `POST /api/auth/refresh` without a cookie answers 401, `/`
   serves the SPA, and `docker exec -i <c> pachanguero-admin create --username … --role admin` (password
   on stdin) creates a user who can then log in.
4. Make a player, run `pachanguero-admin backup`: the file appears in the `/backups` volume and can be read
   from the host.
5. Remove and recreate the container on the same volumes: the player, the user and the backup are still
   there (state that must persist).

**Data Contract Verification**

| Name                                                                        | Written in                                   | Read in                                     | Check                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `JWT_SECRET`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `COOKIE_SECURE` | `.env.example`, the operator's environment   | `AuthConfig.fromEnv` (F2)                   | same names; the drift test above                        |
| `PACHANGUERO_DB`, `PACHANGUERO_BACKUPS`                                     | `Dockerfile` `ENV`, `.env.example`           | `db/index.ts` (`DB_PATH`, `BACKUP_DIR`, R1) | same names and the paths the volumes mount              |
| `/app/server/dist/cli/main.js`                                              | `tsc` from `src/cli/main.ts` (rootDir `src`) | the `pachanguero-admin` wrapper             | the compiled path follows `server/tsconfig.json`        |
| `web/dist` two levels above `server/dist`                                   | `npm run build`                              | `index.ts`                                  | layout `/app/server/dist` and `/app/web/dist` preserved |

**Patterns and Conventions**

Multi-stage build (build tools and dev dependencies stay out of the runtime image); configuration by
environment (twelve-factor); least privilege (non-root user, no secret in the image); the template
committed with fake values. Nothing here changes application behaviour.

**File Changes**

- Modify: `server/package.json`.
- Create: `Dockerfile`, `.dockerignore`, `.env.example`.
- Delete / Migrate: none (`deploy/*` is left alone, see Documentation Impact).
- Tests: the drift cases added to `server/src/repo/auth-config.test.ts`.

#### F14 — Documentation for operators and the domain

**Current Implementation**

| Claim                                                                                                                                    | Tag                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The documents that state what this work package changes are listed, with the passage, in section 4                                       | `verified — source` (each passage read: `AGENTS.md` lines 15, 67-70; `README.md` configuration table, deployment and backup paragraphs; `docs/test-strategy.md` E2E section; `deploy/pachanguero.service`) |
| `README.md`, `docs/domain-model/*` and the new operator documents are in Spanish; `AGENTS.md` and `docs/test-strategy.md` are in English | `verified — source` (those files)                                                                                                                                                                          |
| Prettier formats Markdown and `format:check` must pass                                                                                   | `verified — source` (`package.json` `lint-staged`, `AGENTS.md`)                                                                                                                                            |
| The backup procedure is in one place today (the README)                                                                                  | `verified — source` (`README.md`, "Copia de seguridad")                                                                                                                                                    |

**Approach**

Delta only. Each fact has one home and the others link to it: the backup procedure lives only in
`docs/backup_and_restore.md`; the rules of users and roles only in
`docs/domain-model/usuarios-y-roles.md`; commands and settings in the README. Each edit is a paragraph
or a table row, not a rewrite. Text written by the implementation task follows the documentation
skills' conventions (verified against the final code, not against this plan).

**Impacted Units**

| Document                                | Action                                    |
| --------------------------------------- | ----------------------------------------- |
| `AGENTS.md`                             | Modify (section 4)                        |
| `README.md`                             | Modify (section 4)                        |
| `docs/test-strategy.md`                 | Modify (section 4)                        |
| `docs/domain-model/glossary.md`         | Modify                                    |
| `docs/domain-model/README.md`           | Modify (index row)                        |
| `docs/domain-model/usuarios-y-roles.md` | Create (Spanish)                          |
| `docs/backup_and_restore.md`            | Create (Spanish)                          |
| `deploy/pachanguero.service`            | Modify, one comment line only (section 4) |

**Test Methodology**

Per HLD 2.10 (documentation: not automatable beyond formatting). Mechanical: `npm run format:check`
passes. Review checklist run by the implementer against the final code: every command in the documents
exists and runs as written; every setting named is read by the code; every route, role and message named
exists; no document still says the old thing listed in section 4; the new documents link to each other
and to the README. Manual Test Plan: follow `backup_and_restore.md` and the README "primer
administrador" steps on a clean checkout as a stranger would (create the first admin, log in, make a
backup, restore it on a copy) and note any step that needs knowledge the text does not give.

**Data Contract Verification**

Not relevant: the documents store no data. The only contracts are the literal commands and settings
they quote, checked by the review above.

**Patterns and Conventions**

Single source of truth, progressive disclosure (README short, details linked), Spanish for the group's
documents and English for the developer ones, no identifier of this work package in any shipped document
(only plain statements of what the system does).

**File Changes**

- Modify: `AGENTS.md`, `README.md`, `docs/test-strategy.md`, `docs/domain-model/glossary.md`,
  `docs/domain-model/README.md`, `deploy/pachanguero.service`.
- Create: `docs/domain-model/usuarios-y-roles.md`, `docs/backup_and_restore.md`.
- Delete / Migrate: none.
- Tests: `npm run format:check`.

## 4. Documentation Impact

One subsection per document this design makes untrue. No document that ships may name this work package
or any of its identifiers.

#### AGENTS.md

- **`server/src/db/` paragraph** says "no migration system — edit `schema.sql` directly; a changed table
  definition needs the local DB file … deleted". Stops being true: files carry a version stamp
  (`user_version`), a start on an older file makes a backup and migrates, and a changed table definition is
  a new migration step (plus the same change in `schema.sql` for new files). Replace with that rule and
  the backups location; keep the "delete and reseed" note only for throwaway local databases.
- **Architecture list** gains the new places: domain access classes (policies, hasher, token service,
  effective role, own-data disclosure), the identity services in `repo/`, the guard and routers in
  `routes/` (admin routes are the unchanged `api.ts` behind the guard; a new route there is admin-only), the
  operator CLI in `server/src/cli/`, and the web description ("`App.tsx` holds three tabs") becomes: `App`
  chooses login, the admin shell (the tabs) or the player's own view.
- **Identity** says the app replaces the spreadsheet and has no users. Add one sentence: it has two roles
  and logs in; link to `usuarios-y-roles.md`.
- **Commands** gains `npm run admin --workspace=server -- <command>` and says `npm run dev` reads
  `JWT_SECRET` from `.env` (copy `.env.example`).
- **Domain invariants** gains one bullet pointing to the roles document (a player sees only their own
  rows; the server decides; the admin's view switch).

#### README.md

- **Configuration table** gains `JWT_SECRET` (required), `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`,
  `COOKIE_SECURE`, `PACHANGUERO_BACKUPS`; the `PACHANGUERO_DB` row stays.
- **"Copia de seguridad: es un fichero" with the `sqlite3 … .backup` command** stops being true as advice:
  a plain copy of the file loses the recent writes in the `-wal` file, and the container has no `sqlite3`.
  Replace with the `pachanguero-admin backup` command and a link to `docs/backup_and_restore.md`.
- **New short section "Usuarios y acceso"**: create the first admin (`pachanguero-admin create --role
admin`), create a player's user, reset a password, the link to the roles document; the `.env` step for
  development.
- **Deployment section** (systemd and Caddy) is untouched by decision, but the unit sets `NODE_ENV=production`
  and so now needs `JWT_SECRET`: add one sentence under it saying so (an `EnvironmentFile` line).

#### docs/test-strategy.md

- **E2E section** says the specs call the API and the page without credentials. Replace: the specs log in
  through a fixture (admin user created by the CLI against the disposable database, login at the start of
  each test so every context has its own refresh cookie); there is no switch that turns authentication off.
- **Integration section** gains: route tests of authenticated areas use the shared test application (a
  controllable clock and real tokens); `api.test.ts` mounts the bare admin router and needs no token;
  the access-guard test lists every route of every router.

#### docs/domain-model/glossary.md

- New entries: **Usuario** (login account, separate from the player; a username is not the player's name),
  **Administrador** / **Jugador (usuario normal)**, **Vista** (administrador or jugador; the admin can look
  at the app as a player), **Copia de seguridad**.

#### docs/domain-model/README.md

- The index table gains the row for `usuarios-y-roles.md`.

#### docs/domain-model/usuarios-y-roles.md (new, Spanish)

Contents, so nothing is left to be invented: the two roles and what each sees; one user per player and
that a user's login name is not the player's name; how users are created (CLI only, no registration);
session rules (30 minutes access, 30 days refresh, one lock after five failed passwords for fifteen minutes,
the accepted 30-minute limit after a deactivation); what a player sees of other players (nothing but the
host's name on a share the host holds for them, and "invitado"); the contact data (email and phone, optional,
not used to send anything); password policy and change; the view switch; what a player cannot see (standings,
positions, other players' debts). Linked from the roles row of the index.

#### docs/backup_and_restore.md (new, Spanish)

The two kinds of backup (automatic before a migration, and `pachanguero-admin backup` at will), where the
files are (`PACHANGUERO_BACKUPS`, default `backups/` next to the database), how to keep them readable from
outside a container (mount a separate volume at `/backups`; examples as text for `docker run -v` and for
a compose or Kubernetes volume, with no deployment file shipped), the file mode and why (it holds password
hashes), that copies are never deleted automatically, and the manual restore (stop the app, replace the
database file with the chosen copy and delete its `-wal` and `-shm`, start, check). Single home of the
procedure.

#### deploy/pachanguero.service

- One comment line: the unit needs `JWT_SECRET` in its environment now (for example `EnvironmentFile=`).
  Nothing else changes; the Caddyfile is not made untrue.

#### .agents/rules/coding-standard.md and frontend-coding-standard.md

None: looked. They govern how the new code is written (classes on the server, hooks and `lib/` on the web)
and the design follows them.

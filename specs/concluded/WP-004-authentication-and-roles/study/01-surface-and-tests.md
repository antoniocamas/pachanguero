# Surface, tests and per-player data (Q-01, Q-02, Q-03)

Searched: `server/src/routes/api.ts` (all handlers), `server/src/routes/api.test.ts` (setup),
`server/src/index.ts`, `web/src/api.ts`, `web/src/App.tsx`, `e2e/playwright.config.ts`,
`e2e/tests/*`, `server/src/repo/{debt-repository,player-report-service,payment-service}.ts`.

## Q-01 — The API surface

- `routes/api.ts` is one Express `Router` mounted at `/api` in `index.ts`, with no middleware in
  front of it: no auth, no CORS, no rate limit, no helmet. About 45 handlers, each wrapped in
  `route()`, which turns a throw into a 400 through Express's default error path.
- Read-only (GET): seasons (list, current, missing, standings), outstanding debts, players
  (all, by season, details), player report, schedule, games (list, detail, teams), candidate lines.
- Everything else mutates: seasons, players (create, edit, merge, aliases, seniority), schedule,
  games and their lifecycle, candidates, convocatoria, payments, teams.
- There is no per-player read. A regular user's view needs new endpoints (their debts, payments,
  statistics, own email/phone); the existing GET routes return the whole group's data and must
  become admin-only, or be filtered.
- Client: `web/src/api.ts` has one `call()` helper that every request goes through, so a token
  header (or cookie handling, and a 401 handler) has exactly one place to go. `App.tsx` holds three
  tabs (GameDay, Standings, Manage), no router, and refetches everything. A login screen and a
  regular-user shell would sit in front of it; nothing in `App.tsx` knows about users.
- Route ownership by risk: the player report route (`/players/:playerId/report`) takes any id, so
  a regular user must be prevented from passing someone else's.

## Q-02 — Tests that auth will break

- `api.test.ts` builds its own Express app (`express.json()` + `api` router) against a temp DB and
  calls routes with bare `fetch`. If auth is a middleware mounted in `index.ts` (not inside the
  `api` router), this suite keeps passing untouched. If it is mounted inside the router, every
  call in the 1046-line file would need a token. **Decision input for Design:** mount auth outside
  `api.ts`, or give the test app a test token helper.
- E2E: `playwright.config.ts` uses `/api/seasons` as the server-ready probe and the specs call the
  API directly with `request.get/post` (`/api/seasons/current`, `/api/seasons`, standings…). With
  auth on, the probe returns 401 and the specs have no token. They need either an auth-disabled
  test mode (risky: a flag that turns security off) or a seeded admin plus a logged-in
  `storageState`/token fixture. The second is safer.
- Domain and repo tests use `TestDatabase.create()` (in-memory DB from the real `schema.sql`), so
  they only need to keep passing with the new tables, not with tokens.
- `web` tests are `lib/` pure-function tests; unaffected by auth.

## Q-03 — Per-player debts, payments, statistics

- Debts: `share_debts` has `holder_player_id` (answers for the share) and
  `beneficiary_player_id` (whose share it is, or null for an anonymous plus-one). So "my debts" is
  ambiguous: what I owe as holder (including plus-ones I brought) versus the shares that are mine
  but another holds. `DebtRepository.outstanding()` returns every row with names; filtering by
  holder is a simple `WHERE`.
- Payments: `payments` has `payer_player_id`, `holder_player_id`, `beneficiary_player_id`. "My
  payments" can mean paid by me or for me. The two differ when someone pays for others.
- Statistics: `PlayerReportService.report(playerId, today)` already returns one player's games,
  season stats and summary, built from `PlayerGameStat`/`PlayerSeasonStat`. It is the natural
  basis for the regular view and needs no new calculation, only an ownership check on `playerId`.
- Privacy leak to check: other players' names appear in debt rows (holder/beneficiary names for
  shares the user holds for others). Showing a plus-one's host is fine; showing other named
  beneficiaries may not be. Open for Requirements.

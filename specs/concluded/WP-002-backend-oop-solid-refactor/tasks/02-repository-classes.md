# 02 — Repository classes: Season, Player, Game, Participation, Exclusion

**Type:** Refactor. **Iteration:** 1. **Elements:** E5, E6, E7, E8, E9. **Depends on:** task 01
(`ExclusionHistory`, for `ExclusionRepository.historyFor`).

## Mandatory Reading

- `DESIGN_PLAN.md` §1-5 and element rows E5-E9 in §6 with LLD subsections (E9 in particular:
  `historyFor`'s return-shape change).
- `docs/test-strategy.md` §Integration.
- `.agents/rules/coding-standard.md`.
- `AGENTS.md` — discover, via its own documentation-routing rules, any further guideline covering
  `server/src/repo.ts`/persistence.

## Description

Create `server/src/repo/{season,player,game,participation,exclusion}-repository.ts`, each wrapping
today's corresponding `repo.ts` exports as methods on a class constructed with the shared
`Database.Database` handle. Verified together: all five are mechanically identical CRUD wrappers
over the same connection, run through one integration test pass. Do not delete `server/src/repo.ts`
yet (task 04 does, once every consumer has moved).

## Guidelines

1. `SeasonRepository(conn)`: `list()`, `get(id)`, `active()`, `create(input)`, `update(id, patch)`,
   `activate(id)`, `rulesOf(season)` — one method per today's `listSeasons`/`getSeason`/
   `activeSeason`/`createSeason`/`updateSeason`/`activateSeason`/`rulesOf`, same SQL, same
   arguments and return shape.
2. `PlayerRepository(conn)`: `list(seasonId)`, `add(seasonId, name, seasons)`,
   `updateSeasonPlayer(seasonId, playerId, patch)` — mapping `listPlayers`/`addPlayer`/
   `updateSeasonPlayer`.
3. `GameRepository(conn)`: `list(seasonId)`, `get(id)`, `create(seasonId, playedOn, label?,
status?)`, `update(id, patch)`, `delete(id)` — mapping `listGames`/`getGame`/`createGame`/
   `updateGame`/`deleteGame`.
4. `ParticipationRepository(conn)`: `list(gameId)`, `set(gameId, playerId, patch)`,
   `remove(gameId, playerId)` — mapping `listParticipations`/`setParticipation`/
   `removeParticipation`, preserving `setParticipation`'s `paid_on` stamping logic exactly
   (`repo.ts` lines 267-274: stamps today's date when `paid_cents` turns positive with no explicit
   `paid_on`, clears it otherwise).
5. `ExclusionRepository(conn)`: `set(gameId, playerId, kind)` — same as today's `setExclusion`;
   `historyFor(seasonId, upToGameId?)` — same query as today (`repo.ts` lines 306-328), then wraps
   each player's raw kinds: `new Map([...raw].map(([id, kinds]) => [id, new
ExclusionHistory(kinds)]))`.
6. Do not wire any of these into `routes/api.ts` or `import-season.ts` yet — that's task 03/04.

## Tests

- Integration (Vitest, real temp-file SQLite DB built from the actual `schema.sql`, never mocked —
  `docs/test-strategy.md` §Integration): for each method, the same fixture calls today's `repo.ts`
  functions are exercised with, asserting the same resulting rows/writes — including the
  `paid_on` stamping edge case and `historyFor`'s wrapped-value shape (its `ExclusionHistory`
  instances expose the same `waitCounter`/`mercyCount`/`demotionCount` results the pre-move free
  functions would have).

## Definition of Done

- [x] All five repository classes exist; each method's SQL matches its `repo.ts` counterpart
      (ported statement-for-statement, spot-checked against `repo.ts` lines 37-328).
- [x] Integration tests exist and pass for all five classes (real in-memory SQLite DB built from
      the actual `schema.sql`, via a new `TestDatabase` test-support factory).
- [x] `npm test` passes (70 tests, 10 files — the 48 from task 01 plus 22 new).
- [x] Graduation: UC-002-04 (hard requirement), the persistence slice realized.
- [x] Code checks: `npm run lint` passes.
- [x] Regression: `npm test` (and `npm run build` also verified clean).

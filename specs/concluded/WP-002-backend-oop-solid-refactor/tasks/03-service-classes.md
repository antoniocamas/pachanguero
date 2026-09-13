# 03 — Service classes: `StandingsService`, `ConvocatoriaService`

**Type:** Refactor. **Iteration:** 1. **Elements:** E10, E11. **Depends on:** tasks 01, 02.

## Mandatory Reading

- `DESIGN_PLAN.md` §1-6, element rows E10 and E11 with LLD subsections (E10's transaction
  preservation is the checkpoint-worthy part).
- `docs/test-strategy.md` §Integration.
- `.agents/rules/coding-standard.md`.

## Description

Create `server/src/repo/standings-service.ts` and `server/src/repo/convocatoria-service.ts`.
`ConvocatoriaService` depends on `StandingsService`, so build and verify them together in this task
rather than splitting.

## Corrections found while implementing (task's own guidelines, fixed locally)

Two gaps in `DESIGN_PLAN.md` §3's sketch, found while porting the bodies below — neither changes
any decided behavior, both are construction-detail omissions:

- `StandingsService`'s constructor as sketched (`players, participations, exclusions, seasons,
points`) has no way to run `standings`'s own join queries (`repo.ts` lines 361-389: the
  paid/games-played and debt aggregates, joining `participations`/`games` directly, plus the
  `upToGameId` date lookup) — none of those map to a single existing repository method, and
  `ParticipationRepository` itself turns out unused once queried directly. Fix: constructor becomes
  `(players, exclusions, seasons, points, conn: Database.Database)` — drop `participations`, add
  `conn`.
- `ConvocatoriaService`'s constructor as sketched (`games, participations, exclusions, standings,
builder`) has no way to touch the `convocatorias`/`convocatoria_entries` tables directly, and
  `commit` needs a transaction spanning them plus `ExclusionRepository`/`ParticipationRepository`
  calls; it also needs a season's rules (`rulesOf`), which only `SeasonRepository` knows how to
  compute — re-deriving that mapping here would duplicate it. Fix: constructor becomes
  `(games, participations, exclusions, standings, builder, seasons: SeasonRepository, conn:
Database.Database)` — `conn` for the two tables and the transaction (via
  `this.conn.transaction(fn)()`, the same pattern task 02's repositories already use — not the
  global `tx()` helper, so this class doesn't reach for a free function it doesn't need to);
  `seasons` so `rulesOf(game)` is just `this.seasons.rulesOf(this.seasons.get(game.season_id)!)`.
- `savedConvocatoria` (`repo.ts` lines 478-490) was listed in `REQUIREMENTS.md` §3's mapping table
  as moving to `ConvocatoriaService` but never sketched in `DESIGN_PLAN.md` §3's interface. Fix:
  add `saved(gameId)`, same body as today's `savedConvocatoria`, using the same `conn`.
- `ExclusionHistory` (task 01) has `waitCounter`/`mercyCount`/`demotionCount` but not the plain
  "how many points/demoted exclusions in total" count `standings`'s per-player fold needs (`repo.ts`
  line 398: `(history.get(p.id) ?? []).filter((k) => k !== 'mercy').length`) — that line operated on
  the raw array `historyFor` used to return; now that `historyFor` returns `ExclusionHistory`
  instances, the count needs a method. Fix: add `exclusionCount()` to `ExclusionHistory`
  (`server/src/domain/exclusion-history.ts`), and one test to `exclusion-history.test.ts` — both
  from task 01's file, extended here since this task is what needs it.

## Guidelines

1. `ExclusionHistory.exclusionCount()`: `this.kinds.filter((k) => k !== 'mercy').length` (see
   correction above).
2. `StandingsService(players, exclusions, seasons, points: PointsCalculator, conn: Database.Database)`:
   port `standings`'s body (`repo.ts` lines 349-418) unchanged in logic — the `paid`/
   `games_played` query, the debt query (via `SeasonRepository.get`/`rulesOf`), and the per-player
   fold now calling `this.exclusions.historyFor(...)`, `.exclusionCount()`, and
   `this.points.compute(...)`.
3. `ConvocatoriaService(games, participations, exclusions, standings: StandingsService, builder:
ConvocatoriaBuilder, seasons: SeasonRepository, conn: Database.Database)`:
   - `preview(gameId)`: port `repo.ts` lines 423-443 — read the game, the signed-up participant
     ids, the standings table (via `this.standings`), build `Contender[]`, call
     `this.builder.build(...)`.
   - `commit(gameId)`: port `repo.ts` lines 446-476 **exactly**, including the single transaction
     — delete-then-insert into `convocatorias`/`convocatoria_entries`, delete-then-set
     `exclusions`, then `participations.played` per entry, in the same order.
   - `saved(gameId)`: port `savedConvocatoria` (`repo.ts` lines 478-490).
4. Neither class constructs its own dependencies — both take everything via constructor
   (`DESIGN_PLAN.md` §3, as corrected above).

## Tests

- Integration (Vitest, real temp-file DB):
  - `StandingsService`: same fixture seasons/games/participations as today's `standings` behavior,
    matching sorted table and debt figures.
  - `ConvocatoriaService`: existing oversubscribed/non-oversubscribed convocatoria fixtures, run
    through `commit`, asserting the same rows land in `convocatorias`/`convocatoria_entries`/
    `exclusions`/`participations` as today's `commitConvocatoria`; a re-commit replaces rather than
    accumulates.

## Definition of Done

- [x] `StandingsService` and `ConvocatoriaService` exist, composed via constructor injection only
      (constructors corrected per the notes above; both verified free of top-level free functions).
- [x] `commit`'s transaction is byte-for-byte the same sequence of statements as today's
      `commitConvocatoria` (same delete-then-insert order, same single transaction).
- [x] Integration tests exist and pass for both, including the re-commit-replaces case.
- [x] `npm test` passes (78 tests, 12 files — 8 new this task).
- [x] Graduation: UC-002-04 (hard requirement) and UC-002-04-S2 specifically, realized.
- [x] Code checks: `npm run lint` passes.
- [x] Regression: `npm test` (and `npm run build` also verified clean).

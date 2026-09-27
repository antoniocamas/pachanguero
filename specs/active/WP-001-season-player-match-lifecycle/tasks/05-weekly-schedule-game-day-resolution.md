# Task 05 — Weekly schedule + game-day auto-resolution

## Type

**Feature.** Iteration 1. Elements absorbed: **F3**. No hard dependency on tasks 01-04. Ordered
fifth because task 06 (F4) reuses its `ScheduleResolver`, and task 08 (F6) reuses its
`GameDayResolutionService`.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `F3 — Weekly schedule + game-day auto-resolution`
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/domain/`, `server/src/repo/`, and `server/src/routes/`.

## Description

Add a versioned `weekly_schedule` table, a pure `ScheduleResolver` domain class, a create-only
`ScheduleRepository`, `GameRepository.findOrCreate`, and a `GameDayResolutionService` that resolves a
paste date to the owning (or newly created) game.

## Guidelines

1. In `server/src/db/schema.sql`: add
   `CREATE TABLE weekly_schedule (id INTEGER PRIMARY KEY, weekday INTEGER NOT NULL, kickoff_time
TEXT NOT NULL, effective_from TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT
CURRENT_TIMESTAMP)` — `weekday` is 0-6 per JS `Date.getDay()` (Sunday=0).
2. Create `server/src/domain/schedule-resolver.ts`: class `ScheduleResolver(rows)` with:
   - private `effectiveRow(asOf: string)` — the row with the greatest `effective_from <= asOf`.
   - `nextOccurrenceOnOrAfter(asOf: string): string` — `effectiveRow(asOf)`'s weekday, the next date
     on or after `asOf` that falls on it (today itself if today already is that weekday).
   - `cutoffFor(gameDate: string): string` — `effectiveRow(gameDate)`'s `kickoff_time` plus one hour,
     as an ISO datetime on `gameDate`. Used by task 06 (F4).
     Both methods resolve against the row effective **as of the date being asked about**, never
     "today" — this is what makes non-retroactivity hold.
3. Create `server/src/repo/schedule-repository.ts`: class `ScheduleRepository` with `list()` (all
   rows, any order) and `create(row)` only — deliberately **no** `update`/`delete`, so an old row can
   never be mutated.
4. In `server/src/repo/game-repository.ts`: add `findOrCreate(seasonId, playedOn): GameRow` — plain
   `SELECT` first, `create` only on miss.
5. Create `server/src/repo/game-day-resolution-service.ts`: class
   `GameDayResolutionService(games, schedule, seasons)` with `resolveTarget(pasteDate: string):
GameRow` — builds a `ScheduleResolver` from `schedule.list()`, computes the game date via
   `nextOccurrenceOnOrAfter(pasteDate)`, resolves the season via `seasons.current(gameDate)` (task
   02), finds-or-creates the game via `games.findOrCreate`.
6. In `server/src/routes/api.ts`: add `GET`/`PUT /schedule`.

## Tests

Testability Assessment: F3 = Yes, fully automatable.

- `server/src/domain/schedule-resolver.test.ts` (vitest, unit, **new**):
  - Monday 22:00 effective from `2026-01-05`; paste on `2026-01-06` (Tuesday) → `2026-01-12` (next
    Monday). Paste on `2026-01-05` itself → `2026-01-05`.
  - Mid-season change: second row, Wednesday 21:00 effective from `2026-03-02`. Paste on
    `2026-02-20` (before) still resolves against Monday 22:00; paste on `2026-03-04` (after)
    resolves against Wednesday 21:00.
- `server/src/repo/schedule-repository.test.ts` (vitest, integration, **new**): `list()`/`create()`
  round-trip; confirm no `update`/`delete` method exists (compile-time).
- `server/src/repo/game-day-resolution-service.test.ts` (vitest, integration, **new**):
  `resolveTarget`, called twice for pastes landing on the same computed date, returns the same game
  row both times (no duplicate `games` row, matching `UNIQUE (season_id, played_on, label)`).
- `server/src/repo/game-repository.test.ts` (vitest, integration, modify): `findOrCreate` idempotency
  fixture.
- `server/src/routes/api.test.ts` (vitest, integration, modify): `GET`/`PUT /schedule` coverage.

## Definition of Done

- [ ] `weekly_schedule` table exists, `effective_from UNIQUE`.
- [ ] `ScheduleResolver.nextOccurrenceOnOrAfter`/`cutoffFor` pass the fixtures above, including the
      mid-season non-retroactivity fixture.
- [ ] `ScheduleRepository` exposes only `list()`/`create()`.
- [ ] `GameRepository.findOrCreate` is idempotent (tested).
- [ ] `GameDayResolutionService.resolveTarget` exists and is tested.
- [ ] `GET`/`PUT /schedule` exist and are tested.
- [ ] **Graduation:** F3 realises UC-001-08-S1..S4 — graduation value is
      `schedule-resolver.test.ts` + `schedule-repository.test.ts` +
      `game-day-resolution-service.test.ts` + `game-repository.test.ts` + `api.test.ts`.
- [ ] **Documentation:** none — F3 is not named in `DESIGN_PLAN.md` §2.8/§4.
- [ ] **Tests:** `npm test --workspace=server` passes.
- [ ] **Regression:** deferred to task 12.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

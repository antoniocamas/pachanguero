# Task 06 — Final-list target auto-resolution (cutoff = kickoff + 1h)

## Type

**Feature.** Iteration 1. Elements absorbed: **F4**. Depends on task 05 (F3) — reuses
`ScheduleResolver.cutoffFor`, already built there, unmodified.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsections `F4 — Final-list target auto-resolution` and (for the reused
  `ScheduleResolver`) `F3 — Weekly schedule + game-day auto-resolution`
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/repo/` and `server/src/routes/`.

## Description

Add `GameRepository.unresolvedOnOrBefore` and a `FinalListTargetResolver` that finds the game a
final-list paste with no explicit `gameId` should target: the oldest unresolved game, with today's
own game eligible only once kickoff + 1h has passed (reusing task 05's `ScheduleResolver.cutoffFor`).

## Guidelines

1. In `server/src/repo/game-repository.ts`: add `unresolvedOnOrBefore(asOf: string): GameRow[]` —
   `SELECT * FROM games WHERE status NOT IN ('played','cancelled') AND played_on <= @asOf ORDER BY
played_on DESC`.
2. Create `server/src/repo/final-list-target-resolver.ts`: class
   `FinalListTargetResolver(games, schedule)` with `resolve(now = new Date()): GameRow | undefined`:
   - `today = isoDate(now)`; `[first, ...rest] = games.unresolvedOnOrBefore(today)`.
   - If no `first` → `undefined`.
   - If `first.played_on === today`: compute `cutoff = new ScheduleResolver(schedule.list())
.cutoffFor(today)`; if `now < cutoff`, return `rest[0]` (fall back to the earlier unresolved
     game — not yet eligible).
   - Otherwise return `first`.
3. In `server/src/routes/api.ts`: add `GET /games/final-list-target` → `{ game: GameRow | null }`.
   This task adds only the primitive route; F9 (task 10) is what will call `resolve()` internally as
   a default when its own paste endpoint gets no explicit `gameId`.

## Tests

Testability Assessment: F4 = Yes, fully automatable.

- `server/src/repo/final-list-target-resolver.test.ts` (vitest, integration, **new**), using task
  05's Monday-22:00-schedule fixture (cutoff 23:00):
  - Two unresolved games, `2026-01-05` (today) and `2025-12-29` (older). `now = 2026-01-05T22:30`
    (before cutoff) → returns the `2025-12-29` game. `now = 2026-01-05T23:15` (after cutoff) →
    returns the `2026-01-05` game.
  - Only one unresolved game, older than today (no game exists for today yet) → returned regardless
    of time of day.
  - No unresolved games at all → `undefined`; the route returns `{ game: null }`.
- `server/src/repo/game-repository.test.ts` (vitest, integration, modify):
  `unresolvedOnOrBefore` fixtures.
- `server/src/routes/api.test.ts` (vitest, integration, modify): `GET /games/final-list-target`
  coverage.

## Definition of Done

- [x] `GameRepository.unresolvedOnOrBefore` exists and is tested.
- [x] `FinalListTargetResolver.resolve` passes all three cutoff-boundary fixtures above.
- [x] `GET /games/final-list-target` exists and is tested.
- [x] **Graduation:** F4 realises UC-001-10-S1..S3 — graduation value is
      `final-list-target-resolver.test.ts` + the modified `game-repository.test.ts`/`api.test.ts`.
- [x] **Documentation:** none — F4 is not named in `DESIGN_PLAN.md` §2.8/§4.
- [x] **Tests:** `npm test --workspace=server` passes.
- [x] **Regression:** deferred to task 12.
- [x] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

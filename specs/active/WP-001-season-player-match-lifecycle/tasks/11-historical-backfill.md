# Task 11 — Historical backfill

## Type

**Feature.** Iteration 1. Elements absorbed: **F10**. Depends on task 02 (F1 —
`SeasonRepository.current(asOf)`) and task 10 (F9 — `FinalListResolutionService`, reused not
duplicated).

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `F10 — Historical backfill`, plus the `F1` and `F9` subsections it
  reuses unchanged
- `.agents/rules/frontend-coding-standard.md` (for the small UI form)
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/routes/` and `web/src/pages/`.

## Description

Add `POST /games` (body `{ played_on }`, no `seasonId`) — derives the owning season via
`seasons.current(played_on)` (task 02, called with the _backfilled_ date, never today). Delete the
existing `POST /seasons/:id/games` route, which required a manually-picked season, entirely — not
left alongside, since the invariant "never a manual season pick" only holds if the forbidden path is
actually gone.

## Guidelines

1. In `server/src/routes/api.ts`:
   - Add `POST /games` — body `{ played_on: string }`. Call `seasons.current(played_on)`; throw
     (naming the date) if no season covers it. On success, call the existing
     `GameRepository.create(seasonId, played_on)` unchanged.
   - Before removing it, run LSP find-references on `games.create` to confirm `POST
/seasons/:id/games` (`routes/api.ts:112-127`, the current handler) is its only caller — no
     other route, script, or test constructs a game through it with an explicit season id.
   - Delete `POST /seasons/:id/games`.
2. Add nothing else server-side: the Organizer's workflow is `POST /games` (this task) to create the
   historical row, then `POST /games/final:paste` (task 10, already built) with that game's id
   explicit to record its outcome. Nothing in task 10's `paste`/`resolve` requires a prior
   Convocatoria to exist.
3. In `web/src/pages/GameDay.tsx` or `web/src/pages/Manage.tsx`: add an explicit "record a past
   game" form — a date field, then hands off to task 10's final-list paste with that game's id.

## Tests

Testability Assessment: F10 = Yes (the Manual Test Plan guideline below is carried for the UI form,
not this backend logic).

- `server/src/routes/api.test.ts` (vitest, integration, modify):
  - Three seasons on record (2023, 2024, 2025 start years), a date inside the 2024 season's range →
    `POST /games` creates a game with `season_id` = the 2024 season's id, never whatever season is
    `current()` today.
  - A date in an intentionally-skipped year (no season row) → `POST /games` throws, naming the date.
  - End-to-end: `POST /games` for a 2024 date, priced at that season's `price_cents` (constructed to
    differ from the current season's), then `POST /games/final:paste` with that game's id explicit →
    the computed `paid_cents` uses the 2024 season's `perHead`, not the current season's.
  - A first-appearing player in that same backfilled paste → the response's `seniorityPrompt` fires
    scoped to the 2024 season id (confirmed by checking `hasAppeared(2024SeasonId, playerId)` was
    actually queried, not the current season's id).

## Manual Test Plan

1. Enter a date from a prior season into the "record a past game" form and submit a final list
   against it.
2. Observe the game appears under that historical season's own games list, not the currently active
   season's.
3. Observe no Convocatoria section renders for it at all (there is nothing to show).

## Definition of Done

- [x] `POST /games` derives `season_id` from the backfilled `played_on` date, never today's date.
- [x] `POST /seasons/:id/games` is deleted; LSP find-references confirms no other caller of
      `games.create` breaks.
- [x] The three route-integration fixtures above pass, including the gap-year throw and the
      season-scoped pricing/seniority checks.
- [x] The "record a past game" form renders and behaves per the Manual Test Plan.
- [x] **Graduation:** F10 realises UC-001-07-S1..S6 — graduation value is the modified
      `api.test.ts` + the Manual Test Plan above.
- [x] **Documentation:** none — F10 is not named in `DESIGN_PLAN.md` §2.8/§4.
- [x] **Tests:** `npm test --workspace=server` passes.
- [x] **Regression:** deferred to task 12.
- [x] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

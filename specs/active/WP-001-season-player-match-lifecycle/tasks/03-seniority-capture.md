# Task 03 — Seniority capture on first appearance

## Type

**Feature.** Iteration 1. Elements absorbed: **F2**. No hard dependency on tasks 01/02 (independent
of the schedule/paste work), but ordered third so its `PlayerRepository.add()` conflict-clause fix
lands before later elements build on `add()`'s corrected, idempotent behaviour.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `F2 — Seniority capture on first appearance`
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/domain/`, `server/src/repo/`, and `server/src/routes/`.

## Description

Add a pure `SeniorityAdvisor` domain class holding the suggestion rule (brand-new → `0`, returning →
last recorded + 1, gaps invisible by construction). Add `PlayerRepository.hasAppeared`/
`suggestSeniority`. Fix `add()`'s conflict clause to `DO NOTHING` so a second enrollment call is a
genuine no-op (closing the "no re-prompt" bug for every caller, not only the new capture flow). Expose
two thin routes for any future caller (F6/F9) to reuse.

## Guidelines

1. Create `server/src/domain/seniority-advisor.ts`: class `SeniorityAdvisor` with
   `suggest(lastRecorded: number | null): number` — `lastRecorded === null ? 0 : lastRecorded + 1`.
   Pure, no I/O.
2. In `server/src/repo/player-repository.ts`:
   - Add `hasAppeared(seasonId, playerId): boolean` — existence check against `season_players`.
   - Add `suggestSeniority(seasonId, playerId): number` — join the player's `season_players` rows to
     `seasons` (excluding `seasonId`), order by `seasons.starts_on DESC` (F1's calendar-accurate
     boundary), take the first row's `seasons` value or `null`, pass to `SeniorityAdvisor.suggest`.
   - Change `add()`'s conflict clause to `ON CONFLICT (season_id, player_id) DO NOTHING`. Remove the
     `= 1` default on `add()`'s `seasons` parameter — every caller must now pass an explicit,
     already-confirmed value.
3. In `server/src/routes/api.ts`, add:
   - `GET /seasons/:id/players/:playerId/seniority-suggestion` → `{ hasAppeared, suggested }`
     (`suggested` omitted when `hasAppeared` is `true`).
   - `POST /seasons/:id/players/:playerId/seniority` → body `{ seasons: number }`, calls the now-
     idempotent `add()`, returns the resulting `season_players` row.

## Tests

Testability Assessment: F2 = Yes, fully automatable.

- `server/src/domain/seniority-advisor.test.ts` (vitest, unit, **new**): brand-new (`suggest(null)`
  → `0`), returning after a gap (`suggest(3)` → `4`), consecutive appearance.
- `server/src/repo/player-repository.test.ts` (vitest, integration, modify):
  - Returning player, 3 seasons recorded 2 seasons ago with one gap season in between and no row for
    it → `suggestSeniority` finds the row 2 seasons back (still most recent by `starts_on DESC`) →
    `4`. Matches UC-001-02-S5.
  - Brand-new player, no `season_players` row anywhere → `suggestSeniority` → `suggest(null)` → `0`.
    Matches UC-001-02-S2.
  - Same player appears again the same season → `hasAppeared` → `true` before any suggestion is
    computed. Matches UC-001-02-S3.
  - `POST …/seniority` called twice for the same `(season, player)` with different values → the
    second call is a no-op (`DO NOTHING`); the first value stands.
- `server/src/routes/api.test.ts` (vitest, integration, modify): coverage for both new routes.

## Definition of Done

- [x] `SeniorityAdvisor.suggest` exists and is unit-tested for brand-new/gap-carry/consecutive cases.
- [x] `PlayerRepository.hasAppeared`/`suggestSeniority` exist and are integration-tested per the
      fixtures above.
- [x] `add()`'s conflict clause is `DO NOTHING`; its `seasons` parameter has no default.
- [x] The two new routes exist and are integration-tested.
- [x] **Graduation:** F2 realises UC-001-02-S1..S5 — graduation value is
      `seniority-advisor.test.ts` + `player-repository.test.ts`'s four fixtures + `api.test.ts`.
- [x] **Documentation:** none — F2 is not named in `DESIGN_PLAN.md` §2.8/§4.
- [x] **Tests:** `npm test --workspace=server` passes.
- [x] **Regression:** deferred to task 11.
- [x] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

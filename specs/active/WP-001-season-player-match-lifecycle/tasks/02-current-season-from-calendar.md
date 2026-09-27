# Task 02 — Current season derived from the calendar

## Type

**Feature.** Iteration 1. Elements absorbed: **F1**. Depends on task 01 (R1 must have removed
`is_active`/`.activate()`/`.active()` first — same UC-001-01 ancestor, ordered immediately after to
avoid a deployable gap with no season-derivation endpoint at all).

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `docs/test-strategy.md` (Integration tests category — this task creates the project's first
  `server/src/routes/*.test.ts` file)
- `DESIGN_PLAN.md` §3, subsection `F1 — Current season derived from the calendar`
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/domain/`, `server/src/repo/`, `server/src/routes/`, and `server/scripts/`.

## Description

Redefine `seasons.starts_on`/`ends_on` from "actual first/last recorded game date" to "the season's
Sept 1–Aug 31 calendar boundary." Add a new pure domain class `SeasonCalendar` holding that one rule.
Replace `SeasonRepository.active()` with `current(asOf?)`, deriving the season from a date instead of
a stored flag. Update `import-season.ts` to stop passing the now-computed bounds.

## Guidelines

1. Create `server/src/domain/season-calendar.ts`: class `SeasonCalendar` with
   `boundsFor(startYear: number): { startsOn: string; endsOn: string }` returning
   `{ startsOn: '${startYear}-09-01', endsOn: '${startYear + 1}-08-31' }`. Pure, no I/O.
2. In `server/src/db/schema.sql`: change `seasons.starts_on`/`ends_on` from nullable `TEXT` to
   `TEXT NOT NULL`, and add `UNIQUE` on `starts_on` (structurally enforces "no two seasons share a
   start date," which is what makes adjoining ranges never overlap).
3. In `server/src/repo/season-repository.ts`:
   - `create(input)`: derive `startYear` from `input.name.slice(0, 4)` (matching
     `import-season.ts:87`'s existing convention exactly); throw if that slice isn't a 4-digit year;
     call `SeasonCalendar.boundsFor(startYear)` for `starts_on`/`ends_on`. Remove
     `starts_on`/`ends_on` from `NewSeasonInput` — the caller no longer supplies them.
   - `update()`: when `name` changes, recompute both bounds together via the same derivation, never
     independently.
   - Add `current(asOf: string = today): SeasonRow | undefined` —
     `SELECT * FROM seasons WHERE starts_on <= @on AND ends_on >= @on ORDER BY starts_on DESC LIMIT 1`.
4. In `server/scripts/import-season.ts`: stop passing `starts_on`/`ends_on` to `seasons.create()`.
5. In `server/src/routes/api.ts`: add `GET /seasons/current`, calling `SeasonRepository.current()`.
6. Recreate the local database file (`npm run seed -- --reset`) so the new `NOT NULL UNIQUE` columns
   and the redefined boundary meaning take effect, and so a re-run of the import script stores the
   canonical Sept 1/Aug 31 dates.

## Tests

Testability Assessment: F1 = Yes, fully automatable.

- `server/src/domain/season-calendar.test.ts` (vitest, unit): `boundsFor` fixtures — a season
  starting 2024 → `{ startsOn: '2024-09-01', endsOn: '2025-08-31' }`.
- `server/src/repo/season-repository.test.ts` (vitest, integration, modify): replace activation
  tests with `current()` fixtures across adjoining ranges (three adjacent seasons, 2023/2024/2025
  start years — a date inside each resolves to that season) and a **gap** fixture (a date in an
  intentionally-skipped year, no row created, resolves to `undefined`) — the gap risk from
  `DESIGN_PLAN.md` §2.9 is explicitly covered, not left untested.
- `server/src/routes/api.test.ts` (vitest, integration — **new file**, first in
  `server/src/routes/`): `GET /seasons/current` against a real SQLite file.

## Definition of Done

- [ ] `SeasonCalendar.boundsFor` exists and is unit-tested against the 2024→2025 fixture above.
- [ ] `seasons.starts_on`/`ends_on` are `NOT NULL`, `starts_on` is `UNIQUE`.
- [ ] `SeasonRepository.current(asOf?)` exists, replacing `.active()`; `create()`/`update()` derive/
      recompute bounds via `SeasonCalendar`; `NewSeasonInput` no longer accepts `starts_on`/`ends_on`.
- [ ] `import-season.ts` no longer passes `starts_on`/`ends_on` to `seasons.create()`.
- [ ] `GET /seasons/current` exists and replaces `GET /seasons/active` in every caller.
- [ ] Gap fixture (a date in a year with no season row) proven to return `undefined`, not throw or
      guess.
- [ ] **Graduation:** F1 realises UC-001-01-S5 — graduation value is
      `season-calendar.test.ts` + `season-repository.test.ts`'s `current()` fixtures + `api.test.ts`.
- [ ] **Documentation:** none of `DESIGN_PLAN.md` §2.8/§4's rows name F1 directly — no doc change.
- [ ] **Tests:** `npm test --workspace=server` passes.
- [ ] **Regression:** deferred to task 11.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

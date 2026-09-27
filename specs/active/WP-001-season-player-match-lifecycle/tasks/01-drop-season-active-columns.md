# Task 01 — Drop `seasons.is_active` / `season_players.active`

## Type

**Refactor.** Iteration 1. Elements absorbed: **R1**. No task dependency (first task in the
iteration's order).

## Mandatory Reading

- `AGENTS.md` (this work package's HLD, by reference — architecture, "no migration system" convention)
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `R1 — Drop seasons.is_active/season_players.active; stop gating
the roster by season` (the element's own Low Level Design)
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/db/schema.sql`, `server/src/repo/`, and `server/src/routes/api.ts` specifically.

## Description

Remove `seasons.is_active` and `season_players.active` outright: edit their `CREATE TABLE`
statements directly in `schema.sql` (no `ALTER TABLE`, no guard, no migration helper — this
pre-production app discards and recreates its local DB file instead of migrating, per the author's
standing instruction, `VISION.md` §5). Delete every reader/writer of the two columns, and the two
routes that existed only to expose them.

## Guidelines

1. In `server/src/db/schema.sql`: delete `is_active INTEGER NOT NULL DEFAULT 0` from `seasons`'s
   `CREATE TABLE` statement, and `active INTEGER NOT NULL DEFAULT 1` from `season_players`'s.
2. In `server/src/repo/season-repository.ts`: delete `activate(id)` and `active()` entirely; remove
   `is_active` from `SeasonRow`.
3. In `server/src/repo/player-repository.ts`: delete the `patch.active` branch from
   `updateSeasonPlayer`; remove `active` from `PlayerRow`; drop `active = 1` from `add()`'s
   `ON CONFLICT … DO UPDATE` clause (the column no longer exists to set).
4. In `server/src/routes/api.ts`: delete `GET /seasons/active` and `POST /seasons/:id/activate`.
   Add no replacement route — `GET /seasons/current` is task 02's own new endpoint, not a rename.
5. Recreate the local database file (`npm run seed -- --reset`, or delete `data/pachanguero.db` /
   whatever `PACHANGUERO_DB` points at) before running the app or the route-integration tests
   against the edited schema.

## Tests

Per `docs/test-strategy.md`'s unit/domain and route-integration layers — this element is Testable:
Yes, no manual verification needed (design Testability Assessment, R1).

- `server/src/repo/season-repository.test.ts` (vitest, integration against a real SQLite file via
  `TestDatabase.create()`): remove the assertion on `season.is_active`; confirm `activate`/`active()`
  no longer exist (compile-time — TypeScript itself enforces this once the methods are deleted).
- `server/src/repo/player-repository.test.ts` (vitest, integration): remove any assertion on
  `active`/`season_players.active`.
- No new test file — this task removes behaviour, it adds none.

## Definition of Done

- [ ] `seasons.is_active` and `season_players.active` no longer appear in `schema.sql`.
- [ ] `SeasonRepository.activate`/`.active()` are deleted; `SeasonRow` no longer carries `is_active`.
- [ ] `PlayerRepository.updateSeasonPlayer`'s `active` patch branch and `PlayerRow.active` are gone;
      `add()`'s upsert no longer sets `active`.
- [ ] `GET /seasons/active` and `POST /seasons/:id/activate` are deleted from `routes/api.ts`.
- [ ] `season-repository.test.ts` and `player-repository.test.ts` carry no assertion on either
      removed column.
- [ ] **Graduation:** R1 realises UC-001-01-S1/S2/S3 — graduation value is the two repo test files
      above (existing tests, edited), not a new test file.
- [ ] **Documentation:** none — R1 is not one of `DESIGN_PLAN.md` §2.8/§4's documented-impact rows.
- [ ] **Tests:** `npm test --workspace=server` passes.
- [ ] **Regression:** left to task 11 (the iteration's closing regression task) — this task's own
      definition of done does not require a full-suite run beyond the server unit/integration tests
      above, since nothing executable outside `server/src/repo` and `server/src/routes` is touched.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every file this task
      touches, per `AGENTS.md` and `.agents/rules/coding-standard.md`.

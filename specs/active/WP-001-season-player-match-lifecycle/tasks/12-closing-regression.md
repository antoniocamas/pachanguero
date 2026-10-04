# Task 12 — Closing regression

## Type

**Refactor** (verification only — changes no behaviour). Iteration 1. Elements absorbed: none — this
is the iteration's closing regression task, run once every other task (01-11) is done, per the
"closing regression task" rule: this iteration's changes reach a shared surface (`schema.sql`,
`ConvocatoriaService`, `GameDay.tsx`, the full route surface), so it earns one.

## Mandatory Reading

- `AGENTS.md`
- `docs/test-strategy.md`

## Description

Run the full test suite and a full manual pass of the Wednesday cycle end to end (season creation
through candidate paste, convocatoria, final list, and standings) against a freshly recreated
database, confirming nothing any of tasks 01-11 touched regressed anything another task touched.

## Guidelines

1. Recreate the local database file: `npm run seed -- --reset` (or delete `data/pachanguero.db` /
   whatever `PACHANGUERO_DB` points at and reseed), so every schema edit from tasks 01, 02, 04, 07,
   08, 10 is applied fresh with no stale columns.
2. Run `npm run lint` and `npm run format:check` across the whole repo, not just touched files — the
   pre-commit hook only checks staged files, this is a full sweep.
3. Run `npm test --workspace=server` (full domain/route suite).
4. Run `npm run test:e2e` (full Playwright suite, including the two new specs from tasks 08 and 10).
5. Manually walk one full Wednesday cycle in the running app (`npm run dev`): create a season, add a
   schedule row, let a game auto-resolve, paste a candidate list (including one ambiguous name and
   one anonymous guest), resolve it, run the convocatoria, paste a final list (including one
   previously-excluded player now playing), resolve it, and check the resulting standings reflect
   the exclusion retraction and the guest's absence from standings.

## Tests

- `npm test --workspace=server` — full suite, not a single file.
- `npm run test:e2e` — full suite, not a single spec.

## Definition of Done

- [x] `npm run lint` passes across the whole repository.
- [ ] `npm run format:check` passes across the whole repository.
- [x] `npm test --workspace=server` passes in full.
- [x] `npm run test:e2e` passes in full.
- [x] The manual Wednesday-cycle walkthrough (step 5 above) completes with no unexpected error and
      the standings reflect the exclusion retraction correctly.
- [x] **Graduation:** `throwaway` — this task verifies the iteration as a whole; it realises no
      scenario of its own beyond re-confirming every task's own graduation still holds together.
- [x] **Documentation:** none — this task changes no behaviour and makes no document untrue.
- [x] **Tests:** `npm test --workspace=server`, `npm run test:e2e`.
- [x] **Regression:** this task _is_ the regression.
- [ ] **Code checks:** `npm run lint`, `npm run format:check` — full repository, not `--cached`.

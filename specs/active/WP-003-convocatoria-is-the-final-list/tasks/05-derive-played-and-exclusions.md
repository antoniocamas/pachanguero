# Task 05 — Derive played and exclusion points

## Type

**Feature.** Iteration 1. Elements absorbed: **F5**. Depends on tasks 03 and 04.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `F5 — Derive played and exclusion points`
- `docs/domain-model/points.md`, `study/convocatoria-and-exclusions.md`
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Marking a game played derives `played` and the exclusion rows from the convocatoria; reopening or cancelling retracts them, and marking played again restores them.

## Guidelines

1. Follow F5: the S1 table, `PlayedDerivation` (domain), `PlayedOutcomeEffect` (the `PlayedEffect` from task 03), `ParticipationRepository.setPlayedForGame`, `game-flow-test-support.ts`.
2. Write the comparison test of UC-003-05-S3 against WP-001's final-list flow, which still exists; task 09 turns it into a fixed expectation.

## Tests

- `played-derivation.test.ts` (domain unit): one test per row of the S1 table.
- `played-outcome-effect.test.ts` (integration): retract on reopen and cancel, restore on replay.
- Differential test against the legacy flow; `standings-service.test.ts` updated.

## Definition of Done

- [x] Every row of the S1 table and S2…S5 have a test; the differential test passes.
- [x] **Graduation:** UC-003-05-S1…S5, hard requirement → the tests above.
- [x] **Hard requirements:** each hard-requirement scenario named in Graduation has a test whose title says what it asserts, with no work-package identifier in the code (the project has no marking convention, and code outside the work package never names it); this task's Graduation line is the record of which test carries which scenario.
- [x] **Documentation:** `docs/domain-model/points.md` — §1 ("una lista final resuelta") and the §2 retraction paragraph: an exclusion point stands while the game is played and the player is signed up and out of the convocatoria; it is retracted on reopen or cancel and restored on playing again. `docs/domain-model/ciclo-del-partido.md` — who played is derived on marking played, with the exclusion-point table. `AGENTS.md` — the invariant that only the final list records `played` names `PlayedOutcomeEffect` as the writer of `played` and exclusions.
- [x] **Tests:** `npm test`.
- [x] **Regression:** `npm test` passes in full.
- [x] **Code checks:** `npm run lint` and `npm run format:check`; the code follows `.agents/rules/coding-standard.md`.

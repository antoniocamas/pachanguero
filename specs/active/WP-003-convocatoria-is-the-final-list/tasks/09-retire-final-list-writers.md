# Task 09 — Retire the final-list writers

## Type

**Feature.** Iteration 1. Elements absorbed: **F12**. Depends on tasks 05, 07 and 08 (every replacement exists; removing the old writers earlier would leave the old screen calling routes that are gone).

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `F12 — Retire the final-list writers`, and §4 (Documentation Impact)
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Delete `FinalListResolutionService`, `FinalListTargetResolver`, their routes and the web leftovers; drop the `participations.guests` column and the `played`/`paid_cents` writers of the old flow; turn F5's differential test into a fixed expectation.

## Guidelines

1. Follow F12's five steps in order; run find-references before deleting `ScheduleResolver.cutoffFor` and `LocalCalendar.dateTimeOf`.
2. Finish with the search of step 5; it must return nothing for the listed strings.
3. Rewrite any remaining final-list e2e spec to the new flow.

## Tests

- Search for `FinalList`, `final-list`, `finalList`, `unresolvedOnOrBefore`, `frozenOutcomes`, `clearFinalOutcome`, `cutoffFor`: no match in code, tests or scripts.
- `schema.test.ts` asserts `participations` has no `guests` column; F5's fixed expectation passes.
- Full `npm test` and `npm run test:e2e`.

## Definition of Done

- [x] The search returns nothing; both full suites pass.
- [x] **Graduation:** UC-003-05 and UC-003-07 are realised by tasks 05, 07 and 08; here, `throwaway`.
- [x] **Hard requirements:** none introduced here.
- [x] **Documentation:** `AGENTS.md` — Architecture block (`FinalListParser`/`FinalListResolutionService` replaced by `GameLifecycle`, `PlayedDerivation`, `DebtLedger`, `GameLifecycleService`, `ConvocatoriaService`/`ConvocatoriaEditService`, `PaymentService`, `TeamAssignmentService`/`TeamPasteService`, `GameViewService`, `ConvocatoriaHistoryConverter`); the remaining "final list is the sole writer" text removed. `docs/domain-model/ciclo-del-partido.md` — §3 "Lista final" and "Partidos del pasado" removed. `docs/domain-model/README.md` — the index line follows the new scope. `README.md` — the "Lista final" bullet replaced by the lifecycle, hand-edited convocatoria, payments by share and optional teams. WP-001 `REQUIREMENTS.md` and `DESIGN_PLAN.md` — N2, N3, UC-001-05/06/07 and their elements retracted or revised by identifier, each with a one-line pointer to the replacing behaviour. Shipped documents carry no identifier that resolves only inside this work package.
- [x] **Tests:** `npm test` and `npm run test:e2e`.
- [x] **Regression:** `npm test` and `npm run test:e2e` pass in full.
- [x] **Code checks:** `npm run lint` and `npm run format:check`; the code follows both coding standards.

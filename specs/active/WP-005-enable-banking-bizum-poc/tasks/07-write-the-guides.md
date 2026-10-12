# Task 07 — Write the two guides

## Type

**Study** (documents). Iteration 1. Elements absorbed: **F7** (resolved by the outline in `iterations/1/DESIGN_PLAN.md`). Depends on tasks 01, 02, 05, 06; task 03 completes its limits section.

## Mandatory Reading

- `iterations/1/DESIGN_PLAN.md` (the outline)
- `REQUIREMENTS.md` UC-005-08, UC-005-09
- `poc/README.md` (the findings), `study/enable-banking-docs.md`, `study/pachanguero-today.md`, `study/poc-experiments.md`

## Description

Write `output/enable-banking-revolut-integration.md` (generic) and `output/pachanguero-integration.md` (Pachanguero), anonymised, each claim tagged as verified in the PoC, from the docs, or not determined.

## Guidelines

1. Follow the outline; use only anonymised shapes and counts from the findings.
2. Every experiment of `study/poc-experiments.md` appears answered or as "not determined".
3. After task 03, update the limits section with the measured numbers.

## Tests

None (documents); the definition of done checks completeness and privacy.

## Definition of Done

- [ ] Both guides exist in `output/`; each experiment E-02 to E-12 is answered or marked "not determined".
- [ ] `grep` over `output/` finds no name, phone number, IBAN, account or session id from the real data.
- [x] The limits section carries what is known (at least 60 transaction calls without a 429) and marks the real limit as a placeholder; task 03 will replace it with measured numbers.
- [ ] **Graduation:** UC-005-08-S1 and UC-005-09-S1 `document`: the guides are the deliverable.
- [ ] **Hard requirements:** none. **Documentation:** none outside the work package. **Tests / Regression / Code checks:** not applicable.

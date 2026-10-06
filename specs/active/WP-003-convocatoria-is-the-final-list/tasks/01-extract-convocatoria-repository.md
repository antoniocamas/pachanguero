# Task 01 — Extract the convocatoria's SQL into ConvocatoriaRepository

## Type

**Refactor.** Iteration 1. Elements absorbed: **R1**. No dependency.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md` §3 (DIP)
- `DESIGN_PLAN.md` §3, subsection `R1 — Extract the convocatoria's SQL into ConvocatoriaRepository`
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Move every SQL statement out of `ConvocatoriaService` into a new `ConvocatoriaRepository`, injected through the composition root. Behaviour does not change; the existing tests are the proof.

## Guidelines

1. Read the R1 subsection: it lists the repository's methods, `ExclusionRepository.clear` and every construction site.
2. Create `server/src/repo/convocatoria-repository.ts`; change `ConvocatoriaService`'s constructor and `commit`/`saved` to call it; wire it in `server/src/repo/index.ts`.
3. Update the two tests that construct the service. Do not edit any assertion in `convocatoria-service.test.ts`, `candidate-list-requirements.test.ts` or the route tests.

## Tests

- `convocatoria-repository.test.ts` (route/integration level, real SQLite): one test per repository method.
- Existing `convocatoria-service.test.ts`, `candidate-list-requirements.test.ts` and `api.test.ts` pass **unchanged** (integration).

## Definition of Done

- [ ] `grep -n "prepare\|\.run(\|\.get(\|\.all(" server/src/repo/convocatoria-service.ts` returns nothing.
- [ ] `git diff` on the existing tests shows only construction-site changes, no assertion edited.
- [ ] **Graduation:** `throwaway` for UC-003-03-S1 and UC-003-04-S1 as realised here — the existing tests are the verification; both scenarios graduate to hard-requirement tests in task 04.
- [ ] **Hard requirements:** none are introduced here.
- [ ] **Documentation:** none — no document describes `ConvocatoriaService`'s internals.
- [ ] **Tests:** `npm test`.
- [ ] **Regression:** `npm test` passes in full.
- [ ] **Code checks:** `npm run lint` and `npm run format:check`; the code follows `.agents/rules/coding-standard.md`.

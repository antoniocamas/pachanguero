# Task 02 — Split GameDay.tsx into hook, lib and components

## Type

**Refactor.** Iteration 1. Elements absorbed: **R2**. No dependency; it runs before the first task that changes server behaviour (task 03), as the design requires.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/frontend-coding-standard.md` §1
- `DESIGN_PLAN.md` §3, subsection `R2 — Split GameDay.tsx`
- `requirements/examples/game-screen.md`
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Split `web/src/pages/GameDay.tsx` into a data hook, `lib/money.ts`, `lib/dates.ts` and small rendering components. No capability is lost.

## Guidelines

1. Read the R2 subsection: it names the six files to create and what each takes from `GameDay.tsx`.
2. Move code without changing it; `GameDay.tsx` shrinks to composition. Reuse `web/src/lib/today.ts` and `defaultGame.ts` where they already cover a concern.
3. Run the e2e suite before and after.

## Tests

- E2E (`npm run test:e2e`): the nine existing specs pass with no spec edited. This is the refactor's verification.
- No new tests here: `lib/` unit tests need `vitest` in `web`, which task 08 adds with the author's permission.

## Definition of Done

- [ ] The six files of the R2 File Changes exist and `GameDay.tsx` is composition only.
- [ ] The nine e2e specs pass with no spec edited.
- [ ] **Graduation:** UC-003-10-S6 (no capability lost) — `throwaway` here, the e2e suite is the verification; the scenario graduates to a hard-requirement test in task 08.
- [ ] **Hard requirements:** none are introduced here.
- [ ] **Documentation:** `.agents/rules/frontend-coding-standard.md` — the paragraph citing `GameDay.tsx (324 lines)` as the example the standard prevents is updated to name the new components, hooks and `lib/` modules.
- [ ] **Tests:** `npm run test:e2e`.
- [ ] **Regression:** `npm test` and `npm run test:e2e` pass in full.
- [ ] **Code checks:** `npm run lint` and `npm run format:check`; the code follows `.agents/rules/frontend-coding-standard.md`.

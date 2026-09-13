# 01 — Domain classes: `PointsCalculator`, `SeniorityCurve`, `ExclusionHistory`, `ConvocatoriaBuilder`

**Type:** Refactor. **Iteration:** 1. **Elements:** E1, E2, E3, E4. **Depends on:** none.

## Mandatory Reading

- `DESIGN_PLAN.md` §1-3 (Current State Analysis, Approach, Interface Specification) and element
  rows E1-E4 in §6 with their LLD subsections.
- `.agents/rules/coding-standard.md`.
- `AGENTS.md` — discover, via its own documentation-routing rules, any further guideline covering
  `server/src/domain/`.

## Description

Rewrite all four `server/src/domain/*.ts` modules from free functions into classes, with identical
outputs for identical inputs: `PointsCalculator` (`points.ts`), `SeniorityCurve` (`seniority.ts`),
a new `ExclusionHistory` (`exclusion-history.ts`), and `ConvocatoriaBuilder` (`convocatoria.ts`).
Verified together because `ConvocatoriaBuilder` depends on `ExclusionHistory`'s shape, and all four
are exercised by one `npm test` run.

## Sequencing note (found while implementing — task guidelines corrected locally)

`server/src/repo.ts` is not touched until task 05 (it's deleted there), but it directly imports and
calls `computePoints` and `buildConvocatoria` as free functions today (`import { computePoints }
from './domain/points.js'`; `import { buildConvocatoria, type History } from
'./domain/convocatoria.js'`). Removing those exports now would break `repo.ts` — and the whole
running app — three tasks before anything replaces it. So: **add** the classes without removing the
old free-function exports `computePoints` and `buildConvocatoria` (and the `History` type alias,
`Map<number, ExclusionKind[]>`, unchanged) — both now thin wrappers delegating to the new classes.
Task 05 removes these two shims and the `History` alias once `repo.ts` is actually deleted.
`exclusionScores`, `seasonContribution`/`seniorityPoints` as free functions, and the standalone
`waitCounter`/`mercyCount`/`demotionCount` are not imported by `repo.ts` at all (`verified —
source`, this session's grep — only `convocatoria.ts` imports the latter three, internally) — those
can be removed outright in this task, no shim needed.

## Guidelines

1. `points.ts`: add `PointsCalculator.compute(input)` (body = today's `computePoints`);
   `exclusionScores` → private method `scores(kind)` on it (nothing outside this file calls it
   directly). Keep a free-function `computePoints(input)` exported too, now just
   `new PointsCalculator().compute(input)` — a shim for `repo.ts`, removed in task 05. Remove
   `waitCounter`/`mercyCount`/`demotionCount` as free-function exports (moved to
   `exclusion-history.ts`, guideline 3 — no shim needed, nothing external imports them).
2. `seniority.ts`: `seasonContribution`/`seniorityPoints` → `SeniorityCurve.contribution(season)`/
   `.total(seasons)`. No constructor state, no shim needed (nothing external imports these).
3. `exclusion-history.ts` (new): `ExclusionHistory` wraps a player's raw `ExclusionKind[]`;
   `waitCounter(rules)`, `mercyCount()`, `demotionCount()` are today's free functions of the same
   name (currently in `points.ts`), moved here as instance methods reading `this` instead of a
   parameter.
4. `convocatoria.ts`: add `ConvocatoriaBuilder.build(signups, history: Map<number,
ExclusionHistory>, rules)` (body = today's `buildConvocatoria`, replacing
   `waitCounter(historyOf(id), rules)` etc. with `history.get(id)?.waitCounter(rules) ?? 0`, and the
   mercy/demotion equivalents); `selectPromotees`/`selectDemotees` become private methods on it.
   Keep the free-function `buildConvocatoria(signups, history: History, rules)` exported too (same
   `History = Map<number, ExclusionKind[]>` type, unchanged) — a shim for `repo.ts`: wrap each
   array into an `ExclusionHistory` internally, then delegate to
   `new ConvocatoriaBuilder().build(...)`. Removed in task 05.
5. Add `points.test.ts`, `seniority.test.ts`, `exclusion-history.test.ts`, `convocatoria.test.ts`
   testing the new classes directly (not through the shims) — same assertions and fixture values as
   `domain.test.ts`, adapted call syntax. **Do not delete `domain.test.ts`** in this task — it still
   exercises the live shims (`computePoints`, `buildConvocatoria`) that `repo.ts` depends on; task
   05 removes it once the shims themselves are removed.

## Tests

- Unit (Vitest, `docs/test-strategy.md` §Unit):
  - `points.test.ts` reproduces the existing fixture rows (`Antonio C` 30/0/13→37.308813655,
    `Fer` 30/1/2→32.79248125, `Nacho`, `Emma`) to the same precision.
  - `seniority.test.ts` reproduces the Aux-table rows (1→1, 2→1.79248125, 13→7.308813655) and the
    below-one-season/diminishing-returns cases.
  - `exclusion-history.test.ts` reproduces today's `waitCounter`/`mercyCount`/`demotionCount`
    cases, including the legacy non-reset-counter mode going negative.
  - `convocatoria.test.ts` reproduces every existing oversubscribed/non-oversubscribed/mercy-tie-
    break case.

## Definition of Done

- [x] All four classes exist and are what `PointsCalculator`/`SeniorityCurve`/`ExclusionHistory`/
      `ConvocatoriaBuilder` do internally — `exclusionScores`, `seasonContribution`/
      `seniorityPoints`, `waitCounter`/`mercyCount`/`demotionCount`, `selectPromotees`/
      `selectDemotees` are no longer free functions anywhere (verified: grep of
      `^export function|^export const` across the four files finds only the two documented shims).
- [x] `computePoints` and `buildConvocatoria` remain exported from `points.ts`/`convocatoria.ts` as
      thin shims delegating to the new classes, documented as temporary (removed in task 05) with a
      one-line comment saying so (both marked `@deprecated`).
- [x] The four new test files exist; `domain.test.ts` still exists and still passes (it now
      exercises the shims).
- [x] `npm test` passes (48 tests, 5 files, all green).
- [x] Graduation: UC-002-01, UC-002-02, UC-002-03 (all hard requirement) realized — their
      scenarios are the test assertions above, unchanged in value.
- [x] Code checks: `npm run lint` passes (`AGENTS.md`).
- [x] Regression: `npm test` (and `npm run build` also verified clean).

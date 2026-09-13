# 05 — Docs, conformance review, cleanup, closing regression

**Type:** Refactor. **Iteration:** 1. **Elements:** E14, E15 (plus the closing checks the design's
Test Methodology assigns no element to). **Depends on:** task 04.

## Mandatory Reading

- `DESIGN_PLAN.md` §6 rows E14/E15, §11 File Changes → Docs, §13 Test Methodology's Conformance
  review checklist (UC-002-06).
- `README.md` §Estructura; `AGENTS.md` §Architecture, §Coding standard.
- `.agents/rules/coding-standard.md` §Enforcement.

## Description

Correct the two documents that assert the old free-function architecture, delete the now-unused
`server/src/repo.ts`, run the conformance checklist, and run the full regression this iteration's
shared-surface change warrants.

## Guidelines

1. `README.md` §Estructura: replace _"La carpeta `domain/` no sabe nada de SQLite ni de HTTP: son
   funciones puras con sus tests."_ with the same invariant restated for classes.
2. `AGENTS.md` §Architecture: update the `server/src/domain/` and `server/src/repo.ts` lines to
   describe the new class-based modules under `server/src/repo/`.
3. `AGENTS.md` §Coding standard: drop "today" from "It supersedes the free-function style
   `server/src/domain/` and `repo.ts` are written in today" — the rewrite has now happened.
4. Confirm no file still imports `server/src/repo.js` (grep for `from '../repo.js'`/`from
'./repo.js'` across `server/src` and `server/scripts`) — should be empty after task 04. Delete
   `server/src/repo.ts`.
5. Remove the temporary shims task 01 left for `repo.ts`'s sake (now dead code, since `repo.ts` is
   gone): the free-function `computePoints` export from `points.ts`, the free-function
   `buildConvocatoria` export and the `History` type alias from `convocatoria.ts`. Delete
   `server/src/domain/domain.test.ts` (it only ever exercised these shims — `points.test.ts`/
   `seniority.test.ts`/`exclusion-history.test.ts`/`convocatoria.test.ts` already cover the real
   classes).
6. Run the conformance checklist (UC-002-06), scoped to this WP's boundary
   (`REQUIREMENTS.md` §1: `domain/`, `repo/`, `routes/api.ts`, `scripts/import-season.ts` — **not**
   `server/src/db/index.ts`, whose `db()`/`tx()` free functions are explicitly out of scope,
   `VISION.md` §3, and predate this WP): grep those directories/files for a top-level
   `export function` or `export const ... = (...) =>` outside a class body — must return zero; read
   every `static` method introduced across tasks 01-04 (there should be none) and confirm none is
   stateless.
7. Run the full regression.

## Manual Test Plan

1. Open `README.md` §Estructura and confirm it no longer says "funciones puras" for `domain/`.
2. Open `AGENTS.md` §Architecture and confirm `server/src/domain/` and `server/src/repo/` are both
   described accurately against the code as it now stands.
3. Open `AGENTS.md` §Coding standard and confirm the "written in today" line no longer claims the
   old style is current.

## Tests

- `npm test` (full Vitest suite).
- `npm run test:e2e` (full Playwright suite).
- The grep-based conformance checks above (invocation-level, not a persisted test file).

## Definition of Done

- [x] `README.md` and `AGENTS.md` corrected per Guidelines 1-3 (plus one self-caught fix: an
      earlier draft of the `AGENTS.md` edit named this work package by id, which the "nothing this
      design writes outside the work package may name it" rule forbids in a file outside the WP's
      own tree — reworded before finishing).
- [x] `server/src/repo.ts` deleted; nothing imports it (confirmed by grep before deleting).
- [x] The `computePoints`/`buildConvocatoria` shims and the `History` type alias are removed from
      `points.ts`/`convocatoria.ts`; `domain.test.ts` deleted.
- [x] Conformance checklist run: zero top-level free functions, zero stateless statics, in this
      WP's boundary (`domain/`, `repo/`, `routes/api.ts`, `scripts/import-season.ts` —
      `db/index.ts` excluded, out of scope).
- [x] `npm test` passes (76 tests, 11 files — 78 minus the 2 shim smoke tests removed with
      `domain.test.ts`).
- [x] `npm run test:e2e` passes (with `repo.ts` fully deleted).
- [x] `npm run lint` passes.
- [x] Graduation: UC-002-06 (document) and UC-002-07 (document, both scenarios) realized.
- [x] Regression: `npm test` and `npm run test:e2e`, both green (`npm run build` also verified
      clean).

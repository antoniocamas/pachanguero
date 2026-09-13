# 04 — Wire up consumers: composition root, `routes/api.ts`, `import-season.ts`

**Type:** Refactor. **Iteration:** 1. **Elements:** E12, E13. **Depends on:** tasks 02, 03.

## Mandatory Reading

- `DESIGN_PLAN.md` §1-3, §6 rows E12/E13, §8 Unit Communication, `design/diagrams/class-composition.puml`.
- `docs/test-strategy.md` §E2E.
- `.agents/rules/coding-standard.md`.

## Description

Create the composition root and switch every remaining consumer of `repo.ts` over to it in one
task, since both are "make the rest of the codebase use the new classes" and are verified by the
same end-to-end pass.

## Guidelines

1. `server/src/repo/index.ts`: instantiate `SeasonRepository`, `PlayerRepository`,
   `GameRepository`, `ParticipationRepository`, `ExclusionRepository` with `db()`; then
   `StandingsService` and `ConvocatoriaService` composed from those plus `new PointsCalculator()`
   and `new ConvocatoriaBuilder()`.
2. `routes/api.ts`: replace `import * as repo from '../repo.js'` with named imports from
   `../repo/index.js`; change each handler body mechanically (`repo.listSeasons()` →
   `seasons.list()`, etc.) — one line per handler, no control-flow change.
3. `scripts/import-season.ts`: replace `import * as repo from '../src/repo.js'` with named imports
   from `../src/repo/index.js`. **Correction found while implementing:** the script calls more
   than the four `repo.*` functions this guideline first named — the full set is `listSeasons`,
   `createSeason`, `createGame`, `addPlayer`, `setParticipation`, `setExclusion`,
   `activateSeason`, `standings`, `listGames`, each mapped to its composition-root instance the
   same way (`repo.standings(...)` → `standingsService.standings(...)`, etc.). The script also
   declares its own local `const games = new Map<number, number>()` (CSV column → game id) inside
   its `tx()` block, which collides with the composition root's exported `games` (the
   `GameRepository` instance) — import that one aliased, e.g.
   `import { games as gameRepository, ... } from '../src/repo/index.js'`, and call
   `gameRepository.create(...)`/`.list(...)`. The script's own `db()`/`tx()` imports from
   `../src/db/index.js` are unchanged — out of this WP's scope.
4. Do not delete `server/src/repo.ts` in this task — task 05 does, once this task's result is
   confirmed working.

## Tests

- The existing E2E suite (`e2e/tests/season-and-player.spec.ts`) run unmodified against the updated
  routes.
- `npm test` (full existing Vitest suite) unmodified.
- Invocation-level: `npm run seed -- --reset` reproduces the 2024/2025 season — same game count,
  same weekly totals as the script's own internal consistency checks.

## Definition of Done

- [x] `server/src/repo/index.ts` exists and builds the full object graph at module load.
- [x] Every `routes/api.ts` handler and every `import-season.ts` call site uses the new
      composition-root instances; no `repo.*` free-function call remains in either file (verified
      by grep).
- [x] `npm run test:e2e` passes unmodified.
- [x] `npm run seed -- --reset` reproduces the 2024/2025 season (run against a scratch DB: 48
      games, 36 players, standings matching the domain tests' own fixture values exactly).
- [x] `npm test` passes (78 tests, unchanged from task 03 — this task touched no test file).
- [x] Graduation: UC-002-05 (hard requirement, both scenarios) and UC-002-04-S3 realized.
- [x] Code checks: `npm run lint` passes.
- [x] Regression: `npm test` and `npm run test:e2e` (and `npm run build` also verified clean).

# Task 03 — The five-state game: schema and lifecycle

## Type

**Feature.** Iteration 1. Elements absorbed: **F1, F2**. Depends on tasks 01 and 02.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsections `F1 — The schema` and `F2 — The game lifecycle`
- `requirements/diagrams/game-states.puml`
- `docs/domain-model/ciclo-del-partido.md`
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Edit `schema.sql` in place for the five-value game state, `cancelled_from`, the convocatoria confirmation stamp and `source`, the rebuilt `convocatoria_entries`, `share_debts` and `payments` (no upgrade path, by author ruling). Add `GameLifecycle`, `GameLifecycleService` and the routes that move a game through its states. F1 alone realises no complete scenario, so it is delivered with F2, which completes UC-003-01.

## Guidelines

1. Read F1 first: constraints, indexes, and the list of readers and writers of `games.status` to update (`GameRepository`, `StandingsService`, `web/src/api.ts`, `web/src/lib/defaultGame.ts`, `import-season.ts`).
2. Record the standings of the imported history **before** editing the schema.
3. Add `server/src/db/schema.test.ts`. Then F2: `GameLifecycle.next` reads a table of `(state, action) → state` (design §2.11), the `PlayedEffect` seam, routes, wiring in `repo/index.ts`. The old final-list writers stay until task 09.
4. Last step: delete `data/pachanguero.db` with its `-wal` and `-shm`, run `npm run seed`, and compare standings with step 2.

## Tests

- `schema.test.ts` (domain, real in-memory SQLite): each constraint violated and refused (F1 Test Methodology).
- Seed on a temporary database (`PACHANGUERO_DB`): standings equal the pre-edit ones (integration).
- `game-lifecycle.test.ts` (domain unit): one test per row of both tables; S6/S7 outlines over the four states; `nextAction` with and without `owes`.
- `game-lifecycle-service.test.ts` (integration, recording `PlayedEffect` test class); `api.test.ts` (route): every transition and refusal message.

## Definition of Done

- [ ] Standings after the seed equal the recorded pre-edit standings.
- [ ] Find-references shows no reader of the old three-value status left unhandled.
- [ ] Every transition and refusal of UC-003-01-S1…S7 has a test.
- [ ] **Graduation:** UC-003-01 (S1…S7), hard requirement → the lifecycle tests above; the schema constraints → `schema.test.ts`.
- [ ] **Hard requirements:** those tests are titled with the scenario identifier (e.g. `UC-003-01-S3 …`); the project has no other marking convention.
- [ ] **Documentation:** `AGENTS.md` — the _db/_ paragraph (`--reset` removes only the imported season's rows; a changed table definition needs the DB file and its `-wal`/`-shm` deleted); the Domain-invariants line on the game's three statuses becomes the five states. `docs/domain-model/ciclo-del-partido.md` — the states and transitions are written (who may edit what in each). `docs/domain-model/glossary.md` — entries _Convocatoria creada / confirmada_, _Jugado_, _Cancelado_.
- [ ] **Tests:** `npm test` and `npm run test:e2e` (the schema reaches the web).
- [ ] **Regression:** `npm test` and `npm run test:e2e` pass in full.
- [ ] **Code checks:** `npm run lint` and `npm run format:check`; the code follows `.agents/rules/coding-standard.md` and `.agents/rules/frontend-coding-standard.md`.

# Task 11 — Closing regression

## Type

**Refactor** (verification only). Iteration 1. Elements absorbed: none. Depends on tasks 01–10. The iteration's changes reach shared surfaces (`schema.sql`, `routes/api.ts`, `repo/index.ts`, `web/src/api.ts`, the game screen), so it earns one.

## Mandatory Reading

- `AGENTS.md`
- `docs/test-strategy.md`

## Description

Run the full suites and the lint and format sweeps on a freshly recreated database, confirming nothing one task touched regressed another.

## Guidelines

1. Delete the local database with its `-wal` and `-shm`, then `npm run seed`.
2. Run `npm run lint`, `npm run format:check`, `npm test` and `npm run test:e2e`, in full, across the repository.

## Tests

- `npm test` and `npm run test:e2e`, full suites.

## Definition of Done

- [ ] All four commands pass in full.
- [ ] The seeded standings equal the pre-WP-003 ones recorded in task 03.
- [ ] **Graduation:** `throwaway` — realises no scenario of its own.
- [ ] **Hard requirements:** none.
- [ ] **Documentation:** none — this task changes no behaviour.
- [ ] **Tests:** `npm test`, `npm run test:e2e`.
- [ ] **Regression:** this task is the regression.
- [ ] **Code checks:** `npm run lint`, `npm run format:check`, full repository.

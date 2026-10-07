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

## Closing note (2026-10-07)

The four commands were not repeated: after the last code change (the two fixes and the e2e added in task 10) lint, format:check, build, `npm test` (server 480, web 80) and `npm run test:e2e` (31) all passed in full. The seed was run on a fresh scratch database (`PACHANGUERO_DB`), not by deleting `data/pachanguero.db`, which a running server held open. The standings of the pre-work-package code (commit 8d956ae, seeded in a throwaway worktree) and of the current code, both from `GET /api/seasons/1/standings` on a fresh seed, are identical (434 lines each, no diff).

## Definition of Done

- [x] All four commands pass in full (run once, after the last code change; see the note).
- [x] The seeded standings equal the pre-WP-003 ones (compared against the pre-work-package commit; task 03 recorded no numbers).
- [x] **Graduation:** `throwaway` — realises no scenario of its own.
- [x] **Hard requirements:** none.
- [x] **Documentation:** none — this task changes no behaviour.
- [x] **Tests:** `npm test`, `npm run test:e2e`.
- [x] **Regression:** this task is the regression.
- [x] **Code checks:** `npm run lint`, `npm run format:check`, full repository.

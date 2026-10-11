# Task 06 — Full regression

## Type

**Feature.** Iteration 1. Elements absorbed: none (closing regression for the iteration). Depends on:
tasks 01 to 05.

## Mandatory Reading

- `AGENTS.md`
- `docs/test-strategy.md`
- `ANATOMY.md`

## Description

Once every other task is done, run the whole verification once on a clean state to confirm the
iteration did not break the surfaces it shares (the schema, the API mount, both web shells, the
documents). This task changes nothing; if something fails, it is reported and the owning task is
reopened.

## Guidelines

1. Start from a clean checkout state: remove the local database files (`data/*.db*`) and run
   `npm run seed`.
2. Run, in order: `npm run build`, `npm test`, `npm run test:e2e`, `npm run lint`,
   `npm run format:check`.
3. Start the built server (`npm start`) with a real `JWT_SECRET`, run `pachanguero-admin list`, and
   confirm an old database file (the pre-work copy, if kept) is backed up and migrated on start.

## Tests

Testability: fully automatable except step 3 of the guidelines, which is a short manual check.

## Definition of Done

- [ ] Every command in the guidelines passes; outputs are reported.
- [ ] Step 3 done: the automatic backup file exists next to the database or in `PACHANGUERO_BACKUPS`,
      and the data is intact.
- [ ] **Graduation:** none (this task realises no requirement of its own).
- [ ] **Hard requirements:** none of its own; the carriers are recorded in tasks 01 to 05.
- [ ] **Documentation:** none made untrue; this task changes nothing executable.
- [ ] **Tests:** `npm test` and `npm run test:e2e`.
- [ ] **Regression:** this task is the regression.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass.

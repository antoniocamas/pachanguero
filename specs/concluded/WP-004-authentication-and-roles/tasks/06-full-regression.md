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
3. ~~Start the built server on an old database file.~~ Dropped by the author: old databases are not
   supported, so they are not tested.

## Tests

Testability: fully automatable.

## Definition of Done

- [x] Every command in the guidelines passes; outputs are reported.
- [x] **Graduation:** none (this task realises no requirement of its own).
- [x] **Hard requirements:** none of its own; the carriers are recorded in tasks 01 to 05.
- [x] **Documentation:** none made untrue; this task changes nothing executable.
- [x] **Tests:** `npm test` and `npm run test:e2e`.
- [x] **Regression:** this task is the regression.
- [x] **Code checks:** `npm run lint` and `npm run format:check` pass.

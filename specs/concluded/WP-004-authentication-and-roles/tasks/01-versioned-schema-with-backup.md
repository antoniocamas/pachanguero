# Task 01 — Versioned schema with a backup before migration

## Type

**Refactor.** Iteration 1. Elements absorbed: **R1**. Depends on: nothing.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `docs/test-strategy.md`
- `DESIGN_PLAN.md` §3, subsection `R1 — Versioned schema with a backup before migration`, and §2.9 (the
  risks that name the migrator)
- `REQUIREMENTS.md` UC-004-10-S5, S6, S7
- Discover, via the project's own documentation-routing rule, any guideline covering `server/src/db/`,
  `server/src/domain/` and the test support files being touched.

## Description

The database file gets a version stamp and a migrator, so later work can add tables and change them
without deleting the live file. When the server opens an older file it first writes a backup of it,
then migrates. A fresh database and a migrated one end up identical, and the live data is untouched.
This task changes no behaviour a user can see; it only introduces the mechanism (its steps list is
empty for now, the first real step is added by the task that creates the new tables).

## Guidelines

1. Read the R1 subsection in full, including its Data Contract Verification and Patterns and
   Conventions; it fixes the class names, the `user_version` rule, the backup name and modes, and the
   `Clock` extraction. Do not re-decide any of it.
2. Order: `domain/clock.ts` (and the `LocalCalendar` change) → `DatabaseBackup` → `SchemaMigrator` →
   `db()` and `test-support.ts` → the `schema-v0.sql` fixture and the equality test.
3. Keep `server/src/db/schema.sql` as the schema for new files; `db()` calls the migrator instead of the
   bare `exec`.
4. Follow the coding standard: classes, no free functions, no stateless statics.

## Tests

Testability: fully automatable (HLD 2.10, R1 row). Types per the design's R1 Test Methodology:

- `server/src/db/schema-migrator.test.ts` (integration, real SQLite files): the fresh schema and the
  schema reached by migrating the v0 fixture are equal; row counts of live-data tables equal before and
  after, run twice (migration twice changes nothing); the stamp is set; a failing step leaves the file
  at its previous version.
- `server/src/db/database-backup.test.ts` (integration): the copy exists with directory `0700` and file
  `0600`, never overwrites an existing file, uses `.part` then rename, and holds rows written but not
  yet checkpointed from the WAL.
- `server/src/domain/local-calendar.test.ts` (unit): the new method.
- All existing suites stay green unchanged (`npm test`).

## Definition of Done

- [x] `SchemaMigrator`, `DatabaseBackup`, `Clock` and the `LocalCalendar` change exist as the R1
      subsection specifies, and `db()` runs the migrator (`npm test --workspace=server`).
- [x] The three UC-004-10-S5/S6/S7 behaviours each have a test (list above).
- [x] **Graduation:** UC-004-10-S5, S6 and S7 are hard requirements → `schema-migrator.test.ts` and
      `database-backup.test.ts`.
- [x] **Hard requirements:** each scenario named in Graduation has a test whose title says what it
      asserts, with no work-package identifier in the code (the project has no marking convention);
      this line is the record of which test carries which scenario.
- [x] **Documentation:** `AGENTS.md`, the `server/src/db/` paragraph ("no migration system — edit
      `schema.sql` directly …"): replace with the version-stamp rule, the backup before a migration and
      its location, and keep the "delete and reseed" note only for throwaway local databases.
- [x] **Tests:** `npm test`.
- [x] **Regression:** `npm test` (the full server and web suites); the closing regression task 06 runs
      the E2E.
- [x] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

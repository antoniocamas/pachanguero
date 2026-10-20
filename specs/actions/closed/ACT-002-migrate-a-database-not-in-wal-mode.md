# ACT-002: Migrate a database that is not in WAL mode

**Status:** done
**Raised:** 2026-10-20
**Origin:** WP-006-bizum-payment-detection, task 11 (the rehearsal on a copy of production: `reset` could not migrate the fetched backup)
**Target:** `server/src/db/schema-migrator.ts` (and its test, `schema-migrator.test.ts`)

## Action

Make `SchemaMigrator` migrate a file whose journal mode is not WAL. Add a regression test that
builds a version 2 file in rollback-journal mode and migrates it with the real steps, failing
before the fix; then fix it.

## Root cause

`schema.sql` begins with `PRAGMA journal_mode = WAL`, and when a file has pending migrations
`SchemaMigrator.migrate()` runs the whole of `schema.sql` inside a transaction. SQLite refuses to
change the journal mode inside a transaction ("cannot change into wal mode from within a
transaction"), so any file that is not already WAL fails. A backup is such a file: `VACUUM INTO`
writes a rollback-journal copy. A live database is WAL, which is why a production upgrade is
unaffected, and why every migration test (which builds its file with `schema.sql`-style fixtures
that set WAL) passed. A file with no pending migration, and a new file, run `schema.sql` outside a
transaction and are fine.

## What it cost

The rehearsal stopped at its first step. Without the fix, restoring a backup and starting a
version with a pending migration fails to start.

## Resolution

Fixed in `SchemaMigrator.run()`: a file with pending migrations is switched to WAL after its backup and before the migration transaction. The regression test (`migrates a version 2 file that is not in WAL mode, as a backup is`) failed with the original error before the fix and passes after it; the real production backup then opens at version 5 in WAL mode.

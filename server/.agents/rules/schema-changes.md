CODENAME: DC-SCHEMA-CHANGES-329

# Schema changes

- A changed table is a new `MigrationStep` (raise `LATEST_SCHEMA_VERSION` in `src/db/schema-migrator.ts`) plus the same change in `src/db/schema.sql`, which a new file starts from.

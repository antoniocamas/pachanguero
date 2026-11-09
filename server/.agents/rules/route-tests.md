CODENAME: DC-ROUTE-TESTS-335

# Route tests

- Test a route against a real SQLite database created from `schema.sql`; never mock the database.
- Test anything behind the login through `src/routes/auth-test-support.ts` (`AuthTestApp`): real tokens from `login` or `tokenFor(role)`, a clock moved by hand (`ManualClock`). Start it before anything imports the composition root, which reads the database path on import.
- Keep `src/routes/api-routes.test.ts` complete: it lists every route of every router and fails on a path nobody declared as public, session, own-data or organiser.

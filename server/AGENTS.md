# server

The API, the game rules and the SQLite store. ESM: TypeScript imports use `.js` extensions. The game rules are specified in [`docs/domain-model/`](../docs/domain-model/) (Spanish).

## Layers

Data flows `src/routes/` → `src/repo/` → `src/domain/`; respect it.

- `src/domain/` — classes holding THE rules, with their tests. Knows nothing of SQLite or HTTP.
- `src/db/` — the `better-sqlite3` singleton and `SchemaMigrator`.
- `src/repo/` — repository and service classes, one use case each; `src/repo/index.ts` is the composition root.
- `src/routes/` — Express routers; `src/routes/api.ts` is the organiser's.
- `src/bizum/` — the bank-neutral Bizum core. `src/bank/` — everything that names a bank.
- `src/cli/` — `pachanguero-admin`.

## Rules

- `../.agents/rules/coding-standard.md` — before any design or coding work on `src/`
- `.agents/rules/points-and-legacy-behaviour.md` — changing points, seniority or anything the legacy script did
- `.agents/rules/game-lifecycle-constraints.md` — changing game states or what a state change writes
- `.agents/rules/convocatoria-constraints.md` — changing how a convocatoria is stored or corrected
- `.agents/rules/convocatoria-sort-order.md` — changing the convocatoria sort
- `.agents/rules/history-convocatoria.md` — changing the import of seeded played games
- `.agents/rules/guest-roles.md` — changing fijo or invitado, hosts or the guest order
- `.agents/rules/season-and-schedule-constraints.md` — changing seasons, their rules or the weekly schedule
- `.agents/rules/pasted-names.md` — changing how pasted sign-up names are matched
- `.agents/rules/attendance-payment-columns.md` — changing `signed_up`, `played`, `paid_cents` or `paid_on`
- `.agents/rules/payment-constraints.md` — changing debts, payments or money
- `.agents/rules/bizum-constraints.md` — changing `bizum/`, `bank/` or how a Bizum settles
- `.agents/rules/bizum-feed-constraints.md` — changing how bank entries are read and kept
- `.agents/rules/own-data-access.md` — adding or changing a route, or what a player is told
- `.agents/rules/route-tests.md` — writing or changing a route test
- `.agents/rules/view-as-log.md` — changing the admin's view as another player
- `.agents/rules/schema-changes.md` — changing a table
- `.agents/rules/bizum-bank-boundary.md` — adding an import to `src/bizum/` or a bank name anywhere
- `.agents/rules/jwt-library-confinement.md` — touching the JWT library or session tokens

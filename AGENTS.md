# Pachanguero

## Identity

Pachanguero replaces the `Futbol_Miercoles` spreadsheet + Apps Script for a Wednesday 7-a-side football group: sign-ups, payments, and selecting the 14 who play when more than 14 sign up. The README and all docs are in Spanish; user-facing strings in the app are Spanish too. Write UI copy in Spanish.

## Commands

```bash
npm install          # workspaces: server + web
npm run dev          # API on :8787 (tsx watch), web on :5173 (vite, proxies /api)
npm run seed         # import the 2024/2025 season from data/seed/*.csv (-- --reset to wipe first)
npm test             # domain tests (vitest, server workspace only)
npm run build        # tsc for both workspaces; also copies schema.sql into server/dist/db
npm start            # production: one port, Express serves the SPA + API
```

Run a single test file or case from `server/`:

```bash
npx vitest run src/domain/domain.test.ts
npx vitest run -t "reproduces the legacy remainder bug"
```

There is no linter. There are no web tests; all tests live in `server/src/domain/`.

## Architecture

npm workspaces, both ESM (TS imports use `.js` extensions). Data flow is strictly layered — respect it:

```
server/src/domain/    pure functions: points, seniority, convocatoria (+ all tests).
                      Knows nothing of SQLite or HTTP. THE rules live here.
server/src/db/        better-sqlite3 singleton; schema.sql runs idempotently on open
                      (no migration system — additive edits to schema.sql are the mechanism)
server/src/repo.ts    SQL queries and use cases; converts snake_case rows to domain types
server/src/routes/    Express router; route() wrapper turns throws into 400s
server/src/index.ts   mounts /api, then serves web/dist if it exists (single port for the Pi)
web/src/              React 18 + Vite, no router/state lib: App.tsx holds three tabs
                      (GameDay, Standings, Manage) and refreshes by refetching everything
```

## Domain invariants

- **Points = paid games + scoring exclusions + seniority.** Attendance counts *payments*, not appearances. Seniority is a log curve (`seniority.ts`), not a table. Only exclusions of kind `points` or `demoted` score; a `mercy` seat does not.
- **Default behaviour reproduces the legacy Apps Script, including its bugs.** Notably, with `mercy_resets_counter = 0` a mercy seat *subtracts* from the wait counter and it can go negative — this is deliberate; tests assert it. The flag switches to the organiser's stated rule (reset to zero). Any change away from legacy behaviour must be opt-in per season, never a default. Background: `docs/domain-model/legacy-script-review.md`.
- **The legacy `*` meant three things; they are separate columns now**: `signed_up`, `played`, `paid_cents` with `paid_on` (when the money *arrived*, not the game date). Never collapse them.
- **Convocatorias are frozen**: running one stores `rules_json` plus every entry with the points it saw, so past selections stay auditable after late payments change current standings.
- **Rules are per-season** (columns on `seasons`, editable from Ajustes), so history is never rewritten when rules change.
- **Money is integer cents** (`price_cents`, `paid_cents`).
- Ties in the convocatoria sort break by name (`es` locale) so results are deterministic.

`docs/domain-model/` (in Spanish) is the authority on the rules — read it before changing anything in `server/src/domain/`. The import script (`server/scripts/import-season.ts`) stamps imported payments with the game date and a note, because real settlement dates were destroyed by the sheet; don't mistake them for real dates.

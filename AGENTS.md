# Pachanguero

## Identity

Pachanguero replaces the `Futbol_Miercoles` spreadsheet + Apps Script for a Wednesday 7-a-side football group: sign-ups, payments, and selecting the 14 who play when more than 14 sign up. The README and all docs are in Spanish; user-facing strings in the app are Spanish too. Write UI copy in Spanish.

## Commands

```bash
npm install          # workspaces: server + web
npm run dev          # API on :8787 (tsx watch), web on :5173 (vite, proxies /api)
npm run seed         # import the 2024/2025 season from data/seed/*.csv (-- --reset to wipe first)
npm test             # domain/route tests (vitest, server workspace)
npm run test:e2e     # full-stack browser tests (playwright, e2e workspace)
npm run build        # tsc for both workspaces; also copies schema.sql into server/dist/db
npm start            # production: one port, Express serves the SPA + API
```

Run a single test file or case from `server/`:

```bash
npx vitest run src/domain/convocatoria.test.ts
npx vitest run -t "reproduces the legacy remainder bug"
```

See `docs/test-strategy.md` for what belongs at each layer (unit/domain, route integration, E2E)
and when to reach for each. E2E specs live in `e2e/tests/` and run via `npm run test:e2e`; they
boot the real server and web dev server against an isolated SQLite file (`PACHANGUERO_DB`), not
mocks.

## Linting & formatting

ESLint (flat config, `eslint.config.js` at the repo root) covers both workspaces; Prettier handles formatting.

```bash
npm run lint          # eslint . (cached)
npm run lint:fix       # eslint . --fix
npm run format         # prettier --write .
npm run format:check   # prettier --check .
```

A git pre-commit hook (Husky, `.husky/pre-commit`) gates every commit:

1. `lint-staged` runs ESLint (`--fix`) and Prettier (`--write`) on staged files only.
2. `npm test --workspace=server` runs the full domain test suite; a failure blocks the commit.

The hook is installed automatically by `npm install` (via the `prepare` script). The existing codebase predates Prettier, so most untouched files aren't reformatted yet — `format:check` will flag them; only files you actually touch get reformatted by the hook.

**No rule may be downgraded, disabled, or skipped without asking first.** If a lint rule flags something and the real fix seems out of scope, expensive, or wrong for the codebase, stop and ask the user — never lower a rule's severity, add an `eslint-disable`, or otherwise route around it unilaterally. Only the user decides to relax a rule.

## Coding standard

**Read [`.agents/rules/coding-standard.md`](.agents/rules/coding-standard.md) before any design or coding work on `server/src`.** It mandates an object-oriented, SOLID-based style — no free functions, no stateless `static` methods. `server/src/domain/` and `server/src/repo/` already follow it.

**Read [`.agents/rules/frontend-coding-standard.md`](.agents/rules/frontend-coding-standard.md) before any design or coding work on `web/src`.** React's hooks model requires function components, so this is SOLID translated into function/hook/composition terms rather than classes — not an exemption from discipline.

## Architecture

npm workspaces, both ESM (TS imports use `.js` extensions). Data flow is strictly layered — respect it:

```
server/src/domain/    classes: PointsCalculator, SeniorityCurve, ConvocatoriaBuilder,
                      ExclusionHistory (+ all tests). Knows nothing of SQLite or HTTP.
                      THE rules live here.
server/src/db/        better-sqlite3 singleton; schema.sql runs idempotently on open
                      (no migration system — additive edits to schema.sql are the mechanism)
server/src/repo/      repository/service classes; converts snake_case rows to domain
                      types; server/src/repo/index.ts is the composition root
server/src/routes/    Express router; route() wrapper turns throws into 400s
server/src/index.ts   mounts /api, then serves web/dist if it exists (single port for the Pi)
web/src/              React 18 + Vite, no router/state lib: App.tsx holds three tabs
                      (GameDay, Standings, Manage) and refreshes by refetching everything
```

## Domain invariants

- **Points = paid games + scoring exclusions + seniority.** Attendance counts _payments_, not appearances. Seniority is a log curve (`seniority.ts`), not a table. Only exclusions of kind `points` or `demoted` score; a `mercy` seat does not.
- **Default behaviour reproduces the legacy Apps Script, including its bugs.** Notably, with `mercy_resets_counter = 0` a mercy seat _subtracts_ from the wait counter and it can go negative — this is deliberate; tests assert it. The flag switches to the organiser's stated rule (reset to zero). Any change away from legacy behaviour must be opt-in per season, never a default. Background: `docs/domain-model/legacy-script-review.md`.
- **The legacy `*` meant three things; they are separate columns now**: `signed_up`, `played`, `paid_cents` with `paid_on` (when the money _arrived_, not the game date). Never collapse them.
- **Convocatorias are frozen**: running one stores `rules_json` plus every entry with the points it saw, so past selections stay auditable after late payments change current standings.
- **Rules are per-season** (columns on `seasons`, editable from Ajustes), so history is never rewritten when rules change.
- **Money is integer cents** (`price_cents`, `paid_cents`).
- Ties in the convocatoria sort break by name (`es` locale) so results are deterministic.

`docs/domain-model/` (in Spanish) is the authority on the rules — read it before changing anything in `server/src/domain/`. The import script (`server/scripts/import-season.ts`) stamps imported payments with the game date and a note, because real settlement dates were destroyed by the sheet; don't mistake them for real dates.

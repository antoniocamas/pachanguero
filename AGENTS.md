# Pachanguero

## Identity

Pachanguero replaces the `Futbol_Miercoles` spreadsheet + Apps Script for a Wednesday 7-a-side football group: sign-ups, payments, and selecting the 14 who play when more than 14 sign up. The README and all docs are in Spanish; user-facing strings in the app are Spanish too. Write UI copy in Spanish.

## Commands

```bash
npm install          # workspaces: server + web
npm run dev          # API on :8787 (tsx watch), web on :5173 (vite, proxies /api)
npm run seed         # import the 2024/2025 season from data/seed/*.csv (-- --reset to wipe first)
npm test             # domain/route tests (vitest, server workspace) and the web lib/ tests (vitest, web workspace)
npm run test:e2e     # full-stack browser tests (playwright, e2e workspace); specs share one database, see docs/test-strategy.md
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

The hook is installed automatically by `npm install` (via the `prepare` script). The whole repository is Prettier-formatted, so `npm run format:check` should pass everywhere.

**No rule may be downgraded, disabled, or skipped without asking first.** If a lint rule flags something and the real fix seems out of scope, expensive, or wrong for the codebase, stop and ask the user — never lower a rule's severity, add an `eslint-disable`, or otherwise route around it unilaterally. Only the user decides to relax a rule.

## Coding standard

**Read [`.agents/rules/coding-standard.md`](.agents/rules/coding-standard.md) before any design or coding work on `server/src`.** It mandates an object-oriented, SOLID-based style — no free functions, no stateless `static` methods. `server/src/domain/` and `server/src/repo/` already follow it.

**Read [`.agents/rules/frontend-coding-standard.md`](.agents/rules/frontend-coding-standard.md) before any design or coding work on `web/src`.** React's hooks model requires function components, so this is SOLID translated into function/hook/composition terms rather than classes — not an exemption from discipline.

## Architecture

npm workspaces, both ESM (TS imports use `.js` extensions). Data flow is strictly layered — respect it:

```
server/src/domain/    classes: PointsCalculator, SeniorityCurve, ConvocatoriaBuilder,
                      ExclusionHistory, SeasonCalendar, ScheduleResolver, NameMatcher,
                      CandidateLineParser, TeamListParser, GameLifecycle, PlayedDerivation,
                      DebtLedger, GuestSlotAllocator, ...
                      (+ all tests). Knows nothing of SQLite or HTTP. THE rules live here.
server/src/db/        better-sqlite3 singleton; schema.sql runs idempotently on open
                      (no migration system — edit schema.sql directly; a changed table
                      definition needs the local DB file and its -wal/-shm deleted, then
                      `npm run seed`; `--reset` only removes the imported season's rows)
server/src/repo/      repository/service classes; converts snake_case rows to domain
                      types; server/src/repo/index.ts is the composition root.
                      Services orchestrate one use case each: CandidateResolutionService,
                      ConvocatoriaService/ConvocatoriaEditService, GameLifecycleService,
                      PaymentService, TeamAssignmentService/TeamPasteService,
                      GameViewService, ConvocatoriaHistoryConverter, ...
server/src/routes/    Express router; route() wrapper turns throws into 400s
server/src/index.ts   mounts /api, then serves web/dist if it exists (single port for the Pi)
web/src/              React 19 + Vite, no router/state lib: App.tsx holds three tabs
                      (GameDay, Standings, Manage) and refreshes by refetching everything.
                      GameDay is the lifecycle screen: GameBar keeps the state, counters and
                      next step in view, and one PlayersTable follows the game's state
                      (OpenView, LineView, PlayedView, ReadOnlyView). pages/ are the tabs,
                      components/ the pieces, hooks/ the data access and actions behind them,
                      lib/ the pure calculations (rows, columns, money, payment cell) with
                      their vitest tests. The drag library is imported only in MemberDnd.tsx.
```

## Domain invariants

- **Points = paid games + scoring exclusions + seniority.** Attendance counts _payments_, not appearances. Seniority is a log curve (`seniority.ts`), not a table. Only exclusions of kind `points` or `demoted` score; a `mercy` seat does not.
- **Default behaviour reproduces the legacy Apps Script, including its bugs.** Notably, with `mercy_resets_counter = 0` a mercy seat _subtracts_ from the wait counter and it can go negative — this is deliberate; tests assert it. The flag switches to the organiser's stated rule (reset to zero). Any change away from legacy behaviour must be opt-in per season, never a default. Background: `docs/domain-model/legacy-script-review.md`.
- **The legacy `*` meant three things; they are separate columns now**: `signed_up`, `played`, `paid_cents` with `paid_on` (when the money _arrived_, not the game date). Never collapse them. Payment is a debt row (`share_debts`, one per share, with a holder who answers for it and a beneficiary whose share it is) until settled and a `payments` row (who paid, how much, when) after; a share is in one table or the other, never both. `paid_cents` is the player's own share, settled by whoever paid it. `BillingEffect` creates the debts when a game is played and `PaymentService` is the writer that settles and undoes them.
- **The season is derived, never picked.** A season runs 1 Sept–31 Aug and `seasons.starts_on`/`ends_on` follow from its name (`SeasonCalendar`); "current" is the season containing today, a game's season is the one containing its date (`SeasonRepository.current(asOf)`). There is no active-season flag. Players have no per-season sign-up step: a `season_players` row appears on first appearance, with seniority confirmed then.
- **A game has five states, and only `GameLifecycle` says which moves are legal.** `open`, `convocatoria_created`, `convocatoria_confirmed`, `played`, `cancelled` (UI: Abierto, Convocatoria creada, Convocatoria confirmada, Jugado, Cancelado). Cancelling remembers the state it left in `cancelled_from` and undoing returns there. A state changes only through `GameLifecycleService.perform` (or `GameRepository.setState` inside it); what each state lets you edit is a capability (`edit_apuntados`, `edit_convocatoria`, `pay`, `teams`) the services check. `docs/domain-model/ciclo-del-partido.md` has the table.
- **A game goes candidates → convocatoria → played, and the convocatoria is what says who played.** `CandidateResolutionService` writes `signed_up` and `guest_candidates`, on save only; `ConvocatoriaService` stores the selection (and writes **no** exclusion rows, nor `played`/payment); `PlayedOutcomeEffect` (run by `GameLifecycleService` when a game enters or leaves `played`) is the sole writer of `played` and of exclusion rows, derived from the convocatoria by `PlayedDerivation`, so a point is retracted on reopen or cancel and restored on playing again; `BillingEffect` and `PaymentService` own the debts and payments, and `TeamPasteService` records only `team`. Overview in `docs/domain-model/ciclo-del-partido.md`.
- **Pasted names are never guessed**: an unmatched or ambiguous one is kept only as line text in `candidate_lines` and stores no player or sign-up.
- **Weekly schedule rows are versioned (create-only)**, so earlier weeks keep resolving as they did.
- **A convocatoria is stored when created and stamped when confirmed**: it keeps `rules_json` plus every entry with the points it saw and the outcome the selection chose, so past selections stay auditable after late payments change current standings. Confirming only stamps `confirmed_at`; recreating recomputes and asks before discarding hand corrections. Hand corrections (`ConvocatoriaEditService`) change only an entry's `playing`, never its `outcome`, points or position; anonymous plus-ones are entries too, named by host and ordinal. Seeded played games get a confirmed convocatoria with `source = 'history'` (`ConvocatoriaHistoryConverter`).
- **Rules are per-season** (columns on `seasons`, editable from Ajustes), so history is never rewritten when rules change.
- **Money is integer cents** (`price_cents`, `paid_cents`).
- Ties in the convocatoria sort break by name (`es` locale) so results are deterministic.

`docs/domain-model/` (in Spanish) is the authority on the rules — read it before changing anything in `server/src/domain/`. The import script (`server/scripts/import-season.ts`) stamps imported payments with the game date and a note, because real settlement dates were destroyed by the sheet; don't mistake them for real dates.

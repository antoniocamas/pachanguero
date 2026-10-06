# Task 06 — Shares as debts, payment by anyone, undo, debt in standings

## Type

**Feature.** Iteration 1. Elements absorbed: **F6**. Depends on tasks 03 and 05.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `F6 — Debts per share, payment by anyone, undo, debt in standings`
- `study/writers-and-readers.md`
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Billing creates one `share_debts` row per share when the game is played; the holder or the beneficiary pays through `PaymentService`, recorded in `payments`; payments can be undone; standings count each share once and read debt from `share_debts` only. `import-season.ts` writes the new meaning of `paid_cents`.

## Guidelines

1. Follow F6: `DebtLedger`, `DebtRepository`, `PaymentRepository`, `BillingEffect`, `PaymentService`, `StandingsService`, and the billing-idempotence worked example.
2. Money is integer cents everywhere; payments use the local date (`LocalCalendar`).
3. The seed writes the player's own share in `paid_cents` and leaves imported plus-one payments unrecorded (author ruling).

## Tests

- `debt-ledger.test.ts` (domain unit, integer cents).
- `payment-service.test.ts`, `standings-service.test.ts` (integration): S1…S6, S3b–S3e; each share counted once in the outstanding total; pay → undo → reopen → replay bills nothing twice.
- **Query-cost test (author requirement)** (integration): seed N games with all shares paid; the debt read touches only `share_debts` and `EXPLAIN QUERY PLAN` uses the two indexes, not a scan.
- `api.test.ts` (route): pay and undo.

## Definition of Done

- [ ] The query-plan test exists and passes.
- [ ] Standings of the seeded history still equal the pre-WP-003 standings recorded in task 03.
- [ ] **Graduation:** UC-003-06-S1…S6 and S3b–S3e, hard requirement → the tests above (the screen part is task 08).
- [ ] **Hard requirements:** each titled with the scenario identifier; no other marking convention exists.
- [ ] **Documentation:** `AGENTS.md` — the "legacy `*` meant three things" invariant gains: payment is a debt row (`share_debts`) until settled and a `payments` row after; `paid_cents` is the player's own share settled by whoever paid it. `docs/domain-model/points.md` — a game counts for a player when their own share is settled, by whoever paid it. `docs/domain-model/glossary.md` — _deuda_ (a share owed, with holder and beneficiary). `docs/domain-model/ciclo-del-partido.md` — payment after playing.
- [ ] **Tests:** `npm test`.
- [ ] **Regression:** `npm test` passes in full.
- [ ] **Code checks:** `npm run lint` and `npm run format:check`; the code follows `.agents/rules/coding-standard.md`.

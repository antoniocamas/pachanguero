# Task 02 — Every payment records its method

## Type

**Feature.** Iteration 1. Elements absorbed: **F1**. Depends on: task 01.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD, and section 3 `#### F1`.
- `REQUIREMENTS.md`: UC-006-08 and UC-006-07-S1, S5; `requirements/examples/screens.html` frames 5 and 10.
- `docs/domain-model/ciclo-del-partido.md`.
- `AGENTS.md`; `.agents/rules/coding-standard.md`; `.agents/rules/frontend-coding-standard.md`.
- `docs/test-strategy.md`; `docs/deployment.md#deployment-impact-of-a-change`.
- Discover, through `AGENTS.md`, the guidelines for each file touched.

## Description

Add `payments.method` (`efectivo`, `bizum`, `otro`) to `schema.sql` and as migration step 3, `PaymentMethodMigration`. The 67 existing payments read `otro`. `POST /games/:id/payments` requires a method. The payment cell gets a "Método" selector with Efectivo preselected, and shows the method on paid chips. The season import writes `otro`.

## Guidelines

1. Before any change, freeze today's `schema.sql` as `server/src/db/fixtures/schema-v2.sql`.
2. Write `domain/payment-method.ts` (`PaymentMethods.parse`), then the migration step (it checks `table_info` first, like `ViewAsMigration`). Add the column last in `payments` in `schema.sql`, with the identical definition, and **no index on it**. Set `LATEST_SCHEMA_VERSION = 3` and add the step to the list in `db/index.ts`.
3. Thread `method` through `PaymentRepository.append`, `Settlement`, `PayRequest` and the route (parsed there).
4. Add `method: 'efectivo'` to the 28 `pay` calls and to the four payment `POST`s of `api.test.ts`.
5. Make `import-season.ts` pass `'otro'`.
6. On the web: `lib/paymentMethod.ts`, `PaymentMethodField`, the cell's state, and `onPay` carrying the method through `usePayments`, `useDebtPayments`, `PlayedView` and `Debts`. Add the method to the paid label in `lib/paymentCell.ts`.

## Tests

Per F1's Test Methodology:

- **Unit** `payment-method.test.ts`: the three values parse; `'cash'`, `'Efectivo'`, `''`, `undefined` and `3` are refused.
- **Integration** `payment-method-migration.test.ts`: the column is added with rows reading `otro`; applying the step twice is a no-op; `'cash'` is refused.
- **Integration** `schema-migrator.test.ts`: a v2 file with three payments, migrated, has a backup, version 3, the rows unchanged with `otro`, and `table_info(payments)` equal to a new file's.
- **Integration** `payment-service.test.ts`: the method is recorded.
- **Route** `api.test.ts`: `otro` is stored; a missing method gives 400 and no row; the three refusals of UC-006-08-S2 keep today's messages.
- **Unit (web)** `paymentCell.test.ts`: the label carries the method, with and without "por".
- **E2E (existing)** `the-game-screen.spec.ts` still passes, with Efectivo preselected.
- **Hard requirements:** `server/src/repo/payment-method-requirements.test.ts`, with `describe('UC-006-08-S1 — …')`, `UC-006-08-S2`, `UC-006-08-S3`, `UC-006-08-S5`, `UC-006-07-S1` (manual rows), `UC-006-07-S5` (no route to change a method).

## Definition of Done

- [ ] Every test above passes.
- [ ] `fixtures/schema-v2.sql` equals the `schema.sql` of commit `49090ea`.
- [ ] **Graduation:** UC-006-08-S1, S3, S5 and UC-006-07-S1, S5 → marked tests in `payment-method-requirements.test.ts`.
- [ ] **Hard requirements:** the marked tests exist and pass.
- [ ] **Documentation:**
  - `docs/domain-model/glossary.md`: *método de pago*.
  - `docs/domain-model/ciclo-del-partido.md` § "Pago después de jugar": a payment records its method.
  - `AGENTS.md` Domain invariants: every payment has a method.
- [ ] **Tests:** `npm test`; `npm run test:e2e`.
- [ ] **Regression:** `npm test`.
- [ ] **Code checks:** `npm run lint`, `npm run format:check`; both coding standards.

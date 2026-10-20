# Task 08 — Undo a Bizum's payments as a whole; trace every payment

## Type

**Feature.** Iteration 1. Elements absorbed: **F10**, **F11**. Depends on: task 07.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD, and section 3 `#### F10` and `#### F11`.
- `REQUIREMENTS.md`: UC-006-06, UC-006-07 (S2–S4); `requirements/examples/payment-views.md`; `screens.html` frames 10–13.
- `docs/users-and-roles.md` ("What a player sees of the others").
- `AGENTS.md`; `.agents/rules/coding-standard.md`; `.agents/rules/frontend-coding-standard.md`; `docs/test-strategy.md`.
- Discover, through `AGENTS.md`, the guidelines for each file touched.

## Description

- Undoing a payment that came from a Bizum undoes every payment of that Bizum in one transaction, or refuses the whole undo. The Bizum returns to the list with the reason `undone`. Manual payments undo exactly as today.
- The organiser can open any payment's detail: the method, how it was resolved, and the Bizum with its rest. The detail also lists the Bizum's payments, which the undo confirmation uses.
- A player sees the method of each of their payments and nothing of the Bizum.

## Guidelines

1. **F10.** Write `BizumUndoService`, and make the `DELETE` payment route call it. Add `PaymentRepository.byBizum`, and the `undone` reason (already in F3's type from task 03).
2. **F11, server.**
   - `paidFor` selects `method`; `PaymentInput` and `OwnPaymentRow` carry it; `OwnDisclosure.payments` copies it and nothing else new.
   - Write `PaymentDetailService` and `GET /payments/:paymentId/bizum`.
3. **F11, web.**
   - `OwnPaymentRow.method`, and the method tag in `paymentLines` and `OwnPayments`.
   - `PaymentDetail.tsx` and `usePaymentDetail`, opened from a payment chip whose method is Bizum.
   - The undo confirmation dialog itself is task 09's (`UndoBizumDialog`). Until then, the chip's "Deshacer" for a Bizum payment calls the undo route directly, and the route's whole-Bizum behaviour is what this task verifies.

## Tests

Per the Test Methodology of F10 and F11:

- **Integration** `bizum-undo-service.test.ts`:
  - UC-006-06-S1;
  - S2: either payment undoes both, from either game;
  - S3: manual Efectivo and Bizum payments, unchanged;
  - a set with a game no longer played is refused whole;
  - no share is in both tables.
- **Unit** `own-disclosure.test.ts`: the method is copied; an input with extra fields (`bizumId`, a sender) yields none of them.
- **Route** `own-router.test.ts`: UC-006-07-S4, each row, including "Ver como jugador" and "Ver como otro jugador".
- **Integration** `payment-detail-service.test.ts`, and its route: S2 and S3; the three `resolved` values; `bizum.payments` for two shares; 403 for a player.
- **Unit (web)** `ownDebts.test.ts`: the method tag; `paymentCell.test.ts`: a Bizum chip opens the detail.
- **Hard requirements:** `server/src/repo/bizum-correction-requirements.test.ts` with `describe` blocks `UC-006-06-S1`, `S2`, `S3`, `UC-006-07-S2`, `S3`, `S4`.

## Definition of Done

- [x] Every test above passes.
- [x] **Graduation:** UC-006-06-S1–S3, UC-006-07-S2–S4 → marked tests.
- [x] **Hard requirements:** the marked tests exist and pass.
- [x] **Documentation:**
  - `docs/users-and-roles.md`: a player sees the method of each payment, and nothing of the Bizum.
  - `docs/domain-model/ciclo-del-partido.md`: undoing a payment from a Bizum undoes all of its payments and returns it to the list.
- [x] **Tests:** `npm test`; `npm run test:e2e`.
- [x] **Regression:** `npm test`.
- [x] **Code checks:** `npm run lint`, `npm run format:check`; both coding standards.

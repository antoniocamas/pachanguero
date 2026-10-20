# Task 01 — Extract `ShareSettler` from `PaymentService`

## Type

**Refactor.** Iteration 1. Elements absorbed: **R1**. Depends on: nothing.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD (sections 1 and 2), and section 3 `#### R1`.
- `AGENTS.md`; `.agents/rules/coding-standard.md`.
- `docs/test-strategy.md`.
- Also discover, through `AGENTS.md`'s documentation routing, the guidelines covering each file you touch.

## Description

Move the per-share work of `PaymentService` (the body of `settle` and the body of `undo`'s transaction) into a new class `ShareSettler`, with `settle(gameId, member, settlement)` and `unsettle(payment)`. The new class opens no transaction and checks no capability. `PaymentService` keeps the request checks, `require('pay')` and the transaction. Behaviour, messages and the order of writes do not change.

## Guidelines

1. Read `server/src/repo/payment-service.ts` and the two constructions (`repo/index.ts`, `repo/game-flow-test-support.ts`).
2. Create `server/src/repo/share-settler.ts` with `Settlement` and `ShareSettler` as R1's Approach shows. Move `nameOf` with it, and keep the Spanish messages verbatim.
3. Reduce `PaymentService` to its four constructor arguments. `pay` maps the shares to `settler.settle` inside its transaction; `undo` calls `settler.unsettle` inside its transaction.
4. Wire `shareSettler` in `repo/index.ts`, and `settler` in `GameFlow`.
5. Write the doc comment stating the caller's obligations (transaction held, capability checked).

## Tests

- **Integration (existing):** `payment-service.test.ts` and the six other suites that call `pay`/`undo` pass **with no line changed**.
- **Integration (new)** `share-settler.test.ts`:
  - `settle` inside a caller's transaction that then throws leaves the debt, no payment, and an unpaid participation.
  - `settle` then `unsettle` of the same share restores the debts, the payments and the participation.

## Definition of Done

- [x] `git diff` shows no change to any existing test file.
- [x] `share-settler.test.ts` passes with the two properties above.
- [x] **Graduation:** UC-006-08-S2 (the rules of payment do not change) is held by the existing `payment-service.test.ts` refusals; no new marked test.
- [x] **Hard requirements:** none new (structure only).
- [x] **Documentation:** none is made untrue (internal structure).
- [x] **Tests:** `npm test`.
- [x] **Regression:** `npm test`.
- [x] **Code checks:** `npm run lint`, `npm run format:check`; the coding standard (no free functions, no stateless statics).

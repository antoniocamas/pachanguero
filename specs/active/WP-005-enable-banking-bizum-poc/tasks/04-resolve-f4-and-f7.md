# Task 04 — Resolve F4 and F7 from the real results

## Type

**Study** (the iteration's resolve-task: both deferred elements, taken together). Iteration 1. Elements absorbed: **F4, F7**. Depends on tasks 01, 02, 03.

## Mandatory Reading

- `DESIGN_PLAN.md` §2.7 rows F4 and F7 (their deferral and resolver), §2.9
- `REQUIREMENTS.md` UC-005-04, UC-005-08, UC-005-09
- `study/poc-experiments.md`
- The anonymised notes in `poc/README.md` from tasks 01-03 and the real `poc/local/transactions.jsonl`

## Description

Decide what the design could not: **F4**, the rule that recognises a Bizum and extracts its sender and amount, from the real payloads; **F7**, the outline of the two guides, from what the commands showed. Write the decisions into a short `iterations/1/DESIGN_PLAN.md` (a page), keeping F4 and F7 identifiers.

## Guidelines

1. Read the real Bizums (and a card payment and a transfer) in `transactions.jsonl`, by hand, in the local folder; compare `debtor`, `remittance_information`, `bank_transaction_code`, `note`, `reference_number`, `status` (UC-005-04-S1).
2. State the rule: which field values appear in every Bizum and in no other transaction, which field carries the sender and which the amount; if none exists, state that and what is missing (UC-005-04-S2). Use only anonymised shapes in the document.
3. State the guides' outlines: for each of the experiments of `study/poc-experiments.md`, its answer or "not determined", and the section of the guide it goes to.
4. Do not write the guides here. Then append implementation tasks for F4 (`inspect`, `recognise`) and F7 (the two guides).

## Tests

None (a document); completeness is the definition of done.

## Definition of Done

- [ ] `iterations/1/DESIGN_PLAN.md` states F4's rule (or its negative result) and the guides' outlines, with every experiment E-02 to E-12 answered or marked "not determined".
- [ ] The document contains no name, amount, phone number, IBAN or id from the real data.
- [ ] Implementation tasks for F4 and F7 are appended to `tasks/` and proposed to the author.
- [ ] **Graduation:** UC-005-04-S1, S2 `document`.
- [ ] **Hard requirements:** none.
- [ ] **Documentation:** none outside the work package.
- [ ] **Tests:** not applicable (a document).
- [ ] **Regression:** not needed.
- [ ] **Code checks:** none apply.

# Task 06 — Recognise the Bizums

## Type

**Feature.** Iteration 1. Elements absorbed: **F4** (resolved by task 04's design note). Depends on task 02; appended after task 04's resolution of F4.

## Mandatory Reading

- `iterations/1/DESIGN_PLAN.md` (the rule and the fields)
- `REQUIREMENTS.md` UC-005-04
- `study/poc-experiments.md` (E-05)

## Description

Add `recognise` to `poc/ebpoc.py`, which lists the incoming Bizums in `transactions.jsonl` with date, amount and sender, applying the rule decided in the iteration design.

## Guidelines

1. Implement the rule as a pure function `bizum_sender(tx)` returning the sender string or `None`.
2. `recognise` prints counts by default (total Bizums, names, phone numbers, distinct senders); `--show` prints one line per Bizum for the organiser's eyes; `--out` writes `reports/bizums.jsonl` (local).
3. A diagnostic `inspect` is not needed: the rule was derived from the data in task 04.

## Tests

- `selfcheck` with anonymised fixtures: a Bizum credit, an outgoing Bizum, a non-Bizum `TOPUP` credit, a `PDNG` Bizum, a transfer: only the first is recognised; a phone-number sender is returned as such.
- Manual: count compared with the organiser's own knowledge.

## Manual Test Plan

1. Run `recognise`: the total matches the 412 found by hand.
2. Run `recognise --show` and compare a few recent lines with Revolut's app.

## Definition of Done

- [ ] `selfcheck` passes with the fixtures above.
- [ ] `recognise` reports 412 Bizums on the local data.
- [ ] **Graduation:** UC-005-04-S3 `document`.
- [ ] **Hard requirements:** none. **Documentation:** none outside the work package. **Tests:** `python3 poc/ebpoc.py selfcheck`. **Regression / Code checks:** none apply.

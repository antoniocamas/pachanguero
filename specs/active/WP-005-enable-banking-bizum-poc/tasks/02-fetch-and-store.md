# Task 02 — Fetch and store the transactions

## Type

**Feature.** Iteration 1. Elements absorbed: **F3**. Depends on task 01.

## Mandatory Reading

- `DESIGN_PLAN.md` §2 (HLD) and the F3 row of §2.7
- `study/enable-banking-docs.md` (Q-06, Q-07, Q-08)
- API reference: `GET /accounts/{account_id}/transactions` (`date_from`, `strategy`, `continuation_key`) and the Transaction schema

## Description

Add `fetch` to `poc/ebpoc.py`, appending new transactions to `poc/local/transactions.jsonl`.

## Guidelines

1. `fetch --from YYYY-MM-DD [--strategy longest]`: for each account in `session.json` call the endpoint, follow `continuation_key` until it is absent, also through an empty page that still carries a key (record in the README whether this happens, E-08).
2. Store each transaction once, keyed by (`identification_hash`, `entry_reference`); never `transaction_id`. Skip `status` `PDNG` (count them in the output). If a booked transaction has no `entry_reference`, key it by a hash of its content and say so in the output.
3. Add `_hash` (the key) and `_fetched_at` to each stored line. Print counts: fetched, new, already stored, pending skipped, earliest `booking_date` returned.
4. On an unavailable period (`WRONG_TRANSACTIONS_PERIOD`) print the code; the first run uses `--strategy longest` (UC-005-02-S1).
5. After a re-authorisation the same account must continue the same store by `identification_hash` (UC-005-07-S3): key accounts by hash, not by `uid`.

## Tests

- `selfcheck` (automated, synthetic): extend with a fixture of 40 anonymised booked transactions plus 2 new and 1 `PDNG` — a second pass stores 2, skips the pending one.
- Manual: see the plan.

## Manual Test Plan

1. With the session of task 01, run `fetch --from 2025-09-01 --strategy longest`; the counts and the earliest booking date are printed.
2. Run the same command again: zero new transactions.
3. Note the output of the earliest date, the paging behaviour and whether any transaction had no `entry_reference`, in the README.
4. `git status`: `transactions.jsonl` is not listed.

## Definition of Done

- [ ] `selfcheck` passes with the dedup and pending fixtures.
- [ ] The second real fetch (step 2) adds zero transactions; the output is pasted (anonymised) in the README.
- [ ] README records the E-08 findings: empty page with a key, `entry_reference` presence for `BOOK` and `PDNG`.
- [ ] **Graduation:** UC-005-02-S1–S3 `throwaway`; UC-005-07-S3 `document` (guide, task 07).
- [ ] **Hard requirements:** none.
- [ ] **Documentation:** none outside the work package.
- [ ] **Tests:** `python3 poc/ebpoc.py selfcheck`.
- [ ] **Regression:** none needed (nothing the application runs changes).
- [ ] **Code checks:** none apply to this folder.

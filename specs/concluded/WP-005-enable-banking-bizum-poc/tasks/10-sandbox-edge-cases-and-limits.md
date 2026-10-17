# Task 10 — Sandbox edge cases

## Type

**Feature.** Iteration 2. Elements absorbed: **F10**. Depends on task 08, and on task 09 for the data tools. The rate-limit row and the limits (UC-005-15) are not here: they belong to task 12.

## Mandatory Reading

- `iterations/2/REQUIREMENTS.md`: UC-005-14
- `DESIGN_PLAN.md` §2 (HLD) and the F10 row of §2.7
- `output/enable-banking-control-panel-and-testing.md` §5

The implementor must also discover, through the project's documentation-routing rule, the guidelines covering the files touched.

## Description

Try to produce each situation of the UC-005-14 table in the Sandbox, except the rate limit (task 12).

## Guidelines

1. UC-005-14: a short `valid_until`, waiting for expiry; `DELETE /sessions`; a pending entry replaced by a booked one; a 100-entry fixture for a second page. Fill every row with `produced`, `not produced` or `not determined`, the steps and the error code.
2. Record in the results section of `poc/README.md`.

## Tests

- `selfcheck` (automated, synthetic): none new unless a helper is added.
- The rest is manual.

## Manual Test Plan

1. The situations table has no empty row but the rate limit.
2. The rate-limit row says "see task 12".

## Definition of Done

- [x] `poc/README.md` holds the filled situations table with evidence.
- [x] **Graduation:** UC-005-14 `document` (through task 11).
- [x] **Documentation:** `poc/README.md` updated.
- [x] **Tests:** `python3 poc/ebpoc.py selfcheck` passes; the rest is manual (reason: depends on the sandbox).
- [x] **Hard requirements:** none.
- [x] **Regression:** none needed (nothing outside `specs/` changes).
- [x] **Code checks:** none apply to this folder.

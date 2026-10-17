# Task 12 — Sandbox limits

## Type

**Feature.** Iteration 2. Elements absorbed: **F12**. Depends on tasks 08–11. The burst part was dropped by the author's decision, so it no longer waits for iteration 1's task 03.

## Mandatory Reading

- `iterations/2/REQUIREMENTS.md`: UC-005-15, and the rate-limit row of UC-005-14-S1
- `DESIGN_PLAN.md` §2 (HLD), the F12 row of §2.7 and the risk "a rate limit locks us out for hours" in §2.9
- `tasks/03-limit-probe.md` and its runbook in `poc/README.md`, `study/enable-banking-docs.md` (Q-06)
- the two documents of task 11, for the placeholder to fill

The implementor must also discover, through the project's documentation-routing rule, the guidelines covering the files touched.

## Description

Measure the sandbox application's limits and replace the placeholder in the two documents of task 11 with the results. Reuse `limits` of task 03 against the sandbox configuration where it fits.

## Guidelines

1. UC-005-15-S2/S3 first: sessions opened up to ten or the first refusal; read the terms and Control Panel for retention and automated use, quoting the source; try one call from a CI-like environment only if the terms allow.
2. UC-005-15-S1: **not run, by the author's decision (2026-10-17)**: the organiser does not want to risk being blocked, and the sandbox shares the API host with production. Record the call limit as `not determined` and say why.
3. Record the figures in the results section of `poc/README.md`, then replace the placeholder in each document of task 11, and adjust the recommendation's schedule and key-location parts if the figures change them.

## Tests

- `selfcheck` (automated, synthetic): none new unless a helper is added.
- The burst depends on the sandbox and is manual.

## Manual Test Plan

1. The number of sessions allowed and the sources for retention and automated use are written down.
2. The call limit is written down as not measured, with the reason.
3. Neither document of task 11 contains the placeholder any more.

## Definition of Done

- [x] `poc/README.md` holds what was learned about sessions, terms and CI use with evidence; the rate-limit row of the situations table says it was not tried on purpose.
- [x] Both documents of task 11 carry what was learned and the not-measured call limit, instead of the placeholder.
- [x] **Graduation:** UC-005-15 `document` (through the documents of task 11).
- [x] **Documentation:** the two documents and `poc/README.md` as above.
- [x] **Tests:** `python3 poc/ebpoc.py selfcheck` passes; the rest is manual (reason: depends on the sandbox).
- [x] **Hard requirements:** none.
- [x] **Regression:** none needed (nothing outside `specs/` changes).
- [x] **Code checks:** none apply to this folder.

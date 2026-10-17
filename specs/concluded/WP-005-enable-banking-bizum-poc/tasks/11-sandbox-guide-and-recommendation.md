# Task 11 — The sandbox guide and the Pachanguero recommendation

## Type

**Study.** Iteration 2. Elements absorbed: **F11**. Depends on tasks 08, 09 and 10. The limits come from task 12, which runs after this one: the documents carry a placeholder for them.

## Mandatory Reading

- `iterations/2/REQUIREMENTS.md`: UC-005-16 and UC-005-17
- `DESIGN_PLAN.md` F11 row of §2.7
- the results sections of `poc/README.md` from tasks 08–10
- `output/enable-banking-control-panel-and-testing.md` (the style to follow), `output/pachanguero-integration.md`, `study/pachanguero-today.md`, and WP-006's `DESIGN_PLAN.md` §2.10.1

The implementor must also discover, through the project's documentation-routing rule, the guidelines covering the files touched.

## Description

Write two documents in `output/`: a guide to testing against the Enable Banking sandbox, in the style of the production-side guide, and a recommendation for applying it to Pachanguero. Correct in place any statement of the earlier guide or the README that the experiments falsified.

## Guidelines

1. The guide: one verdict line per question, then what was done and what happened, each claim tagged `[PoC]`, `[docs]` or `[not determined]`; the steps from registering a Sandbox application to a finished read; surprises, instabilities and costs.
2. The recommendation: place each scenario (a new Bizum between two reads, a session expiring, a session ended early, a read of many Bizums, a read that fails) on the fake bank, the sandbox or the real account, each with its reason; schedule, key location, the test-only catalogue entry and its honesty; the decisions left to WP-006.
3. Only anonymised findings; nothing from `poc/local/` or `poc/local-sandbox/`.
4. Where the limits go (rate limit, calls per day or hour, sessions, retention, use from a CI machine), leave one clearly marked placeholder in each document naming task 12 as the one that fills it, and write the recommendation's schedule and key-location parts so they say what they depend on it for.
5. Correct, never append, the contradicted statements of `output/enable-banking-control-panel-and-testing.md` and `poc/README.md`.

## Definition of Done

What the documents must answer, and what makes them complete:

- [x] Every question of `SANDBOX_TESTING_NEEDS_FROM_WP-006.md` but the limits has a verdict line, or says `not determined` with what was tried.
- [x] Every scenario named in UC-005-17-S1 sits on exactly one tier with a reason traced to a verdict.
- [x] A reader who has not seen this work package can follow the guide from registration to a finished read.
- [x] Each document holds the placeholder for the limits, naming task 12.
- [x] No contradiction remains between the new documents, the earlier guide and the README.
- [x] **Graduation:** UC-005-16 and UC-005-17 `document`: the two files are in `output/`.
- [x] **Documentation:** `output/enable-banking-control-panel-and-testing.md` and `poc/README.md` corrected where they differ.
- [x] **Tests:** none (reason: the deliverable is documents; its check is the reading above).
- [x] **Hard requirements:** none.
- [x] **Regression:** none needed (nothing outside `specs/` changes).
- [x] **Code checks:** none apply to this folder.

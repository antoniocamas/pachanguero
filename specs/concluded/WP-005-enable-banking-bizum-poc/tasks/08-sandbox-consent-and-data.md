# Task 08 — Sandbox consent and data control

## Type

**Feature.** Iteration 2. Elements absorbed: **F8**. No dependency; runs first, because its verdicts decide how much of tasks 09 and 10 can be scripted.

## Mandatory Reading

- `iterations/2/REQUIREMENTS.md`: UC-005-10 and UC-005-11
- `DESIGN_PLAN.md` §2 (HLD) and the F8 row of §2.7
- `SANDBOX_TESTING_NEEDS_FROM_WP-006.md`, `output/enable-banking-control-panel-and-testing.md` §4–§5, `poc/README.md`
- Playwright documentation, if it is used for UC-005-10 (add the pages you relied on here)

The implementor must also discover, through the project's documentation-routing rule, the guidelines covering the files touched.

## Description

Run the experiments of UC-005-10 and UC-005-11 against a **Sandbox** application and record each outcome. Add to `poc/ebpoc.py` only the commands the experiments need (for example an upload or removal call, if the API offers one), with a scripted-consent helper kept in its own file under `poc/`.

## Guidelines

1. Register or reuse the Sandbox application with its key in `poc/local-sandbox/` (git-ignored; never copy the production key).
2. UC-005-10: drive the consent page with a script. Playwright is already installed in the repository's `e2e` workspace (Node, with Chromium); write the consent script in Node under `poc/`, run it with that installation, and install nothing else without asking the author. Never bypass a bot check, CAPTCHA or MFA; if one stops the script, record it and stop that experiment. Run it three times in a row, once headless.
3. UC-005-11: try, in order, an API call, then the page driven by script, to create, append (after authorisation) and remove Mock data; then S4 with two Sandbox applications. Use only the synthetic fixture.
4. Record per scenario: what was done, what happened, the verdict (`scriptable`, `hand only`, `not determined`) and the tag `[PoC]`/`[docs]`/`[not determined]`, in a results section of `poc/README.md`.

## Tests

- `selfcheck` (automated, synthetic): any new pure helper (a results formatter, a fixture builder) gets a case there.
- The experiments themselves depend on the bank and are manual: see the plan.

## Manual Test Plan

1. A Sandbox application exists with its key in `poc/local-sandbox/`, and `git status` shows nothing from that folder.
2. Run the scripted consent three times; each ends with a redirect carrying `state` and `code`, or the stopping protection is written down.
3. Upload the fixture, list it, remove it, list again; the Mock shows the account only in between (by the means that worked).
4. Authorise, fetch (21), add one entry, fetch again; the second read shows exactly that entry, or the impossibility is written down.

## Definition of Done

- [x] `poc/README.md` holds a verdict line and evidence for each scenario of UC-005-10 and UC-005-11 (S1 and S3 of UC-005-10 and S1/S4 of UC-005-11 recorded as `not determined`, with what was tried).
- [x] **Graduation:** UC-005-10 and UC-005-11 `document` (through task 11).
- [x] **Documentation:** `poc/README.md` corrected where a command or fixture changed.
- [x] **Tests:** `python3 poc/ebpoc.py selfcheck` passes (`selfcheck ok`); the rest is manual (reason: depends on the sandbox).
- [x] **Hard requirements:** none.
- [x] **Regression:** none needed (nothing outside `specs/` changes).
- [x] **Code checks:** `npx eslint` on `poc/sandbox_consent.mjs` and `prettier --check` pass.

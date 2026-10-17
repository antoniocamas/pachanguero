# Task 09 — Sandbox redirect and fidelity

## Type

**Feature.** Iteration 2. Elements absorbed: **F9**. Depends on task 08 (a scripted way to consent and to prepare data, or the knowledge that there is none).

## Mandatory Reading

- `iterations/2/REQUIREMENTS.md`: UC-005-12 and UC-005-13
- `DESIGN_PLAN.md` §2 (HLD) and the F9 row of §2.7
- `output/enable-banking-revolut-integration.md` (the real Bizum fields, anonymised), `output/enable-banking-control-panel-and-testing.md` §2, §4, §5, `poc/README.md` (E-04)

The implementor must also discover, through the project's documentation-routing rule, the guidelines covering the files touched.

## Description

Run the experiments of UC-005-12 (redirect URLs) and UC-005-13 (`entry_reference`, `date_from`, order, shape, bank name and country) against the Sandbox, and record the outcomes. The fixture may be extended with entries older and newer than the dates tested.

## Guidelines

1. UC-005-12: register the localhost URL, then `POST /auth` with it, recording the two outcomes separately; then three `https` URLs. A server listening on the port receives the redirect where accepted.
2. UC-005-13-S1/S2: three reads of the fixture (two in one session, one in another) and the `date_from` table; compare `entry_reference` and order. S3: compare fields against the real shape using the anonymised guide only, never `poc/local/`. S4: `GET /aspsps` and `POST /auth` for `ES`, `GB`, `DK`.
3. Record per scenario as in task 08, in the results section of `poc/README.md`; close E-04 there.

## Tests

- `selfcheck` (automated, synthetic): the comparison of two reads (stable / changed references) is checked on fake reads.
- The rest is manual.

## Manual Test Plan

1. For each of the three redirect cases of UC-005-12, `POST /auth` is called and its HTTP status and error code noted.
2. The `date_from` table of UC-005-13-S2 is filled with the entries actually returned and their order.
3. The field comparison lists every field that differs, with no real name, phone number or amount in it.

## Definition of Done

- [x] `poc/README.md` holds a verdict line and evidence for each scenario of UC-005-12 and UC-005-13; E-04 is closed.
- [x] **Graduation:** UC-005-12 and UC-005-13 `document` (through task 11).
- [x] **Documentation:** `poc/README.md` and any changed fixture described.
- [x] **Tests:** `python3 poc/ebpoc.py selfcheck` passes; the rest is manual.
- [x] **Hard requirements:** none.
- [x] **Regression:** none needed (nothing outside `specs/` changes).
- [x] **Code checks:** none apply to this folder.

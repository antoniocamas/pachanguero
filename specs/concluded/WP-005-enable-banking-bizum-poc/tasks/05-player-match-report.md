# Task 05 — The player match report

## Type

**Feature.** Iteration 1. Elements absorbed: **F5**. Depends on the F4 implementation task appended after task 04 (it needs the recognised senders).

## Mandatory Reading

- `DESIGN_PLAN.md` §2 (HLD) and the F5 row of §2.7
- `study/pachanguero-today.md` (Q-10, Q-11)
- `server/src/domain/name-matcher.ts`, `server/src/domain/name-stripper.ts` (the rule being ported)
- `server/src/db/schema.sql`, tables `players`, `player_aliases`

## Description

Add `match --db <path>` to `poc/ebpoc.py`: it reads player names and aliases from the SQLite file in read-only mode, matches each recognised Bizum sender with a port of the `NameMatcher` rule, and prints `matched`, `ambiguous` or `unresolved` with the totals. It writes nothing to the database.

## Guidelines

1. Open the database with `sqlite3.connect('file:<path>?mode=ro', uri=True)`; read `players(id, name)` and `player_aliases(player_id, alias)`.
2. Port the rule: strip (remove invisible characters, list marker, emoji, collapse whitespace), then compare with case- and accent-insensitive equality (`unicodedata` NFD without combining marks, `casefold`); report more than one match as `ambiguous`.
3. Output per sender: the sender text (printed to the terminal only), the outcome; then totals and the kinds of mismatch seen (abbreviation, case, accents, nickname). Reports containing real names stay under `poc/local/reports/`.
4. Compare the port with `NameMatcher` on a few fixtures to confirm the `inferred` equivalence (design §2.2).

## Tests

- `selfcheck` (automated, synthetic): fixtures for matched, ambiguous, unresolved, accents, case and emoji decoration; a check that the database file's modification time is unchanged after a run.
- Manual: run against the real database copy and read the report.

## Manual Test Plan

1. Run `match --db <the real database>` after `recognise`; each real sender has an outcome.
2. Check a few `unresolved` ones by eye and note the kind of mismatch.
3. Confirm the database file's modification time did not change.

## Definition of Done

- [ ] `selfcheck` passes including the unchanged-modification-time check.
- [ ] The match rate and the mismatch kinds (anonymised) are noted in the README.
- [ ] **Graduation:** UC-005-05-S1, S2 `document` (Pachanguero guide, task 07).
- [ ] **Hard requirements:** none.
- [ ] **Documentation:** none outside the work package.
- [ ] **Tests:** `python3 poc/ebpoc.py selfcheck`.
- [ ] **Regression:** none needed (the database is only read).
- [ ] **Code checks:** none apply to this folder.

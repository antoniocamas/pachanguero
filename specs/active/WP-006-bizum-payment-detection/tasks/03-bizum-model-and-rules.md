# Task 03 — The Bizum model and the rules that judge it

## Type

**Feature.** Iteration 1. Elements absorbed: **F2**, **F3**. Depends on: task 01.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD (2.1, 2.4), and section 3 `#### F2` and `#### F3`.
- `REQUIREMENTS.md`: UC-006-02-S1, UC-006-03 (the rule table, S1–S4, S7, S8), UC-006-04-S5, UC-006-11.
- `docs/domain-model/README.md`.
- `AGENTS.md`; `.agents/rules/coding-standard.md`; `docs/test-strategy.md`.
- Discover, through `AGENTS.md`, the guidelines for each file touched.

## Description

Create the bank-neutral Bizum core's model and ports, and the boundary test that keeps it free of the application (F2). Then create the rules R1–R7 over a facts record, with:

- sender identification from stored data only (Bizum name, phone);
- suggestions by the prefix-of-initials rule;
- whole-word keywords;
- nearest-first open shares in the Bizum's season;
- the facts reader;
- `players.bizum_name` as migration step 4 (F3).

Nothing is read from a bank yet.

## Guidelines

1. **F2.** Create `server/src/bizum/model.ts` and `ports.ts` exactly as F2's Approach shows, with these amendments made later in the design:
   - F5 adds `BankFailure` and `BankError`;
   - `entries(…, {deep})`;
   - `Recognised` carries a key.

   Then `server/src/architecture-boundaries.test.ts` with its two rules. Prove each rule bites with a temporary file, then remove the file.
2. **F3, domain.** Create `text-folding.ts`, `keyword-list.ts`, `phone-key.ts`, `sender-suggestion.ts`, `sender-identification.ts`, `nearest-debt-order.ts` and `bizum-rules.ts`. `bizum-rules.ts` holds:
   - the seven rule classes and `BizumRuleSet`, with new and review modes;
   - `WaitReason`, including `undone` (amended by F10) and `amounts_differ` (F7).
3. **F3, repo.** Add `DebtRepository.openInSeason` (played games only), `PlayerRepository.listBizumNames`, `ContactRepository.listPhones`, `BizumFactsReader` with the `KeywordSource` port, and `PlayerMergeService` keeping `bizum_name`.
4. **Step 4.** Freeze `schema.sql` as `fixtures/schema-v3.sql`. Add `players.bizum_name` (last column) to `schema.sql`, `PlayerBizumNameMigration`, and `LATEST_SCHEMA_VERSION = 4`.

## Tests

Per F2's and F3's Test Methodology:

- **Unit** `model.test.ts`: each invariant row, valid and broken; `counterparty`; blank becomes null.
- **Unit** (the boundary): `architecture-boundaries.test.ts`.
- **Unit:**
  - `bizum-rules.test.ts`: every row of UC-006-03-S1–S4, S7, S8 and UC-006-11-S1, S2 as facts; review mode never discards (UC-006-10-S3); swapping R1 and R3 changes S8 row 1.
  - `sender-identification.test.ts`: UC-006-03-S1 rows; a phone typed four ways; a name on two players.
  - `sender-suggestion.test.ts`: the six rows of UC-006-04-S5.
  - `keyword-list.test.ts`: `fútbol`/`futbol`, `cena` vs `escena`, a phrase, an empty subject.
  - `nearest-debt-order.test.ts`.
- **Integration:**
  - `bizum-facts-reader.test.ts`: two seasons, a game after the booking date, a reopened game, a missing season.
  - `player-bizum-name-migration.test.ts`; `schema-migrator.test.ts` from `schema-v3.sql`.
  - `player-merge-service.test.ts`: the Bizum name survives a merge.
- **Hard requirements:** `server/src/domain/bizum-rules-requirements.test.ts` with `describe` blocks `UC-006-03-S1`, `S2`, `S3`, `S4`, `S7`, `S8`, `UC-006-04-S5`, `UC-006-11-S1`, `UC-006-11-S2`.

## Definition of Done

- [ ] Every test above passes, and the boundary test fails on each temporary violation before it is removed (noted in the commit message).
- [ ] **Graduation:** UC-006-03-S1–S4, S7, S8, UC-006-04-S5, UC-006-11-S1, S2 → marked tests.
- [ ] **Hard requirements:** the marked tests exist and pass.
- [ ] **Documentation:** `.agents/rules/coding-standard.md`: one line on the core's boundary (section 4 of the design).
- [ ] **Tests:** `npm test`.
- [ ] **Regression:** `npm test`.
- [ ] **Code checks:** `npm run lint`, `npm run format:check`; the coding standard.

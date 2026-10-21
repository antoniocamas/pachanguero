# Task 05 — The Revolut dialect, the bank catalogue and the reading settings

## Type

**Feature.** Iteration 1. Elements absorbed: **F4**, **F6**. Depends on: task 04.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD, and section 3 `#### F4` and `#### F6`.
- `REQUIREMENTS.md`: UC-006-02-S1, S2, S4, S5; UC-006-01-S6, S7, S14, S15; UC-006-09.
- WP-005 guide `enable-banking-revolut-integration.md` §4–§6.
- `AGENTS.md`; `.agents/rules/coding-standard.md`; `docs/test-strategy.md`.
- Discover, through `AGENTS.md`, the guidelines for each file touched.

## Description

- Recognise a Revolut Bizum and describe an account (`RevolutDialect`).
- List the supported banks (`BankCatalogue`); production lists Revolut, tests list Revolut and Banco Ficticio.
- Let the organiser choose the bank, currency, account and start date, and edit the two keyword lists.
- Expose the readiness that says whether anything may be read (`BankSettingsService`, `KeywordRepository`, `AccountSelection`, `ReadingReadiness`).

## Guidelines

1. **F4.** Write `RevolutDialect` following its decision table (the five rows, in order) and the exact decimal parsing. `last4` comes from `account_id.iban` if present, else from the hash. Then write `BankCatalogue`, and wire the production catalogue.
2. **F6, storage.** Add `bank_settings` and `bank_keywords` to `schema.sql` (no migration step). `BankSettingsRepository.ensure()` writes the row and the four initial include words **once**.
3. **F6, domain and service.** Write `AccountSelection`, `ReadingReadiness` and `BankSettingsService`, which implements F5's `BankChoice` (replacing task 04's empty one) and enforces the change table. `KeywordRepository` implements F3's `KeywordSource`.
4. **F6, routes.** Add `PUT /bank/settings` and `PUT /bank/words` to `BankAdminRouter`, and F6's part of the `GET /bank` panel.

## Tests

Per the Test Methodology of F4 and F6:

- **Unit:**
  - `revolut-dialect.test.ts`: the five rows; the amounts of UC-006-02-S5 plus `"0.5"`, `"4.505"`, `"-4.00"`; phones with and without spaces; a blank message; the whole of `fixtures/entries.json` with its expected counts; `describeAccount` with and without an IBAN.
  - `bank-catalogue.test.ts`.
  - `account-selection.test.ts`, with the four accounts of UC-006-01-S6.
  - `reading-readiness.test.ts`.
- **Integration** `bank-settings-service.test.ts`: every row of the change table; the initial words written once and not restored after a removal; `current()` for none, stored and unsupported.
- **Route:** both `PUT`s (400 with the message; 403 for a player and for "Ver como jugador").
- **Hard requirements:** `server/src/repo/reading-settings-requirements.test.ts` with `describe` blocks `UC-006-01-S6`, `S7`, `S14`, `S15`, `UC-006-09-S1`, `S2`, and `server/src/bank/revolut-dialect-requirements.test.ts` with `UC-006-02-S1` (recognition), `S2` (not kept: rows 1–3), `S4`, `S5`.

## Definition of Done

- [x] Every test above passes.
- [x] **Graduation:** the listed scenarios → marked tests. The comparison against a real read is in task 11.
- [x] **Hard requirements:** the marked tests exist and pass.
- [x] **Documentation:** none outside the work package (the panel's text is documented with task 09; the settings are not environment variables).
- [x] **Tests:** `npm test`.
- [x] **Regression:** `npm test`.
- [x] **Code checks:** `npm run lint`, `npm run format:check`; the coding standard.

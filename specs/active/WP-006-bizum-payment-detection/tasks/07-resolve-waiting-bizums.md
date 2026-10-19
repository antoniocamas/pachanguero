# Task 07 — Resolve waiting Bizums: list, pair, rule, dismiss, and settle when a game is played

## Type

**Feature.** Iteration 1. Elements absorbed: **F8**, **F9**. Depends on: task 06.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD (2.2 D-4, 2.5), and section 3 `#### F8` and `#### F9`. Also `#### F13`, for the `open-shares` route it adds to F8.
- `REQUIREMENTS.md`: UC-006-04, UC-006-05, UC-006-10.
- `docs/domain-model/ciclo-del-partido.md`.
- `AGENTS.md`; `.agents/rules/coding-standard.md`; `docs/test-strategy.md`.
- Discover, through `AGENTS.md`, the guidelines for each file touched.

## Description

The organiser resolves what waits:

- the list, with stored reasons and fresh suggestions;
- pairing, which writes the Bizum name or the phone and re-judges that sender's waiting Bizums;
- the pairings list (list, set by hand, remove);
- ruling a number of shares (it never pairs, and never pays more than the Bizum);
- dismissing forever.

Separately, a waiting Bizum settles by itself when a game is played: `BizumReevaluationEffect`, listed after `BillingEffect`.

## Guidelines

1. Write `BizumResolutionService` (`waiting`, `openShares`, `rule`, `dismiss`, `reevaluate`) and `SenderPairingService` (`pair`, `pairings`, `setBizumName`, `clearBizumName`). Every change is one transaction through F7's `BizumSettlementService`.
2. Write `BizumAdminRouter` with F8's route table plus `GET /bizums/:id/open-shares?playerId=` (F13's amendment). Mount it beside `api`.
3. Write `BizumReevaluationEffect`, and list it after `BillingEffect` in `repo/index.ts` and in `GameFlow`.
4. Re-judgment always uses `review` mode, oldest booking first.

## Tests

Per the Test Methodology of F8 and F9 (integration through `GameFlow`, real SQLite):

- UC-006-04-S1 (each row, reason and identities), S2, S3, S5 (suggestions in the list).
- UC-006-05:
  - S1: three rows; the phone written, the email kept.
  - S2: three rows, with the rest.
  - S3: `sharedWith`.
  - S4: the name cleared; the earlier payments stay.
  - S5.
  - S6: each row (read, renewal, pairing, played game, include word).
- The refusals of a ruling ("Solo tiene N cuotas…", "El Bizum no cubre N cuotas"); dismissing a settled Bizum is refused.
- UC-006-10: S1; S2 (each row); S3 (an exclude word added later does not discard); S4 (the older of two settles); a dismissed Bizum is not settled; an error in the effect rolls back the whole `perform`; retract leaves the payments.
- **Route:** every route, and 403 for a player and for "Ver como jugador" (UC-006-04-S4).
- **Hard requirements:** `server/src/repo/waiting-bizums-requirements.test.ts` with `describe` blocks `UC-006-04-S1`, `S2`, `S3`, `S4`, `UC-006-05-S1` to `S6`, `UC-006-10-S1` to `S4`.

## Definition of Done

- [ ] Every test above passes.
- [ ] **Graduation:** UC-006-04-S1–S4, UC-006-05-S1–S6, UC-006-10-S1–S4 → marked tests.
- [ ] **Hard requirements:** the marked tests exist and pass.
- [ ] **Documentation:**
  - `docs/domain-model/ciclo-del-partido.md`: marking a game played settles the waiting Bizums that now qualify, and never discards one; debts are not carried across seasons, by a Bizum or a ruling.
  - `docs/domain-model/glossary.md`: *nombre de Bizum*, *descartar*.
  - `docs/users-and-roles.md`: the player's phone also identifies them as a Bizum sender; bank data and sender names are admin only.
  - `AGENTS.md`: the invariant "a sender is identified only by a stored Bizum name or phone".
- [ ] **Tests:** `npm test`.
- [ ] **Regression:** `npm test`.
- [ ] **Code checks:** `npm run lint`, `npm run format:check`; the coding standard.

# Task 04 — The player's own view, contact data, password and view switch

## Type

**Feature.** Iteration 1. Elements absorbed: **F5, F6, F7, F9**. Depends on: task 03 (sessions, the
guard, the test harness).

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md` and `.agents/rules/frontend-coding-standard.md`
- `docs/test-strategy.md`
- `DESIGN_PLAN.md` §3, subsections `F5`, `F6`, `F7`, `F9`; §2.9 (privacy risks)
- `design/mockups/index.html` and the pages it links: the layout and the Spanish copy to implement
  (approved by the author)
- `REQUIREMENTS.md` UC-004-05, 06, 07, 08, 09, 11, and UC-004-03-S6
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/domain/`, `server/src/repo/`, `server/src/routes/`, `server/src/db/` and `web/src/`.

## Description

A regular user logs in and sees only their own debts, payments and statistics, edits their email and
phone, and changes their password. An admin can look at the app as a player and go back. The server
decides what a player may see (`OwnDisclosure`); the screens only show it. Standing positions are not
part of a player's own view.

## Guidelines

1. **F5** first — `OwnDisclosure`, `OwnPlayer`, `OwnDataService`, the two repository queries,
   `PaymentStat` change (`holderId`), `OwnRouter` with `/api/me/debts`, `/payments`, `/report`.
2. **F6** — the `player_contacts` table and its migration step, `ContactValidator`,
   `ContactRepository`, `ContactService`, `PasswordChangeService`, `SessionRouter` (password change),
   the contact routes on `OwnRouter`, and the merge handling of contacts.
3. **F7** — `AuthService.switchView`, `refresh_tokens.view`, `POST /api/auth/view`, `canSwitchView`.
4. **F9** — the web: `OwnView`, the components, hooks and `lib/ownDebts.ts`, `AccountPanel` and the
   admin's "Mi cuenta" in Ajustes, `ViewSwitch` and "Volver a administrador", `playerStats` without
   the standing position. Match the approved mockups and their copy; do not invent text.
5. Every route test uses two players, so a leak of the other's rows or names would fail.

## Tests

Testability: fully automatable, plus a visual check (HLD 2.10: F9 row). Types per each element's Test
Methodology:

- Unit: `own-disclosure`, `contact-validator`.
- Integration: `own-router`, `session-router` (password, view cases), `contact-repository`,
  `contact-service`, `password-change-service`, `payment-stat`, the added query-cost case in
  `debt-query-cost.test.ts`, additions to `player-merge-service` and `schema-migrator`,
  `auth-router` (`canSwitchView`).
- Web `lib/`: `ownDebts`, `playerStats`, `sessionClient`.
- E2E: `own-view.spec.ts` (switch to the player's view and back, the three own screens, contact and
  password).

## Manual Test Plan

1. Start `npm run dev` with a real `JWT_SECRET` in the environment; create an admin and a regular user
   linked to a player who has a debt and a payment, with the CLI.
2. Open the app at a 375 px wide window, log in as the regular user.
3. Observe each screen against `design/mockups/*.html`: texts, spacing, states (debts, empty, errors).
4. Log in as the admin, switch to the player's view and back; reload in between.
5. Observe: the view survives the reload, "Volver a administrador" returns to the admin tabs, and no
   other player's name or id appears anywhere in the player's screens.

## Definition of Done

- [ ] Every case in the Test Methodology of F5, F6, F7 and F9 exists and passes (`npm test`,
      `npm run test:e2e`).
- [ ] A regular user's session cannot reach any organiser route or another player's data (two-player
      route tests).
- [ ] Manual Test Plan done and its outcome reported.
- [ ] **Graduation:** UC-004-05-S1…S6, UC-004-06-S1…S5, UC-004-07-S1…S6, UC-004-08-S1…S6,
      UC-004-09-S1…S5, UC-004-11-S1, S3…S9 and UC-004-03-S6 are hard requirements → the route, unit,
      `lib/` and E2E tests named above.
- [ ] **Hard requirements:** each scenario named in Graduation has a test whose title says what it
      asserts, with no work-package identifier in the code; this line is the record of which test
      carries which scenario.
- [ ] **Documentation:** `AGENTS.md` Architecture list: the own-data classes and routes, and `App`'s
      third shell (player's own view). The new roles document is written by task 05.
- [ ] **Tests:** `npm test` and `npm run test:e2e`.
- [ ] **Regression:** both commands above on the whole repository.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

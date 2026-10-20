# Task 09 — The Banco panel, the banner, and "Bizums en espera" with its dialogs

## Type

**Feature.** Iteration 1. Elements absorbed: **F12**, **F13**. Depends on: tasks 04–08.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD, and section 3 `#### F12` and `#### F13`.
- `REQUIREMENTS.md`: UC-006-01 (screens), UC-006-02-S9, S10, UC-006-04, UC-006-05, UC-006-06, UC-006-09; `requirements/examples/screens.html`, all frames.
- `.agents/rules/frontend-coding-standard.md`; `AGENTS.md` (web architecture); `docs/test-strategy.md` (E2E section).
- The Playwright documentation for `webServer` and request interception, used by the journeys.
- Discover, through `AGENTS.md`, the guidelines for each file touched.

## Description

Build the screens, in Spanish:

- **Ajustes › Banco** (F12): the connection card with "Leer ahora", the account choice, the reading settings, the keyword lists and the pairings list.
- **The banner** above the tabs of the admin shell (F12).
- **The return from the bank** (`?bank=<code>`) (F12).
- **"Bizums en espera"** at the top of Deudas (F13), with "Leer ahora".
- **The four dialogs** (F13): assign a player, pay shares, dismiss, undo a Bizum. "Deshacer" on a Bizum payment, in the chip or in its detail, goes through the undo dialog.

## Guidelines

1. **`lib/` first, with tests:**
   - `bankMessages.ts`: every server code, including the nine callback codes and the reasons;
   - `bankPanel.ts`, `readNow.ts`, `waitingBizums.ts` (reason lines and actions);
   - `rulingPreview.ts`.
2. **Hooks:** `useBankPanel`, `useBankActions`, `useBizumPairings`, `useBankBanner`, `useReadNow`, `useBankReturn`, `useWaitingBizums`, `useWaitingActions`, `useOpenShares`.
3. **Components:**
   - for F12: the cards, `BankPanel`, `BankBanner`, `ReadNowButton`;
   - for F13: `WaitingBizums`, `WaitingBizumItem` and the four dialogs, on `ResolveDialog`.
4. **Shell:**
   - `Manage` gains the "Banco" section, with its section controlled by `AdminShell`;
   - `AdminShell` renders the banner and handles `?bank=`;
   - `Debts` shows the waiting list first;
   - `PaymentCell` and `PaymentDetail` open the undo dialog for a Bizum payment.
5. **E2E,** against the fake bank of task 04: `the-bank-panel.spec.ts`, `the-waiting-bizums.spec.ts`, `the-bizum-correction.spec.ts`; extend `the-own-view.spec.ts` with the method only.

## Tests

Per the Test Methodology of F12 and F13:

- **Unit (web):**
  - `bankMessages.test.ts`, `bankPanel.test.ts`, `readNow.test.ts`: the frames' states and every code;
  - `waitingBizums.test.ts`: each reason row, and the actions per reason;
  - `rulingPreview.test.ts`: the rows of UC-006-05-S2.
- **E2E:**
  - **bank panel:** both banks listed; connect through the real callback; "Conectado hasta…"; choose the second EUR account; start date; "Leer ahora" ends, and a second press shows "Espera unos minutos"; disconnect with its confirmation.
  - **waiting Bizums:** an unknown sender is read in Deudas, listed "No sabemos quién es el remitente.", and settled by "Asignar jugador"; the chip reads "Pagado 4 € · Bizum".
  - **correction:** a 4,50 € Bizum with «pachanga» ruled for 1 share shows "0,50 € sin asignar" in the detail; undo through the dialog lists it again with "Se deshizo su pago."; then dismissed.
  - **own view:** "Pagos" shows the method and nothing of the Bizum.
- No manual step here: the layout and live checks are in task 11.

## Definition of Done

- [x] Every test above passes; `npm run test:e2e` runs the four journeys plus the existing ones.
- [ ] The journeys add at most about 40 s to the E2E suite (the HLD's budget, 2.10); measured, with the figure recorded in the commit message. Measured 2026-10-20: 25.3 s (bank panel 7.1, correction 6.0, waiting Bizums 4.6, own view 7.6 s); to go in the commit message.
- [x] **Graduation:** the screens of UC-006-01, -02-S9, S10, -04, -05, -06 → the E2E journeys and the `lib` tests. Their server behaviour is already marked by tasks 04–08.
- [x] **Hard requirements:** none new (server-side marks exist); the journeys are named after the scenarios they cover.
- [x] **Documentation:** `README.md` "What it does": one item on reading Bizums.
- [x] **Tests:** `npm test`; `npm run test:e2e`.
- [x] **Regression:** `npm test`.
- [x] **Code checks:** `npm run lint`, `npm run format:check`; the frontend coding standard.

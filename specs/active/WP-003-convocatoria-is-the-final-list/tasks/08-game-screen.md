# Task 08 — The game screen: table, played-state actions, drag swap

## Type

**Feature.** Iteration 1. Elements absorbed: **F9, F10, F11**. Depends on tasks 02, 04, 06 and 07.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/frontend-coding-standard.md`
- `DESIGN_PLAN.md` §3, subsections `F9`, `F10` and `F11`
- `requirements/examples/game-screen.md` and `requirements/examples/mockups/index.html`
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Replace the screen's lists and panels with a state header, one players table whose columns follow the state, and the counters; add the played-state actions in that table (payment button, "Deuda de <holder>" tag, teams paste, resolve); add the drag swap across the line. `GET /games/:id` returns `arrivals` and `points` as of that game.

## Guidelines

1. F9 first, with the swap through "Meter"/"Sacar" buttons; then F11 on the same `PlayersTable`; F10 last, so no scenario waits on the library.
2. **Permissions, asked when this task is picked up:** adding `vitest` to `web` (devDependency, `test` script, root `npm test` hook); installing the drag library (`@dnd-kit/core` 6.3.1 is recommended — verify touch support and React compatibility against the installed version, not from memory), imported in `components/MemberDnd.tsx` only. These are gates, not manual test steps.
3. Delete `PlayerList.tsx`, `ConvocatoriaPanel.tsx`, the old counters, `FinalListPaste.tsx` and `useFinalListPaste.ts`.
4. Rewrite the three e2e specs the design names; cover `plaza de gracia` and `degradado` in unit tests.

## Tests

- Route test per state for `GameViewService` (integration).
- Web unit tests (`vitest`): the `lib/` modules including R2's `money.ts` and `dates.ts`, `holdings.ts` and the payment cell's label function over its matrix.
- E2E per state at 1280×800 and 390×844; a played game with a host with a plus-one and a named guest: the host pays all, the guest pays their own, the tag shows, the total counts once, undo, paste teams, no team asked to pay.
- E2E on desktop with real mouse events: drag a below-the-line row above the line, the table stays; drag a member below; `cambiado a mano` on both; "No quedan plazas" on the 15th. Touch is covered by task 10.

## Definition of Done

- [ ] `vitest` and the drag library are installed with the author's permission; `npm test` runs the web tests.
- [ ] E2E passes per state at both viewports and the drag e2e passes on desktop.
- [ ] **Graduation:** UC-003-10-S1, S2, S4, S5, S6, S7 hard requirement → per-state e2e and unit tests; UC-003-10-S3 and UC-003-04-S1 → the desktop drag e2e; UC-003-06 (screen part) hard requirement → the payment e2e; UC-003-07 (screen part) `throwaway`.
- [ ] **Hard requirements:** each titled with the scenario identifier; no other marking convention exists.
- [ ] **Documentation:** `docs/test-strategy.md` — the unit layer names the web `lib/` tests, the integration layer the `EXPLAIN QUERY PLAN` tests of task 06, the e2e layer the per-state walk at two viewports with the drag driven by mouse events and touch manual. `AGENTS.md` — _Commands_ (`npm test` also runs the web tests), _Web_ ("React 18" is stale — `web/package.json` has React 19; `App.tsx`/`GameDay` described as the lifecycle screen).
- [ ] **Tests:** `npm test` and `npm run test:e2e`.
- [ ] **Regression:** `npm test` and `npm run test:e2e` pass in full.
- [ ] **Code checks:** `npm run lint` and `npm run format:check`; the code follows `.agents/rules/frontend-coding-standard.md`.

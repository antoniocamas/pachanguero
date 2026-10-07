# Task 10 — Manual verification on a phone and the live database

## Type

**Refactor** (verification only — changes nothing; the same convention as WP-001's closing regression). Iteration 1. Elements absorbed: none. Depends on task 09. It holds every manual step of the work package, by the author's request.

## Mandatory Reading

- `AGENTS.md`
- `DESIGN_PLAN.md` §2.10 (Testability Assessment), subsections `F9` and `F10`
- `requirements/examples/game-screen.md`

## Description

The checks no automated test can make.

## Guidelines

1. Run `npm run dev` and open the app on a real phone on the same network.

## Tests

None automated; the plan below is the test.

## Manual Test Plan

1. On the phone, open a played game: every column of the players table is readable, and below 600 px the arrival, points and team fold under the name.
2. Open a game with a 14-member convocatoria and a below-the-line row; drag it above the line with a thumb. The table stays on screen, both rows show `cambiado a mano`, and the swap is still there after reloading.
3. With the convocatoria full, try to add a 15th member: "No quedan plazas" appears and nothing moves.
4. On the recreated database, re-enter game 49 (lost by author ruling): paste its 14 candidate lines, save, and check the screen shows them.
5. On a real game walk Abierto → Convocatoria creada → confirmada → Jugado → reopen → cancel → undo; at each step the header and the offered actions match `requirements/examples/game-screen.md`.

## Closing note (2026-10-07, browser pane at 390×844, scratch copy of a fresh `npm run seed`, mouse events — not a real phone)

1. **Played game (18 jun):** no horizontal overflow (`scrollWidth` 390); arrival and points fold under the name; payment buttons readable. Team not shown because the game has no teams.
2. **Swap:** Pablo Silvage out, Adri in, as two drags; both rows show `cambiado a mano`, and the swap is still there after reload. Real touch (press-and-hold, scroll-not-drag) was **not** exercised.
3. **15th member:** "No quedan plazas" appears, nothing moves.
4. **Game 49:** not done on the live database (the author's data). On the scratch copy a new game dated 30 jul, 14 pasted lines, "Añadir a la lista" then "Guardar lista", gave 14 apuntados and 14 rows on screen.
5. **Lifecycle:** Convocatoria confirmada → Jugado → Reabrir → Cancelar → Deshacer cancelación → Crear de nuevo → Convocatoria creada; each header and next action matched.

Findings:

- **F-a (defect):** when the game on screen is only the implicit default (nothing picked in the selector), "Marcar como jugado" removes it from the pending set, so the default becomes none: the bar shows "Elige un partido…" and "Ningún partido pendiente" over the old table, with no state chip or next action.
- **F-b (copy):** the first state's chip reads "Apuntados"; the requirements name it "Abierto".

Both fixed the same day: `GameDay.tsx` pins the default game once found; `StateSteps.tsx` says "Abierto" (and the e2e that reads it). Tests added on the author's instruction: F-a by `the-game-screen.spec.ts` › "keeps the game on screen when it is only the default and gets played" (fails without the fix at "Registrar pagos", passes with it); F-b by the lifecycle spec's `toHaveText('Abierto')`. Lint, format, unit tests, build and all 31 e2e pass. Real touch and re-entering game 49 on the live database were left out by the author's decision to close.

## Definition of Done

- [x] Every step of the Manual Test Plan is done and its result written in the task's closing note.
- [x] **Graduation:** `throwaway` — realises no scenario of its own.
- [x] **Hard requirements:** none.
- [x] **Documentation:** none — the fixes change no documented behaviour.
- [x] **Tests:** the e2e above for the two findings.
- [x] **Regression:** the full e2e suite (31) and the unit suites pass.
- [x] **Code checks:** `npm run lint` and `npm run format:check` pass.

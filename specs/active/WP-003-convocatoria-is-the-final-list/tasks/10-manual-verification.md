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

## Definition of Done

- [ ] Every step of the Manual Test Plan is done and its result written in the task's closing note.
- [ ] **Graduation:** `throwaway` — realises no scenario of its own.
- [ ] **Hard requirements:** none.
- [ ] **Documentation:** none — this task changes nothing.
- [ ] **Tests:** none automated.
- [ ] **Regression:** not applicable; it changes nothing executable (task 11 runs the full regression).
- [ ] **Code checks:** not applicable; it changes no code.

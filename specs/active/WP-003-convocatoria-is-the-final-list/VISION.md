# Vision — WP-003-convocatoria-is-the-final-list

## 1. Problem Statement

The app makes the organiser paste a separate "final list" to record who played, although the confirmed convocatoria already says it. A game has no explicit lifecycle (it is only `scheduled`, `played` or `cancelled`), nothing says how payments are recorded once the paste is gone, and the game screen is an uncomfortable web view. The chronological order the organiser actually follows (create the game, build and keep editing the apuntados, create and confirm the convocatoria, adjust it if something changes, play) has no place for a late change, and "Simular" does not describe what the button does.

## 2. Key Stakeholder or User Needs

The organiser needs the game to follow the real order, and each fact to be entered once. The convocatoria is the final list: the generated one, or the one edited by hand, at any time as a correction. Who played is computed: signed up and in the convocatoria played, signed up and not in it did not. A player enters the convocatoria only if already in the apuntados. The Claros/Oscuros paste stays as a later phase that only records each player's team. The organiser needs to record payments as part of the same game, and to see at any moment which state the game is in and what comes next. The game view must be comfortable to use through that whole lifecycle.

## 3. Scope

Covers the game's complete state machine, from creation to its end state, and what each state allows. Covers apuntados, the convocatoria (create, confirm, edit by hand at any time as a correction), the derivation of played and of the exclusion point from it, the team-recording phase, and how payments are recorded. Covers the redesign of the game view around that lifecycle. Out of scope: team statistics, the points and mercy rules, and the way the convocatoria is generated.

## 4. Quality Ranges

For the same real-life outcome, standings and exclusion points equal what WP-001's final-list flow produced. The organiser enters no fact twice. Past games need no manual re-entry and no special-case branches in the design. The game view shows the current state and the next action without the organiser hunting for it, on a phone as well as on a desktop.

## 5. Constraints

Must not rewrite history: frozen convocatorias stay auditable. Money stays in integer cents, and `paid_on` is still when the money arrived. The legacy-bug-preserving default of the points rules is untouched. The result must not force effort on backfilled or imported data.

## 6. Assumptions and Dependencies

- WP-001 (season, roster, schedule, candidate paste, convocatoria, final-list paste) is built and is the base this reverses in part — `verified` (all 12 tasks done in its PROGRESS.md).
- A past game's played flag can be derived under the same rule, or stored once at import time, without a branch — `unverified`.
- The imported 2024/2025 history already holds who played per game and needs no re-entry — `unverified`.
- Today's game states are `scheduled`, `played` and `cancelled`, and the game view is one large `GameDay.tsx` — `verified` (`server/src/repo/game-repository.ts`; `web/src/pages/GameDay.tsx`, which the frontend coding standard already flags for a split).
- The candidate list's editable draft (`candidate_lines`) is the apuntados this work builds on — `verified` (table in the live schema).

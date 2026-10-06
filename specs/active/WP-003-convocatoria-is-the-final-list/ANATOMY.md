# Anatomy — WP-003-convocatoria-is-the-final-list

**Status:** approved

One iteration. Elements are the rows of `DESIGN_PLAN.md` §2.6/§2.7. The design has **0 deferrals**.

## Iteration 1 — The convocatoria is the final list

- **Elements:** R1, R2, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12
- **Deferred:** none
- **Order:** R1 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F12 (server), then R2 → F9 → F10 → F11 (web). The design fixes the sequence: R2 is cut before the first element that changes server behaviour (design §Screen confirmations), F12 is cut last of the server group, F10 ships after F9/F4 already deliver the swap through buttons. The tasks-creator will set the final task order.
- **Why the cut is here:** there is no cut. See the sizing test below.

## Partition check

| Check                         | Result                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| Element in **no** iteration   | none — all 14 rows of §2.6/§2.7 (R1, R2, F1–F12) are in iteration 1 |
| Element in **two** iterations | none                                                                |

## Sizing test (shown, not assumed)

**Estimated task count: 11–13**, against the 10–15 band. Bonds, not the 14 rows, decide the count:

- R1 + F3 share `ConvocatoriaService`/`ConvocatoriaRepository` — but R1 is a Refactor and F3 a Feature, so type bounds the bond: they stay two tasks (R1 first).
- F4 and F5 and F6 all work `ParticipationRepository`, but through additive, disjoint methods; F5 and F6 each realise their own use case (UC-003-05, UC-003-06), so they stay separate.
- F9 + F11 + F10 share `PlayersTable` and the game screen; F10 and F11 each add disjoint cells/components.
- The author asked that every manual step sit in one final task: phone check of F9 layout, phone drag for F10, installation permissions (`vitest` in `web`, `@dnd-kit/core`), and the by-hand re-entry of game 49 after the seed reset.
- One closing regression task.

So the count is about 11–13, at the low edge of the band, not past it.

**Cancellation test for the only candidate boundary — server (R1, F1–F8, F12) | web (R2, F9–F11):**

- _Would the web half still make sense if the server half were cancelled?_ No. F9–F11 consume `GameViewService`, `PUT …/convocatoria/members`, the payment and team routes; none exists without F2–F7.
- _Would the server half still make sense if the web half were cancelled?_ No. F12 retires the final-list routes and `useFinalListPaste`, the only way the current screen writes `played` and `paid_cents`; with the web unchanged, the game could not be marked as played from the UI. F12 also touches `web/src` (the chips and hook).
- Neither half ships value on its own schedule, and no decision in one reshapes the other's design (it is settled, 0 deferrals).

**Verdict: the split fails; one iteration.** No pre-drawn grouping of the design (its HLD component groups, "first group" ordering) was adopted as a boundary.

## Iterations

| #   | Name                               | Elements       | Deferred | Order |
| --- | ---------------------------------- | -------------- | -------- | ----- |
| 1   | The convocatoria is the final list | R1, R2, F1–F12 | —        | 1     |

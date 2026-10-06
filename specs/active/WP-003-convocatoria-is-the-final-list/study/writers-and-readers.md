# Who reads and writes what a game records (Q-01)

Searched: every use of `played`, `signed_up`, `team`, `paid_cents`, `paid_on` and the game `status` in `server/src`, `web/src`, `e2e/tests`.

## Writers

| Fact             | Written by                                                                                                                                                                           | Notes                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `signed_up`      | `CandidateResolutionService` (save of the draft, via `ParticipationRepository.clearSignups` then `set`), the `PUT /games/:id/players/:id` route, `FinalListResolutionService.record` | The final list also sets it, so a pasted final list signs people up.                                                           |
| `played`, `team` | `FinalListResolutionService.record` only, plus the `PUT` route (the "jugó" chip)                                                                                                     | `clearFinalOutcome` wipes both before a repaste.                                                                               |
| `paid_cents`     | `FinalListResolutionService` (sets `perHead × (1 + companions)` for everyone on the list), the `PUT` route (chip `debe → pagó`)                                                      | **Listing a player on the final list records them as having paid in full.** Debt only appears when someone is un-paid by hand. |
| `paid_on`        | `ParticipationRepository.set`: today's date when money first appears, or the supplied date                                                                                           | Imported rows carry the game date (AGENTS.md).                                                                                 |
| game `status`    | `FinalListResolutionService` sets `played` once no line is unresolved; the `PATCH /games/:id` route; `GameRepository.create`                                                         | Nothing ever sets `scheduled` back, and nothing sets `cancelled` from the UI.                                                  |
| exclusions       | `ConvocatoriaService.commit` (frozen outcome → rows), `FinalListResolutionService.reconcileExclusions` and `resolve` (retract/restore)                                               |                                                                                                                                |

## Readers

- `StandingsService.standings`: **points count `paid_cents > 0`** (paid games), `played` only feeds `gamesPlayed` and debt (`played = 1 AND paid_cents = 0`). Cancelled games are skipped.
- `GameRepository.unresolvedOnOrBefore` and `FinalListTargetResolver` use `status` to pick the game waiting for its final list.
- `ConvocatoriaService.preview` reads `signed_up` (never `played`).
- Web: `GameDay` (Jugadores chips, counters, `recordedAfterTheFact` = `status = played` and no convocatoria), `FinalListPaste`, `useFinalListPaste`, `api.ts`. `pickDefaultGame` reads `status`.

## Consequence

`played` is not read by points at all. Deriving it from the convocatoria changes debt and `gamesPlayed`, not points. Payment, not attendance, is what scores.

# Variant inventory: game situations and payment situations (Q-04, Q-05)

Searched: `game-repository.ts`, `participation-repository.ts`, `final-list-resolution-service.ts`, and the live `data/pachanguero.db` (read-only; seeded 2024/2025 only, 48 games, no live game).

This is the inventory requirements writes its scenarios against.

## Game situations

| Situation                                            | Where it exists                                                                | Notes                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `scheduled`, future                                  | code                                                                           | Default state. Accepts apuntados and a convocatoria.                                                                        |
| `scheduled`, past                                    | code                                                                           | Waiting for a final list (`unresolvedOnOrBefore`). Today's "pending" state.                                                 |
| `played`                                             | code + live DB (39 games)                                                      | Set only by a fully resolved final list.                                                                                    |
| `cancelled`                                          | live DB (9 games), `PATCH` route                                               | **No screen sets it.** Standings and debt skip it.                                                                          |
| Second game on one date (`label` "Bis", 12 Mar 2025) | live DB                                                                        | `findOrCreate` only matches unlabelled games.                                                                               |
| Game with no convocatoria                            | live DB: **all 48 imported games** (0 `convocatorias`) and any backfilled game | The first assumption the vision flagged is **false**: a convocatoria cannot be the source of `played` for imported history. |
| Game with a convocatoria and a pasted final list     | code                                                                           | The WP-001 flow.                                                                                                            |

Imported rows: every one has `signed_up = 1`; 531 are `played`, 62 signed up and not played, 54 exclusions exist, no `team`, 9 rows with `guests > 0`.

## Payment situations

| Situation                                                       | Live DB                                                                                           | Code                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Paid the standard share (€4 = 400 cents; `price_cents / slots`) | 509 rows                                                                                          | Set automatically when a player is listed on a final list |
| Paid a multiple (800, 1 600, 1 200)                             | 6 + 2 + 1                                                                                         | `+1` companions: `perHead × (1 + companions)`             |
| Odd amount (375)                                                | 1                                                                                                 | Manual                                                    |
| Played, not paid (debt)                                         | 12                                                                                                | Chip `jugó → debe`                                        |
| Signed up, did not play                                         | 62, no payment                                                                                    |                                                           |
| Paid late                                                       | `paid_on` is the **game date** for imported rows, so late payment is unknowable there (AGENTS.md) | `paid_on` = today when the chip is set                    |
| Partial payment                                                 | none                                                                                              | no representation beyond a different `paid_cents`         |

## Decisions (interview 2, author)

- **When:** payment is collected and recorded **after the game**. A player in the convocatoria owes until marked paid.
- **Plus-ones:** the unknown guest's share is recorded as a debt of the **host**; **anyone may pay it** (who actually paid is not tracked, only that the host's row is settled).
- **Partial:** none. A share is paid or not paid. An odd amount is an adjustment, not a partial payment.
- **History:** the 48 imported games get a **convocatoria generated from their played flags**, so one rule serves every game and the design carries no branch for past games.

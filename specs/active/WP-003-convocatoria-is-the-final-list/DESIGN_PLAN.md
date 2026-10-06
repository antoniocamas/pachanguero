# Design Plan — WP-003-convocatoria-is-the-final-list

**Depth: `deep`** (`author decision`). At stake: the stored shape of a game's state, its convocatoria and its debts, and a rewritten game screen. Budget: HLD ≈ 6–8 pages, then one Low Level Design subsection per element.

**Author rulings that shape this design** (2026-10-06, `author decision`):

- The project is early and the database almost empty. Recreating it is acceptable if it buys a better design, so `schema.sql` is edited in place, **there is no upgrade path, and no workaround exists to keep the current file.** The clean design wins.
- Debts are stored in a relational table, one row per share owed, tied to the host. A row is **removed once paid**, so the table stays small, and debt queries must not slow down as history grows.

**Artifact types:** Code (class — `server/src`, per `.agents/rules/coding-standard.md`), Frontend (component, hook, `lib/` function — `web/src`, per `.agents/rules/frontend-coding-standard.md`), Database (table, column), Tests (test module), System documentation (document, section).

**Status:** complete, awaiting the author's approval of the whole design. The HLD, and each group of Low Level Design subsections, were approved as they were written.

---

## 1. Current Implementation

Approach-scoped verification (the study did the discovery: `study/writers-and-readers.md`, `study/convocatoria-and-exclusions.md`, `study/game-screen.md`).

- **A game has three statuses and no lifecycle.** `games.status` is `scheduled | played | cancelled` under a `CHECK` (`server/src/db/schema.sql`, `verified — source`; same in the live file, `verified — invocation`). Live data: 39 `played`, 9 `cancelled`, 1 `scheduled`, 0 rows in `convocatorias` (`verified — invocation`).
- **The final list is the writer of what happened.** `FinalListResolutionService` (`server/src/repo/`) is the only bulk writer of `played`, `team`, `paid_cents`, `guests`, sets `status = 'played'`, and reconciles exclusions from the frozen outcome (`verified — source`).
- **Payment is one number per row.** `participations.paid_cents` + `paid_on` + `guests`; debt is _computed_ as `played = 1 AND paid_cents = 0` over every game of the season (`verified — source`: `standings-service.ts`). Rows with `guests` 1/2/3 hold `paid_cents` 800/1200/1600 at a 400-cent share, i.e. the total including plus-ones (9 rows, `verified — invocation`).
- **A convocatoria is written in one shot.** `ConvocatoriaService.commit` deletes and rewrites `convocatorias` / `convocatoria_entries` and the game's exclusion rows, SQL inline in the service (`verified — source`). No entry can be edited (`verified — document`: Q-02).
- **Standings** read `paid_cents > 0` as a paid game and `played` for `gamesPlayed` and debt, skip `cancelled` games in the paid and debt queries; `ExclusionRepository.historyFor` does not filter cancelled games (`verified — source`).
- **No migration system, and none will be added.** `db()` runs `schema.sql` (`CREATE TABLE IF NOT EXISTS`) on open (`verified — source`: `db/index.ts`, `AGENTS.md`); an edited table needs the file deleted or `npm run seed -- --reset`. That stays true.
- **Frontend:** `web/src/pages/GameDay.tsx` (437 lines) holds fetch, money maths and five sections; nine e2e specs touch it, two through the final-list paste (`verified — document`: Q-07).

Consumers of the symbols this design changes — `FinalListResolutionService`, `ConvocatoriaService.commit`, `participations.paid_cents`, `games.status` — are enumerated per element in the Low Level Design with LSP find-references before any change. At this altitude: the routes, `StandingsService`, `GameRepository.unresolvedOnOrBefore`, `FinalListTargetResolver`, `server/scripts/import-season.ts`, and the web (`useFinalListPaste`, `GameDay`, `pickDefaultGame`).

## 2. High Level Design

### 2.1 Architecture

**Physical inventory:**

| Unit                                                                                                                                                                              | Kind                    | Today         | This design                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------- | ---------------------------------------------------------------------------- |
| `schema.sql`                                                                                                                                                                      | schema                  | exists        | modify in place (§2.4)                                                       |
| `GameLifecycle`, `PlayedDerivation`, `DebtLedger`                                                                                                                                 | domain classes          | —             | create                                                                       |
| `types.ts`                                                                                                                                                                        | domain types            | exists        | modify (state, action types)                                                 |
| `ConvocatoriaBuilder`                                                                                                                                                             | domain                  | exists        | unchanged                                                                    |
| `FinalListParser`                                                                                                                                                                 | domain                  | exists        | reduced to teams                                                             |
| `GameLifecycleService`, `ConvocatoriaRepository`, `ConvocatoriaEditService`, `DebtRepository`, `PaymentRepository`, `PaymentService`, `TeamAssignmentService`, `TeamPasteService` | repo/service classes    | —             | create                                                                       |
| `ConvocatoriaService`, `GameRepository`, `ParticipationRepository`, `ExclusionRepository`, `StandingsService`                                                                     | repo/service            | exist         | modify                                                                       |
| `FinalListResolutionService`, `FinalListTargetResolver`                                                                                                                           | service                 | exist         | retire (replaced by `TeamPasteService`)                                      |
| `routes/api.ts`                                                                                                                                                                   | router                  | exists        | modify                                                                       |
| `ConvocatoriaHistoryConverter`, `scripts/import-season.ts`                                                                                                                        | converter, seed script  | script exists | create converter; the seed calls it after importing                          |
| `GameDay.tsx` and the components/hooks/`lib/` around it                                                                                                                           | page, components, hooks | exist         | split; new header, table, payment and team components, hooks, `lib/money.ts` |
| `docs/**`, `AGENTS.md`, `README.md`, WP-001 documents                                                                                                                             | documents               | exist         | modify (§2.8)                                                                |

**Components** (the `Component` vocabulary of §2.6–2.7):

| Component              | Units                                                                                                                | Responsibility                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Schema**             | `schema.sql`                                                                                                         | stored game state, the confirmation stamp, the debt table                                                                           |
| **Game lifecycle**     | `GameLifecycle`, `GameLifecycleService`, `GameRepository`                                                            | the five states, legal transitions, refusals, the next action                                                                       |
| **Convocatoria**       | `ConvocatoriaService`, `ConvocatoriaRepository`, `ConvocatoriaEditService`, `ConvocatoriaBuilder`                    | create, confirm, correct by hand; membership always a subset of the apuntados                                                       |
| **Played derivation**  | `PlayedDerivation`, `ParticipationRepository`, `ExclusionRepository`                                                 | `played` and exclusion points as a function of membership, applied on entering Jugado, retracted on leaving it                      |
| **Payments**           | `DebtLedger`, `DebtRepository`, `PaymentRepository`, `PaymentService`, `ParticipationRepository`, `StandingsService` | two decoupled facts: the debt (a share owed, and who answers for it) and the payment (who paid it, when, how); the attendance point |
| **Teams**              | `TeamAssignmentService`, `TeamPasteService`, `TeamListParser`, `LineResolver` (unchanged)                            | the teams as a resource, and the paste as one producer of them (a generator is a later sibling)                                     |
| **Game API**           | `routes/api.ts`, `GameViewService`                                                                                   | thin handlers over the services above; the one read model of a game                                                                 |
| **History conversion** | `ConvocatoriaHistoryConverter`, `import-season.ts`                                                                   | give seeded past games a stored convocatoria                                                                                        |
| **Game screen**        | `GameDay.tsx` (split), state header, players table, payment and team components, hooks, `lib/money.ts`               | the lifecycle as one screen                                                                                                         |

Diagram: [`design/diagrams/components.puml`](design/diagrams/components.puml).

### 2.2 Approach

**Orientation.** The game's state becomes a stored value with five values, moved by a small state machine in a new domain class, `GameLifecycle`; `GameLifecycleService` runs each transition in one transaction. Entering `Jugado` calls `PlayedDerivation`, which writes `played` and the exclusion points from convocatoria membership; leaving it retracts them. The convocatoria is created and edited as a stored record (`ConvocatoriaRepository`, extracted from `ConvocatoriaService`). Money is two decoupled facts: a `share_debts` table (one row per share still owed, deleted when settled) and an append-only `payments` table (who paid which share, when), written by `DebtLedger`, `DebtRepository`, `PaymentRepository`, `PaymentService`. The final-list paste is reduced to teams (`TeamPasteService`), and the game screen is rebuilt around the state. `schema.sql` is rewritten in place; the seed rebuilds the database.

**Why this shape.**

1. _State is stored, not derived._ With the database recreatable, `games.status` simply gets the five states of the requirements (`open`, `convocatoria_created`, `convocatoria_confirmed`, `played`, `cancelled`) and a nullable `cancelled_from` that holds the state to return to on undo (`CHECK`: set if and only if `cancelled`). `GameLifecycle` is then a transition table over a stored value, with nothing to reconstruct from side tables. Sacrificed: nothing; the only cost was the migration, which the ruling removes.
2. _Derived outcome exists if and only if the game is `played`._ One rule covers reopen (UC-003-05-S4), cancel from played (UC-003-01-S6) and undo (S7), and keeps `StandingsService` free of a state check: exclusion rows exist only for played games, so `historyFor` (which does not filter cancelled) stays correct unedited. Entering `played` recomputes, which is S5 of UC-003-05.
3. _The debt and the payment are two facts, and neither is tied to a plus-one_ (`author decision`). A **share** is what one person who plays owes for one game: the _beneficiary_ (the player the share is for, or an anonymous plus-one) and the _holder_ (the player who answers for it: themselves, or their host). Anna can hold the share of Maria, and the share can be settled **via Anna or via Maria**; so the debt records only _who owes it and who holds it_, and the payment records _who paid it_, never the other way round.
   - `share_debts(id, game_id, holder_player_id, beneficiary_player_id NULL, guest_ordinal NULL, amount_cents)`: one row per share still owed; a named player's share has `beneficiary_player_id`, an anonymous plus-one's has `guest_ordinal` (the 1st, 2nd… plus-one of that holder in that game, so it survives edits to the list); the row is **deleted when the share is settled**. Created when the game is first billed (first entry into `played`).
   - `payments(id, game_id, holder_player_id, beneficiary_player_id NULL, guest_ordinal NULL, payer_player_id, amount_cents, paid_on)`: append-only, one row per settled share; undoing a payment (UC-003-06-S5) deletes it and re-inserts the debt. **A future payment method is one nullable column here**, for every share, whoever pays.
   - The paid game that scores belongs to the **beneficiary**: settling a named player's share, by anyone, sets that player's `participations.paid_cents` / `paid_on`. Where the host pays Maria's share, Maria's paid game counts for her; a host's own share not yet paid keeps the host's point waiting (UC-003-06-S3b).
   - Billing is idempotent without a counter: a share is _billed_ if a `share_debts` or a `payments` row exists for its beneficiary or guest position in that game; replay after reopen bills only shares with neither.
4. _Query time does not grow with history_ (`author decision`, requirement). Every **debt** read touches only `share_debts`, whose size is the number of shares **outstanding**, not of all games played; indexes `(game_id)` ("who owes in this game", the screen's counters) and `(holder_player_id)` ("what does this player hold", standings). `payments` is never on that path: it is read for one game (index `(game_id)`) or one payer (index `(payer_player_id)`) and can grow without slowing the debt queries. Standings' paid-games count keeps reading `participations` by season through `idx_games_season`. The scan over every game of the season in today's debt query (`standings-service.ts`) disappears.
5. _Convocatoria creation persists._ "Convocatoria creada" must hold hand corrections (UC-003-04), so creating stores the record; confirming stamps `convocatorias.confirmed_at`. The algorithm's `outcome` per entry is kept, and `playing` is current membership; "changed by hand" is `playing` differing from the outcome, with no extra column. `convocatorias.source` (`generated` | `history`) lets the screen say an entry came from the conversion.

**Alternatives recorded** (the rejected ones are hard to reverse once data accumulates):

|               | A. Derive state from side facts, keep the three-value `status`                    | B. One table of every share, paid and unpaid                   | C. Chosen: stored five-value `status`; `share_debts` (owed) and `payments` (paid) apart |
| ------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Entails       | `confirmed_at` + `resume_status`; a class reconstructs the state                  | one row per share with a paid flag                             | `status` widened; debt deleted when settled; payment appended                           |
| Advantages    | additive on a live file                                                           | one model                                                      | state readable; debt table stays small; payer and method recorded for every payment     |
| Disadvantages | state reconstructed, two sources of truth; only motivated by keeping the old file | grows with every game; "who owes" filters an ever-larger table | two tables to keep in step (one transaction)                                            |
| Risks         | drift between the side facts and the status                                       | slow debt queries over time (the author's stated concern)      | a share half-moved between tables, prevented by the transaction and a test              |
| Scope         | contained                                                                         | every standings and debt query                                 | contained                                                                               |

### 2.3 Impacted Units (Component level)

The inventory in §2.1 is the component-grain list. The unit-grain table (file, method, action) fills in progressively as each element reaches its Low Level Design; it is not drafted here.

### 2.4 Interface Specification

HTTP surface (`routes/api.ts`; JSON; refusals are 400 with the requirement's Spanish message via the existing `route()` wrapper):

| Method and path                                                      | Replaces / is                                            | Body                                                                                                                            | Result                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /games/:id`                                                     | extended                                                 | —                                                                                                                               | `{ game, state, nextAction, participations[], convocatoria, debts[], payments[], arrivals[], points }`, built by a new `GameViewService`; the counters and the per-player totals (`holds`, `heldBy`) are computed in the web from this |
| `POST /games/:id/state`                                              | new (`PATCH` of `status` is refused)                     | `{ action: 'play' \| 'reopen' \| 'cancel' \| 'uncancel' }`                                                                      | `GameView`                                                                                                                                                                                                                             |
| `POST /games/:id/convocatoria`                                       | was `commit`                                             | `{ discardEdits?: boolean }`                                                                                                    | creates the convocatoria (state _created_); refuses with "Se perderán tus correcciones" if hand edits exist and `discardEdits` is not true                                                                                             |
| `POST /games/:id/convocatoria/confirm`                               | new                                                      | —                                                                                                                               | stamps `confirmed_at`                                                                                                                                                                                                                  |
| `PUT /games/:id/convocatoria/members`                                | new                                                      | `{ member: { playerId } \| { hostPlayerId, ordinal }, playing: boolean }`                                                       | moves one member (a player or an anonymous plus-one) across the line; "No quedan plazas" over the cap                                                                                                                                  |
| `POST /games/:id/payments`                                           | new                                                      | `{ shares: Array<{ beneficiary_player_id } \| { holder_player_id, guest_ordinal }>, payer_player_id, amount_cents?, paid_on? }` | settles the listed shares in one transaction, one `payments` row each (a host's 8 € button sends two shares; Marta's 4 € button sends one); refusals of UC-003-06-S6                                                                   |
| `DELETE /games/:id/payments/:paymentId`                              | new                                                      | —                                                                                                                               | undoes a payment (re-inserts the debt, clears the beneficiary's paid game if it was set by this payment)                                                                                                                               |
| `GET /games/:id/teams`, `PUT /games/:id/teams`                       | new: teams are a resource, whatever produced them        | `{ assignments: Array<{ playerId, team }> }`                                                                                    | reads / replaces the teams of the game's convocatoria members                                                                                                                                                                          |
| `POST /games/:id/teams/paste`, `POST /games/:id/teams/paste/resolve` | replace `/games/final:paste`, `/games/:id/final/resolve` | `{ text }`; `{ line, field, team, action }`                                                                                     | parse a pasted list into assignments (then `PUT`'s rule); team only                                                                                                                                                                    |
| `PUT /games/:id/players/:playerId`                                   | narrowed                                                 | `signed_up`, `note`                                                                                                             | `played`, `team`, `paid_cents` no longer accepted                                                                                                                                                                                      |

Domain interface (`types.ts` and `GameLifecycle`):

```ts
type GameState =
  | 'open'
  | 'convocatoria_created'
  | 'convocatoria_confirmed'
  | 'played'
  | 'cancelled';
type GameAction =
  'create' | 'confirm' | 'play' | 'reopen' | 'cancel' | 'uncancel'; // the route /state takes the last four
class GameLifecycle {
  nextAction(state: GameState, owes: boolean): string; // Spanish label
  next(
    state: GameState,
    action: GameAction,
    cancelledFrom: GameState | null
  ): GameState; // throws a Spanish refusal
}
```

Schema changes (`schema.sql`, in place; full DDL in the schema element's Low Level Design):

| Table               | Change                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `games`             | `status` `CHECK` over the five states, default `open`; `cancelled_from TEXT NULL`                                                                                                    |
| `convocatorias`     | `confirmed_at TEXT NULL`; `source TEXT NOT NULL DEFAULT 'generated'`                                                                                                                 |
| `participations`    | `paid_cents` / `paid_on` keep their names and mean _this player's own share_, settled by whoever paid it                                                                             |
| `share_debts` (new) | `(id, game_id, holder_player_id, beneficiary_player_id NULL, guest_ordinal NULL, amount_cents)`, one of the two beneficiary columns set; indexes on `game_id` and `holder_player_id` |
| `payments` (new)    | `(id, game_id, holder_player_id, beneficiary_player_id NULL, guest_ordinal NULL, payer_player_id, amount_cents, paid_on)`; indexes on `game_id` and `payer_player_id`                |

### 2.5 Unit Communication

Entering **played** is the transition that matters ([`design/diagrams/play-sequence.puml`](design/diagrams/play-sequence.puml)). The route calls `GameLifecycleService.transition`; it asks `GameLifecycle` whether the move is legal, runs `PlayedDerivation.apply`, bills the shares not yet billed through `DebtRepository` (a share is billed if it has a debt or a payment row), and writes the status, all in one `better-sqlite3` transaction. Reopen and cancel call `PlayedDerivation.retract` and keep debts and payments. `PaymentService` and `TeamPasteService` are separate entry points that ask `GameLifecycle` whether the state allows them (payment and teams only in `played`) and never touch `played`.

Points flow is unchanged: own-share payment → `paid_cents` → `StandingsService` → `ConvocatoriaBuilder`. Exclusions come from `PlayedDerivation`, not from `ConvocatoriaService`. Debt comes from `DebtRepository`, not from a scan of participations; a payment is `PaymentService` → `PaymentRepository` append + `DebtRepository` delete + the beneficiary's `paid_cents`, in one transaction.

### 2.6 Refactors and 2.7 New Functionality

**Refactors:**

| #   | Refactor                                                                                | Component    | Units                                           | Scenarios                  | Status   | Verification                                                   | Mandatory Reading                |
| --- | --------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------- | -------------------------- | -------- | -------------------------------------------------------------- | -------------------------------- |
| R1  | Extract the convocatoria's SQL from `ConvocatoriaService` into `ConvocatoriaRepository` | Convocatoria | `ConvocatoriaService`, `ConvocatoriaRepository` | UC-003-03-S1, UC-003-04-S1 | terminal | existing `convocatoria-service` and route tests pass unchanged | `coding-standard.md` §3 (DIP)    |
| R2  | Split `GameDay.tsx`: data hook, `lib/money.ts`, rendering                               | Game screen  | `GameDay.tsx`, `hooks/`, `lib/`                 | UC-003-10-S6               | terminal | the nine e2e specs pass; no capability lost                    | `frontend-coding-standard.md` §1 |

**New functionality:**

| #   | Feature                                                                                                                                                                                                                                            | Component          | Units                                                                                                                | Scenarios                                 | Status   | Verification                                                                                                                              | Mandatory Reading                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| F1  | The schema: five-value state, confirmation stamp, `share_debts`, `payments`; the seed script writes it                                                                                                                                             | Schema             | `schema.sql`, `import-season.ts`                                                                                     | UC-003-01 (state), UC-003-06 (debts)      | terminal | `npm run seed -- --reset` builds a database whose standings equal today's for the imported history                                        | §2.2, §2.4                                                            |
| F2  | The game lifecycle: states, next action, play, reopen, cancel, undo                                                                                                                                                                                | Game lifecycle     | `GameLifecycle`, `GameLifecycleService`, `GameRepository`                                                            | UC-003-01-S1…S7                           | terminal | a domain test per transition and per refusal; route test                                                                                  | `requirements/diagrams/game-states.puml`                              |
| F3  | Create and confirm the convocatoria; recreate with warning                                                                                                                                                                                         | Convocatoria       | `ConvocatoriaService`, `ConvocatoriaRepository`                                                                      | UC-003-03-S1…S4                           | terminal | service/route tests: 12/14/16 apuntados, confirm stamps                                                                                   | `docs/domain-model/convocatoria.md`                                   |
| F4  | Correct the convocatoria by hand; subset and cap rules                                                                                                                                                                                             | Convocatoria       | `ConvocatoriaEditService`, `ParticipationRepository`                                                                 | UC-003-04-S1…S7                           | terminal | tests in both states; hand marks from `playing` ≠ `outcome`                                                                               | F3                                                                    |
| F5  | Derive `played` and exclusion points; retract on leaving played                                                                                                                                                                                    | Played derivation  | `PlayedDerivation`, `ExclusionRepository`, `ParticipationRepository`                                                 | UC-003-05-S1…S5                           | terminal | a domain test per row of S1; comparison with WP-001's flow for the same outcome                                                           | `docs/domain-model/points.md`, `study/convocatoria-and-exclusions.md` |
| F6  | Shares as debts held by someone; payment by anyone, recorded apart; undo; the beneficiary's attendance point; debt in standings                                                                                                                    | Payments           | `DebtLedger`, `DebtRepository`, `PaymentRepository`, `PaymentService`, `StandingsService`, `ParticipationRepository` | UC-003-06-S1…S6, S3b–S3e                  | terminal | tests in integer cents; each share counted once in the outstanding total; a query-cost test (below)                                       | §2.2 decisions 3–4                                                    |
| F7  | The team paste records only `team`                                                                                                                                                                                                                 | Teams              | `TeamPasteService`, `FinalListParser`                                                                                | UC-003-07-S1…S5                           | terminal | route test: a paste changes only `team`; unresolved lines stay text                                                                       | `ciclo-del-partido.md` §1                                             |
| F8  | History conversion: a stored, confirmed convocatoria for every seeded played game                                                                                                                                                                  | History conversion | `ConvocatoriaHistoryConverter`, `import-season.ts`                                                                   | UC-003-09-S1…S6, S8                       | terminal | seed on a temp database: none above 14, history columns and standings identical before/after the conversion, a second run changes nothing | F1, F3                                                                |
| F9  | The game screen: state header, one players table whose columns follow the state, counters                                                                                                                                                          | Game screen        | state header, players table, hooks, `GameDay.tsx`                                                                    | UC-003-10-S1, S2, S4, S5, S6, S7          | terminal | e2e per state at 1280×800 and 390×844                                                                                                     | `requirements/examples/game-screen.md`                                |
| F10 | Swap by dragging a row across the line (mouse and touch), through a drag library (`author decision`: a library, for maintainability)                                                                                                               | Game screen        | drag component, client of `PUT …/convocatoria/members`                                                               | UC-003-10-S3, UC-003-04-S1                | terminal | e2e swap on desktop; manual on phone                                                                                                      | F4, F9                                                                |
| F11 | Played-state actions in the table: payment button per row (the holder's button pays all they hold; a beneficiary's button pays that share and drops the holder's amount; a "Deuda de <holder>" tag on the beneficiary's row), teams paste, resolve | Game screen        | payment cell, teams paste components, `useTeamsPaste`                                                                | UC-003-06-S1…S6, S3b–S3e, UC-003-07-S1…S5 | terminal | e2e: host pays all, guest pays own, tag shown, total counted once, undo, paste teams; no team asked to pay                                | F6, F7, F9                                                            |
| F12 | Retire the final-list writers, routes and chips that wrote `played`/`paid_cents`                                                                                                                                                                   | Game API           | `FinalListResolutionService`, `FinalListTargetResolver`, old routes, `useFinalListPaste`                             | UC-003-05, UC-003-07                      | terminal | no remaining reference (find-references); the two final-list e2e specs rewritten                                                          | F5, F7                                                                |

Every scenario of `REQUIREMENTS.md` has an element: UC-003-01 → F2; -03 → F3; -04 → F4 (F10 gesture); -05 → F5; -06 → F6 (F11 UI); -07 → F7 (F11); -09 → F1, F8; -10 → F9, F10, F11 (R2 for S6). UC-003-09-S7 (keeping game 49 on the live file) was retired by the author on 2026-10-06.

### 2.8 Documentation Impact

From `study/doc-map.md` (`verified — document`): `AGENTS.md` (Domain invariants: the final list is no longer the sole writer of `played`/`team`/`paid_cents`/`guests`; the five-state game; the Architecture block naming `FinalListParser` / `FinalListResolutionService`; "no migration system" stays), `docs/domain-model/ciclo-del-partido.md` (order and states of the match), `convocatoria.md` (who played), `points.md` (a game counts by payment, not by a resolved list), `glossary.md` (Claros y Oscuros), `docs/domain-model/README.md`, `README.md` ("Lista final" bullet), `docs/test-strategy.md` (only if e2e specs change shape), WP-001 `REQUIREMENTS.md` / `DESIGN_PLAN.md` (N2, N3, UC-001-05/06/07, retracted or revised by identifier). Per-document detail is section 4.

### 2.9 Risks

| Risk                                                                                                           | How it is handled                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recreating the database loses what is in it today (game 49 and its 14 candidate lines)                         | Accepted by the author. The seed rebuilds the 2024/2025 history from `data/seed/*.csv`; game 49 is re-entered by hand.                                                                                                                                                                                                                                                                                                 |
| `paid_cents` changes meaning (the player's own share only; today it is the host's total with plus-ones)        | No migrated data: `import-season.ts` writes the new meaning directly (own share in `paid_cents`; each plus-one a `payments` row, or a `share_debts` row where the CSV shows it unpaid). Verified by comparing standings with today's for the imported history.                                                                                                                                                         |
| Debt rows go out of step with the apuntados when they change after the first billing                           | A share is billed if it has a debt or a payment row; replay bills only the shares with neither; a removed plus-one's unpaid row is deleted. Detail in F6's Low Level Design, not deferred.                                                                                                                                                                                                                             |
| The `payments` table grows                                                                                     | It is append-only and off the debt path (indexes on `game_id`, `payer_player_id`); the author's growth requirement applies to debt queries, which read `share_debts` only.                                                                                                                                                                                                                                             |
| Standings or exclusion history disagree for a cancelled-from-played game                                       | Decision 2: derived outcome is retracted on cancel and re-applied on undo.                                                                                                                                                                                                                                                                                                                                             |
| Points drift between "created" and "confirmed" (late payments)                                                 | Confirm stamps, never recomputes; recreating recomputes by design.                                                                                                                                                                                                                                                                                                                                                     |
| Reopening a seeded game re-derives from a synthetic convocatoria that may disagree with history (UC-003-09-S4) | Accepted by the author; entries are marked `source = 'history'`.                                                                                                                                                                                                                                                                                                                                                       |
| Drag on a phone: native HTML5 drag-and-drop does not fire on touch                                             | The author chose a drag library. Which one is picked in F10's Low Level Design (candidate: `@dnd-kit`, `inferred` — touch support and React 18 compatibility to be verified against its installed version, not from memory). **Installing it needs the author's explicit permission at implementation time** (`CLAUDE.md`); until then F9 and F4 ship the swap through a non-drag control, so no scenario waits on it. |
| The outstanding total counts a held share twice (on the holder's row and on the beneficiary's)                 | The total is computed from `share_debts` rows (one per share), never summed from the rows' buttons; UC-003-06-S3e is a test.                                                                                                                                                                                                                                                                                           |
| Standings equivalence with WP-001 regresses                                                                    | Comparison test (UC-003-05-S3) and the before/after standings comparison in F1 and F8.                                                                                                                                                                                                                                                                                                                                 |

### 2.10 Test Methodology

Per `docs/test-strategy.md` and `AGENTS.md` (`verified — document`: domain unit tests, route integration tests on a real SQLite, E2E against the real server and an isolated SQLite file): `GameLifecycle`, `PlayedDerivation`, `DebtLedger` are domain unit tests; services and routes are route/integration tests; the screen and the walk open → played → reopen → cancel → undo are E2E at both viewports. Seed and conversion are verified on a temporary database. Money is asserted in integer cents. **Query cost (author requirement):** F6 includes a test that seeds N games with all shares paid and asserts that the debt read touches only `share_debts` (row count and `EXPLAIN QUERY PLAN` using the two indexes, not a table scan), so the guarantee is checked, not claimed.

**Testability Assessment**

| #   | Element                       | Fully automatable?            | Manual verification needed                                                                                       |
| --- | ----------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R1  | Extract convocatoria SQL      | Yes                           | —                                                                                                                |
| R2  | Split `GameDay.tsx`           | Yes                           | —                                                                                                                |
| F1  | Schema                        | Yes                           | —                                                                                                                |
| F2  | Game lifecycle                | Yes                           | —                                                                                                                |
| F3  | Create and confirm            | Yes                           | —                                                                                                                |
| F4  | Correct by hand               | Yes                           | —                                                                                                                |
| F5  | Derive played / exclusions    | Yes                           | —                                                                                                                |
| F6  | Debts and payment             | Yes                           | —                                                                                                                |
| F7  | Team paste                    | Yes                           | —                                                                                                                |
| F8  | History conversion            | Yes                           | —                                                                                                                |
| F9  | Game screen                   | Mostly                        | the layout reads comfortably on a real phone (guidelines in its Low Level Design)                                |
| F10 | Drag swap                     | Desktop yes; touch no         | drag a row across the line with a thumb on a phone; the table stays on screen and the swap persists after reload |
| F11 | Played-state actions          | Yes                           | —                                                                                                                |
| F12 | Retire the final-list writers | Yes (find-references + tests) | —                                                                                                                |

### 2.11 Patterns and Conventions

Backend: classes only, no free functions or stateless statics; SOLID per `coding-standard.md`. **Transition table:** `GameLifecycle.next` reads a table of `(state, action) → state`, not a branch per state, so a new state is a row (Open/Closed). **Repository** for every SQL access (`ConvocatoriaRepository`, `DebtRepository` new; services stop holding SQL, DIP). **Service per use case** (`GameLifecycleService`, `PaymentService`, `TeamPasteService`), wired in `repo/index.ts`. Domain classes know nothing of SQLite. Frontend: one responsibility per component/hook/`lib` function; data through hooks on `api.ts`; composition over `mode` props. Database: `snake_case`, money in integer cents, tables that hold only live obligations (`share_debts`) rather than history. Spanish user-facing strings. Comment density and naming follow the surrounding files.

### Completeness detectors (recorded)

|                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 Grounding              | Claims in §1 are tagged and cited. Behaviour not yet built is `not yet run`. One `assumed` carried: that `StandingsService.standings(season, gameId)` can be evaluated "as of that game" for the converter (`verified — source` that it takes `upToGameId` and filters by date and id; not yet run) → F8 verifies.                                                                                                                                                                                                                                                                                                                |
| D2 Assumption register    | Study question carried: Q-09 blind spot. Checked per element: F10 (drag on touch → library, chosen; version check in its Low Level Design); F4 (a sign-up after creation has no entry → resolved in its Low Level Design); F6 (the identity of an anonymous plus-one's share by (holder, ordinal), replay billing → resolved in its Low Level Design); F8 (`Falta la antigüedad` thrown by `byPoints` for a player with no `season_players` row → resolved in its Low Level Design).                                                                                                                                              |
| D3 Breakdown reachability | Every element names concrete units; No element is a hole.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D4 Pre-mortem             | F1: a stale local file after a schema edit → `AGENTS.md` already says delete it or seed with `--reset`. F2: cancelled from played, then undone after payments → payments kept, derived outcome re-applied. F5: cancelled game leaving exclusion rows → retract on cancel. F6: pay, undo, reopen, replay billing a share twice → billed-ness is read from the debt and payment rows; the Low Level Design traces it as a worked example. Anna pays Maria's share, then Maria's payment is undone → Maria's `paid_cents` cleared, debt re-held by Anna. F8: the converter run twice → skips games that already have a convocatoria. |

**Deferral count: 0.**

## 3. Low Level Design

#### F1 — The schema

**Current Implementation.** `schema.sql` defines `games.status` as `scheduled|played|cancelled` and has no `cancelled_from`; `convocatorias` has no stamp and no source; there is no debt or payment table (`verified — source`, `server/src/db/schema.sql`). `TestDatabase.create()` builds every test database from that same file (`server/src/db/test-support.ts`, `verified — source`), so the schema edit reaches all tests at once. `db()` runs the file on open with `CREATE TABLE IF NOT EXISTS`, which never alters an existing table (`verified — source`, `db/index.ts`). The e2e run deletes its database file before booting (`rm -f ${testDb}`, `e2e/playwright.config.ts:28`, `verified — source`).

Readers and writers of `games.status` (`grep` over `server/src`, `server/scripts`, `web/src`, `e2e`; `verified — invocation`): `GameRepository` (type, `create` default `'scheduled'`, `unresolvedOnOrBefore`: `status NOT IN ('played','cancelled')`), `StandingsService` (two queries: `g.status != 'cancelled'`), `FinalListResolutionService` (writes `'played'`), `import-season.ts` (`'played'`/`'cancelled'`), `web/src/api.ts:27` (type), `web/src/lib/defaultGame.ts:14` (`status === 'scheduled'`). Tests naming `'scheduled'`: `game-repository.test.ts:22`, `final-list-resolution-service.test.ts:266,302`. No other consumer.

Finding from this verification: `AGENTS.md` says an edit to an existing table needs the local DB file deleted "or `npm run seed -- --reset`", but `--reset` only runs `DELETE FROM seasons WHERE id = ?` for the imported season (`import-season.ts`, `verified — source`); it cannot apply a changed table definition. Only deleting the file does. The Documentation Impact entry for `AGENTS.md` carries the correction.

**Approach.** Edit `schema.sql` in place with this DDL (`not yet run`):

```sql
CREATE TABLE IF NOT EXISTS games (
  ...
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','convocatoria_created',
                                     'convocatoria_confirmed','played','cancelled')),
  -- the state a cancelled game returns to when the cancellation is undone
  cancelled_from TEXT CHECK (cancelled_from IN ('open','convocatoria_created',
                                                'convocatoria_confirmed','played')),
  CHECK ((status = 'cancelled') = (cancelled_from IS NOT NULL)),
  ...
);

-- convocatoria_entries is rebuilt so that an anonymous plus-one, who takes a slot, is an entry too:
--   id INTEGER PRIMARY KEY, convocatoria_id (FK, cascade), player_id NULL, guest_host_player_id NULL,
--   guest_ordinal NULL, position, points, wait_counter, outcome, playing,
--   CHECK ((player_id IS NULL) != (guest_ordinal IS NULL)),
--   CHECK ((guest_ordinal IS NULL) = (guest_host_player_id IS NULL)),
--   unique partial indexes on (convocatoria_id, player_id) and (convocatoria_id, guest_host_player_id, guest_ordinal)
-- convocatorias gains:
  confirmed_at TEXT,                                   -- NULL until confirmed
  source       TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','history')),

-- A share still owed: one row per share, deleted when it is settled.
CREATE TABLE IF NOT EXISTS share_debts (
  id                    INTEGER PRIMARY KEY,
  game_id               INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  holder_player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  beneficiary_player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  guest_ordinal         INTEGER CHECK (guest_ordinal > 0),  -- an anonymous plus-one: the nth of this holder's
  amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
  CHECK ((beneficiary_player_id IS NULL) != (guest_ordinal IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_share_debts_game   ON share_debts(game_id);
CREATE INDEX IF NOT EXISTS idx_share_debts_holder ON share_debts(holder_player_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_share_debts_player
  ON share_debts(game_id, beneficiary_player_id) WHERE beneficiary_player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_share_debts_guest
  ON share_debts(game_id, holder_player_id, guest_ordinal) WHERE guest_ordinal IS NOT NULL;

-- A share settled: append-only record of who paid it; method is a later nullable column.
CREATE TABLE IF NOT EXISTS payments (
  id                    INTEGER PRIMARY KEY,
  game_id               INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  holder_player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  beneficiary_player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  guest_ordinal         INTEGER CHECK (guest_ordinal > 0),
  payer_player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_on               TEXT    NOT NULL,
  CHECK ((beneficiary_player_id IS NULL) != (guest_ordinal IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_payments_game  ON payments(game_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_player_id);
-- plus the same two partial unique indexes as share_debts, named uq_payments_player / uq_payments_guest
```

Two unique partial indexes per table make "one share exists once" a database fact; a share is in `share_debts` or in `payments`, never both, and that exclusion is F6's transaction (a single `CHECK` cannot span two tables). `guest_ordinal` has no foreign key and is not a line number: `guest_candidates` rows are deleted and rewritten (renumbered) whenever the candidate list is saved, so a line position would go stale; "the nth plus-one of this holder" survives the rewrite. `participations.guests` stays untouched in this element: its last writer is `FinalListResolutionService`, so the column is dropped in F12 together with that writer.

Imported rows: the seed marks every imported game `'played'` or `'cancelled'`; a cancelled one carries `cancelled_from = 'open'` (the nine cancelled imported games have no participation row signed up or played and no convocatoria, `verified — document`: UC-003-09 claims). Payments and debt rows for imported shares are written by F6 (it owns the repositories), not here.

**Impacted Units.**

| Unit                                                                                                                      | Location                                                           | Action          |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------- |
| `games`, `convocatorias`, new `share_debts`, `payments`                                                                   | `server/src/db/schema.sql`                                         | Modify / Create |
| `GameRow.status` type, `create` default and `status`/`cancelled_from` parameters, `UPDATABLE_COLUMNS` (+`cancelled_from`) | `server/src/repo/game-repository.ts`                               | Modify          |
| `Game.status` type                                                                                                        | `web/src/api.ts:27`                                                | Modify          |
| `pickDefaultGame` (`waiting` = every game not `played` and not `cancelled`)                                               | `web/src/lib/defaultGame.ts`                                       | Modify          |
| game status strings and `cancelled_from`                                                                                  | `server/scripts/import-season.ts`                                  | Modify          |
| `'scheduled'` → `'open'` in expectations                                                                                  | `game-repository.test.ts`, `final-list-resolution-service.test.ts` | Modify          |
| new schema test                                                                                                           | `server/src/db/schema.test.ts`                                     | Create          |

`unresolvedOnOrBefore` and `StandingsService` need no change: their predicates stay valid under the new values (`NOT IN ('played','cancelled')` and `!= 'cancelled'`). `unresolvedOnOrBefore` is retired with its only consumer in F12.

**Test Methodology.** Per HLD §2.10. `schema.test.ts` (domain-level, real in-memory SQLite) asserts each constraint by trying to violate it: an unknown status; `cancelled` without `cancelled_from`; `cancelled_from` on a non-cancelled game; a debt row with both or neither beneficiary column; a duplicate share; a non-positive amount; and, with `EXPLAIN QUERY PLAN`, that `WHERE game_id = ?` and `WHERE holder_player_id = ?` on `share_debts` use `idx_share_debts_game` / `idx_share_debts_holder` (the author's query-cost requirement, first half; F6 asserts the debt read). Before editing, record a baseline: run the seed into a temporary database (`PACHANGUERO_DB=<tmp> npm run seed`) and save `standings(season)` as JSON; after, the same run must produce an identical file. Fully automatable; no manual plan.

**Data Contract Verification.** Stored: the three tables above. `games.status` / `cancelled_from`: loader `GameRepository.get/list` (`SELECT *`, no column list, so the new column appears in `GameRow` only once the type adds it), parser none, consumers the routes (JSON passthrough), `web/src/api.ts` `Game`, `pickDefaultGame`. Every value storable by the `CHECK` is handled by `StandingsService` (only `'cancelled'` matters) and by `pickDefaultGame` after its edit. `share_debts` / `payments`: no loader or consumer exists until F6; this element guarantees only that what they will store satisfies the constraints. Create, read, update and delete of `games.status` is F2's. Mismatch found: `AGENTS.md` on `--reset` (above), resolved by the doc correction.

**Patterns and Conventions.** Additive `CREATE TABLE IF NOT EXISTS` style of the existing file; constraints in the database, as the file already does (`CHECK (status IN …)`, `CHECK (kind IN …)`); `snake_case`; money in integer cents; comment on every non-obvious column, matching the file's density. A table holds live obligations only (`share_debts`), history in the append-only one (`payments`).

**File Changes.** Modify: `schema.sql`, `game-repository.ts`, `web/src/api.ts`, `web/src/lib/defaultGame.ts`, `import-season.ts`, two tests. Create: `server/src/db/schema.test.ts`. Delete: none. Migrate: none by design; the local file `data/pachanguero.db` (+ `-wal`, `-shm`) is deleted and the seed rerun (`npm run seed`) as the last step of the task. Tests: as above.

#### R1 — Extract the convocatoria's SQL into `ConvocatoriaRepository`

**Current Implementation.** `ConvocatoriaService.commit` issues SQL inline: `DELETE FROM convocatorias`, `INSERT INTO convocatorias`, a prepared `INSERT INTO convocatoria_entries`, and `DELETE FROM exclusions WHERE game_id = ?`; `saved()` issues two `SELECT`s and parses `rules_json` (`convocatoria-service.ts`, `verified — source`). It receives the raw connection for that and for `conn.transaction`. Consumers (grep, `verified — invocation`): `routes/api.ts:320` (`saved`), `:372` (`commit`), `preview` route; `repo/index.ts:79` (construction); tests `convocatoria-service.test.ts:44` and `candidate-list-requirements.test.ts:87` (construction). `ExclusionRepository.frozenOutcomes` also reads `convocatoria_entries` (`exclusion-repository.ts:31`); its only consumer is `FinalListResolutionService` (`:169`, `:254`), retired in F12, so it stays and is moved by F5, with one edit here: its `SELECT` gains `AND ce.player_id IS NOT NULL`, because anonymous plus-ones are now entries with no player (amendment found while drafting F3; without it the map would be keyed by `null`).

**Approach.** A refactor: no behaviour changes, the JSON returned by `saved()` keeps its exact keys. `ConvocatoriaRepository` (new, `server/src/repo/`) takes the connection and owns the two tables:

```ts
export type MemberKey =
  { playerId: number } | { hostPlayerId: number; ordinal: number };
export interface NewEntry {
  key: MemberKey;
  position: number;
  points: number;
  waitCounter: number;
  outcome: Outcome;
  playing: boolean;
}
export interface StoredEntry {
  id: number;
  convocatoria_id: number;
  player_id: number | null;
  guest_host_player_id: number | null;
  guest_ordinal: number | null;
  name: string;
  position: number;
  points: number;
  wait_counter: number;
  outcome: Outcome;
  playing: number;
}
export interface StoredConvocatoria {
  id: number;
  game_id: number;
  rules_json: string;
  created_at: string;
  entries: StoredEntry[];
}
class ConvocatoriaRepository {
  find(gameId: number): StoredConvocatoria | null;
  replace(
    gameId: number,
    rulesJson: string,
    entries: NewEntry[],
    source?: 'generated' | 'history'
  ): void; // delete old, insert head + entries
}
```

`ExclusionRepository` gains `clear(gameId)` replacing the inline `DELETE FROM exclusions`. `ConvocatoriaService` takes the new repository as a constructor argument; it keeps `conn` only to open the transaction around `replace` + the exclusion writes (the codebase has no transaction abstraction and `db/index.ts` `tx()` is a singleton-bound free function; adding one is out of scope). `saved(gameId)` becomes `find` + `JSON.parse`, returning `{...head, rules, entries}` as today. `F3` rewrites `commit` on top of this seam.

**Impacted Units.** `ConvocatoriaRepository` (create, `repo/convocatoria-repository.ts`); `ConvocatoriaService` constructor, `commit`, `saved` (modify); `ExclusionRepository.clear` (create method); `repo/index.ts` wiring (modify); the two tests' construction sites (modify); new `convocatoria-repository.test.ts`.

**Test Methodology.** HLD §2.10, route/integration layer. Verification of the refactor is the unchanged `convocatoria-service.test.ts` and `candidate-list-requirements.test.ts` passing with only their construction line edited. New `convocatoria-repository.test.ts`: `find` on a game with none returns `null`; `replace` then `find` round-trips head and entries ordered by `position` with `name` joined; `replace` twice leaves one head and no orphan entries; deleting the game cascades. Fully automatable.

**Data Contract Verification.** Stored: `convocatorias(id, game_id UNIQUE, rules_json, created_at)` and `convocatoria_entries` (F1's rebuilt shape: `player_id` or `guest_host_player_id` + `guest_ordinal`, then `position, points, wait_counter, outcome, playing`); `replace` takes the `source` and leaves `confirmed_at` NULL. Loader `ConvocatoriaRepository.find`; parser `JSON.parse(rules_json)` in `ConvocatoriaService.saved`; consumers: the `GET /games/:id` route returning it as JSON and `web/src/api.ts` `GameDetail.convocatoria` (`:78`). The new `StoredEntry` mirrors the `SELECT ce.*, p.name` row, so the keys the web already reads are unchanged. `playing` stays 0/1. No new stored shape.

**Patterns and Conventions.** Repository per aggregate, concrete class over the connection like its siblings (`ExclusionRepository`, `GameRepository`); services stop holding SQL (DIP, `coding-standard.md` §3); no free functions or stateless statics.

**File Changes.** Create: `server/src/repo/convocatoria-repository.ts`, `convocatoria-repository.test.ts`. Modify: `convocatoria-service.ts`, `exclusion-repository.ts`, `repo/index.ts`, `convocatoria-service.test.ts`, `candidate-list-requirements.test.ts`. Delete / Migrate: none.

#### F2 — The game lifecycle

**Current Implementation.** There is no lifecycle object: `status` is written by `GameRepository.create`, by `FinalListResolutionService` (`'played'`, `:118`, `:174`) and by the `PATCH /games/:id` route, which passes the whole request body to `GameRepository.update`, status included (`routes/api.ts`, `verified — source`). Nothing guards a write by state: `CandidateResolutionService.save`, `PUT`/`DELETE /games/:id/players/:playerId` all write whatever the game's status (`verified — source`). `DeleteGame` and `RecordPastGame` in the web use `POST /games` and `DELETE /games/:id` and are unaffected (`verified — document`: Q-07). The requirement's table of states, actions and messages is `REQUIREMENTS.md` UC-003-01 and `requirements/diagrams/game-states.puml`.

**Approach.** Three parts.

1. `GameLifecycle` (domain, no SQL): a transition table plus a capability table, both private constants of the class.

| action     | from → to                                                                  | refusal otherwise                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`   | open, created, confirmed → created                                         | played: "Reabre el partido para editarlo"; cancelled: "El partido está cancelado"                                                                             |
| `confirm`  | created → confirmed                                                        | open: "Crea la convocatoria antes de confirmarla"; played/cancelled as above                                                                                  |
| `play`     | confirmed → played                                                         | open, created: "Confirma la convocatoria antes de marcar el partido como jugado"; played: "El partido ya está jugado"; cancelled: "El partido está cancelado" |
| `reopen`   | played → confirmed                                                         | any other: "El partido no está jugado"                                                                                                                        |
| `cancel`   | open, created, confirmed, played → cancelled (remembers the state it left) | cancelled: "El partido ya está cancelado"                                                                                                                     |
| `uncancel` | cancelled → the remembered state                                           | any other: "El partido no está cancelado"                                                                                                                     |

| capability          | allowed in               | refusal otherwise                                                                                                           |
| ------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `edit_apuntados`    | open, created, confirmed | played: "Reabre el partido para editarlo"; cancelled: "El partido está cancelado"                                           |
| `edit_convocatoria` | created, confirmed       | open: "Crea la convocatoria antes de editarla"; played / cancelled as above                                                 |
| `pay`               | played                   | open, created, confirmed: "Marca el partido como jugado antes de registrar pagos"; cancelled: "El partido está cancelado"   |
| `teams`             | played                   | open, created, confirmed: "Marca el partido como jugado antes de pegar los equipos"; cancelled: "El partido está cancelado" |

`nextAction(state, owes)`: open → "Crear convocatoria"; created → "Confirmar convocatoria"; confirmed → "Marcar como jugado"; played → "Registrar pagos" when `owes`, else none; cancelled → "Deshacer cancelación" (UC-003-01-S1). The messages of `play` from open or created, of `edit_convocatoria` when played, and of `pay` from confirmed are the requirements' (S3, S4, UC-003-06-S6); the others are `inferred` from them for the same situation and flagged in _Owed_.

2. `GameLifecycleService` (repo): `perform(gameId, action, work?)` reads the game, asks `GameLifecycle.next`, runs `work(game)` inside one `better-sqlite3` transaction together with the state write (`GameRepository.setState`), and returns the new state. Entering or leaving `played` also runs the registered `PlayedEffect`s: `PlayedEffect { apply(game): void; retract(game): void }` (an interface; F5 registers `PlayedDerivation`, F6 registers billing; none exist yet, so the list starts empty and `repo/index.ts` is the only place that changes when they arrive). Entering = `next === 'played' && state !== 'played'` (play, or uncancel back to played) → `apply` for each; leaving = the reverse (reopen, cancel from played) → `retract`. A thrown effect rolls the whole transition back. `require(gameId, capability)` throws the capability's refusal. `describe(gameId)` returns `{ state, nextAction }` using `DebtRepository.anyOutstanding(gameId)` for `owes`.

3. Wiring: `GameRepository` gains `setState(id, status, cancelledFrom)` and `update` stops accepting those columns (its patch type narrows to `played_on | label | notes`; the one remaining caller that writes `status`, `FinalListResolutionService`, calls `setState` until F12 retires it). `DebtRepository` is created here with the single method `anyOutstanding` (one `SELECT 1 FROM share_debts WHERE game_id = ? LIMIT 1`); F6 adds the rest. `CandidateResolutionService.save` calls `require(gameId, 'edit_apuntados')` first; so do the `PUT`/`DELETE …/players/:playerId` routes. Routes: `POST /games/:id/state {action}` runs `perform` for `play | reopen | cancel | uncancel` (`create` and `confirm` are called by F3 and refused here: 400 "Acción no válida"); `GET /games/:id` adds `state` and `nextAction`; `PATCH /games/:id` ignores `status` and `cancelled_from` (only `played_on`, `label`, `notes` pass).

Worked example, by hand (`not yet run`): a game in `convocatoria_confirmed`, `cancel` → `cancelled`, `cancelled_from = 'convocatoria_confirmed'`; `uncancel` → `convocatoria_confirmed`, `cancelled_from = NULL`. A game in `played`, `cancel` → `PlayedEffect.retract` runs, state `cancelled`, `cancelled_from = 'played'`; `uncancel` → `apply` runs, state `played`.

**Impacted Units.**

| Unit                                                                                                     | Location                                           | Action             |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| `GameLifecycle`, `GameState`, `GameAction`, `Capability`                                                 | `server/src/domain/game-lifecycle.ts`, `types.ts`  | Create / Modify    |
| `GameLifecycleService`, `PlayedEffect`                                                                   | `server/src/repo/game-lifecycle-service.ts`        | Create             |
| `DebtRepository.anyOutstanding`                                                                          | `server/src/repo/debt-repository.ts`               | Create             |
| `GameRepository.setState`, `update` patch type                                                           | `server/src/repo/game-repository.ts`               | Modify             |
| `FinalListResolutionService` (two `games.update` calls → `setState`)                                     | `server/src/repo/final-list-resolution-service.ts` | Modify (until F12) |
| `CandidateResolutionService.save` (guard)                                                                | `server/src/repo/candidate-resolution-service.ts`  | Modify             |
| routes `POST /games/:id/state`, `GET /games/:id`, `PATCH /games/:id`, `PUT`/`DELETE …/players/:playerId` | `server/src/routes/api.ts`                         | Modify             |
| wiring                                                                                                   | `server/src/repo/index.ts`                         | Modify             |

**Test Methodology.** HLD §2.10. Domain (`game-lifecycle.test.ts`): one test per row of both tables, the outline of S6 and S7 over the four states, `nextAction` including played with and without `owes`. Service (`game-lifecycle-service.test.ts`, real SQLite, a recording `PlayedEffect` test class): play refused from open leaves the state; reopen returns to confirmed; cancel from each of the four states stores `cancelled_from`; uncancel restores; effects fire on play and on uncancel-to-played, retract on reopen and on cancel-from-played, never on other moves; a throwing effect leaves state and `cancelled_from` unchanged. Route (`api.test.ts`): `POST …/state`; `PATCH` ignoring `status`; the guard refusing a candidate save and a participation `PUT` in `played` and `cancelled`. Fully automatable. Manual: none.

**Data Contract Verification.** Stored: `games.status` and `cancelled_from` (F1). Loader `GameRepository.get` returns both as strings typed by `GameRow` (`status: GameState`, `cancelled_from: Exclude<GameState,'cancelled'> | null`); the database `CHECK` and the TypeScript union list the same five and four values, and a test asserts that every `GameState` is accepted by the table. Consumers: the routes (passthrough), `web/src/api.ts` (F1 type), `StandingsService` (`!= 'cancelled'`). Writers after this element: `GameLifecycleService` and, until F12, `FinalListResolutionService`; `GameRepository.create` for the initial `'open'`. Update and delete of a game's state go only through `perform`.

**Patterns and Conventions.** State pattern as a transition table (Open/Closed: a new state or action is a row); ports and adapters for effects (`PlayedEffect` interface, implemented by F5 and F6); the guard is a method on the service the way the codebase already throws Spanish `Error`s that `route()` turns into 400s; no free functions.

**File Changes.** Create: `domain/game-lifecycle.ts`, `game-lifecycle.test.ts`, `repo/game-lifecycle-service.ts`, `game-lifecycle-service.test.ts`, `repo/debt-repository.ts`. Modify: `domain/types.ts`, `game-repository.ts` (+ test), `final-list-resolution-service.ts`, `candidate-resolution-service.ts`, `routes/api.ts` (+ `api.test.ts`), `repo/index.ts`. Delete / Migrate: none.

#### F3 — Create and confirm the convocatoria

**Current Implementation.** `ConvocatoriaService.preview` recomputes from `signed_up` and the guest rows, in two regimes: regulars alone fit the slots → everyone regular in, guests fill the rest by arrival (`byArrival`); otherwise everyone ranks on points (`byPoints`, which throws `Falta la antigüedad de: …` for a signed-up player with no `season_players` row) (`verified — source`). `commit` (after R1) stores the result, writes exclusion rows for `excluded`, `demoted`, `mercy`, and skips every anonymous guest (`if (e.playerId < 0) continue`), who is carried as `-position` through the algorithm (`verified — source`). The tests of `convocatoria-service.test.ts` assert those exclusion rows and chain several `commit`s to build exclusion history (`:160–256`, `verified — source`).

**Approach.**

- `ConvocatoriaService.commit` is replaced by `create(gameId, { discardEdits })` and `confirm(gameId)`; both run through `GameLifecycleService.perform` (F2), so the state change and the write share a transaction.
- `create`: (1) with nobody signed up it throws "No hay nadie apuntado" (S2); (2) if a convocatoria exists and any of its entries differs from the algorithm (`playing` ≠ `outcome` in `called_up|mercy`; the same test F4 uses to label hand changes) and `discardEdits` is not true, it throws "Se perderán tus correcciones" (S4; the web asks, then repeats with `discardEdits: true`); (3) it runs `store(gameId, 'generated')`, a public method that previews, maps the entries and calls `ConvocatoriaRepository.replace`, with no state change (F8 reuses it with source `'history'`). **No exclusion row is written**: exclusion points are derived when the game is played (F5), so a created or confirmed convocatoria never changes another game's history.
- **Anonymous plus-ones are entries** (amends R1/F1): `byArrival` and `byPoints` keep their negative-id contenders; a new domain class `GuestOrdinals` (built from the game's `guest_candidates` rows) maps `-position` to `{ hostPlayerId, ordinal }`, the nth anonymous plus-one of that host by position, at the persistence boundary only. They take slots and show in the table as "Invitado de <host>". Named guests are real players and need no mapping.
- `confirm`: `perform(gameId, 'confirm', …)` then `ConvocatoriaRepository.confirm(gameId)` sets `confirmed_at = datetime('now')`. It never recomputes: "frozen" is the stored algorithm outcome plus the stamp (HLD §2.2.5).
- `saved(gameId)` returns, besides today's keys, `confirmed_at`, `source` and per entry `changed_by_hand` (derived). `preview` stays (the old web and `GET …/convocatoria/preview` still call it until F9/F12 remove them).
- **Ordering constraint for the anatomy:** the existing tests that assert exclusion rows after a commit, and those that chain commits to build history, are rewritten against `PlayedDerivation` (F5); F3 and F5 must land together so no test is red in between. Until F9 the old screen's "Confirmar" calls `POST /games/:id/convocatoria`, which now only creates; the intermediate build is not releasable.

Worked example (`not yet run`): 16 signed up, state `open`, `create` → entries 16 (14 `playing`, 2 `excluded`), state `convocatoria_created`, `confirmed_at` NULL, `exclusions` empty. `confirm` → `convocatoria_confirmed`, `confirmed_at` set, entries unchanged. After a hand swap, `create` without `discardEdits` throws "Se perderán tus correcciones"; with it, a fresh convocatoria replaces the old one and the state is `convocatoria_created` (S4, from `confirmed`).

**Impacted Units.** `ConvocatoriaService` (`create`, `confirm`, `saved`, constructor gains `GameLifecycleService`; `commit` removed) — `convocatoria-service.ts`; `GuestOrdinals` — `domain/guest-ordinals.ts` (create); `ConvocatoriaRepository.confirm`, `replace(…, source)` — `convocatoria-repository.ts`; routes `POST /games/:id/convocatoria` (body `{ discardEdits? }`) and `POST …/convocatoria/confirm` — `routes/api.ts`; `repo/index.ts`; tests `convocatoria-service.test.ts`, `candidate-list-requirements.test.ts`, `api.test.ts`.

**Test Methodology.** HLD §2.10. Service and route tests on real SQLite: the outline of S1 (12 / 14 / 16 apuntados: in, out, state `convocatoria_created`, `exclusions` empty, `confirmed_at` NULL); S2 refusal leaves the state `open`; S3 confirm stamps and leaves entries equal; S4 from created and from confirmed, with and without `discardEdits`; anonymous plus-ones stored with host and ordinal and counted in the 14; `source` `generated`. `GuestOrdinals`: domain unit test (two plus-ones of one host get ordinals 1, 2 by position; another host restarts at 1). Fully automatable.

**Data Contract Verification.** Stored: `convocatorias` (+ `confirmed_at`, `source`) and the rebuilt `convocatoria_entries`. Writer: `ConvocatoriaRepository.replace` / `confirm`. Reader: `ConvocatoriaRepository.find` → `ConvocatoriaService.saved` → `GET /games/:id` → `web/src/api.ts` `GameDetail.convocatoria` (extra keys are additive; the web reads `entries[].player_id` today, which is now nullable for anonymous plus-ones: F9 handles it, and until then the old screen reads `playerId` only from `preview`, which keeps its shape). `rules_json` is the same JSON `rulesOf` produced. Create/read/update/delete: create (`create`), read (`saved`), update (`confirm`, and F4's moves), delete (`create` replaces; game delete cascades). Mismatch recorded: `saved()` previously never held NULL `player_id`; the one other reader, `frozenOutcomes`, is guarded (R1).

**Patterns and Conventions.** Service per use case over repositories (DIP); the transaction boundary lives in `GameLifecycleService.perform`; the rule "derive, don't store" for exclusions; messages in Spanish as thrown `Error`s.

**File Changes.** Create: `domain/guest-ordinals.ts` + test. Modify: `convocatoria-service.ts`, `convocatoria-repository.ts`, `routes/api.ts`, `repo/index.ts`, the three tests above. Delete: `ConvocatoriaService.commit`. Migrate: none.

#### F4 — Correct the convocatoria by hand

**Current Implementation.** No entry can be edited; sign-ups change only through `CandidateResolutionService.save` (which first un-signs everyone, then signs the list) and the participation routes (`verified — source`). `convocatoria_entries.playing` and `outcome` already separate "in now" from "what the algorithm chose" once a hand move updates only `playing` (`verified — source`, `convocatoria.ts` outcomes).

**Approach.** A new `ConvocatoriaEditService` with three entry points, all behind the lifecycle guard `edit_convocatoria` or `edit_apuntados` (F2):

- `move(gameId, member, playing)` (S1, S2, S4): the entry must exist (a player not signed up has none: "<name> no está apuntado", S3); moving in with `playing` entries already equal to the stored `slots` throws "No quedan plazas"; otherwise `playing` is updated, `outcome` is never touched. A swap is two moves (out, then in), made by the web; with 14 playing, moving the 15th in first is refused by design (S4). `member` is `{ playerId }` or `{ hostPlayerId, ordinal }`, so anonymous plus-ones can be moved too. "Changed by hand" is derived: `playing` ≠ (`outcome` ∈ `called_up`, `mercy`); S5 and S6 need no extra column because the frozen outcome is untouched.
- `align(gameId, signedUp)`, called inside `CandidateResolutionService.save`'s transaction after the sign-ups are written, when a convocatoria exists (created or confirmed): a newly signed-up player or plus-one gets an entry (`playing` 0, `outcome` `excluded`, points as the standings see them now, `position` after the last), an entry whose person is no longer signed up is deleted **only if not playing**; a playing one makes `save` throw "Quítalo primero de la convocatoria" before anything is written (S7; the check runs first, on the set difference of the old and new sign-ups).
- `requireNotMember(gameId, playerId)`, called by the participation routes' `PUT signed_up=false` and `DELETE` for the same refusal.
  Hand edits keep the state (created stays created, confirmed stays confirmed).

Ordering for display (used by F9): members first by `position`, then non-members by `position`; the line is the boundary, so 13 members put it after the 13th row (S2).

Worked example (`not yet run`, S4): confirmed, 14 `playing`, `slots = 14` from the stored `rules_json`; `move(P15, true)` → count 14 ≥ 14 → "No quedan plazas", nothing written. `move(Raúl, false)` then `move(Marta, true)` → Raúl `playing` 0 (`changed_by_hand` true: outcome `called_up`), Marta `playing` 1 (`changed_by_hand` true: outcome `excluded`); both stay `signed_up`.

**Impacted Units.** `ConvocatoriaEditService` (create, `repo/convocatoria-edit-service.ts`); `ConvocatoriaRepository.setPlaying`, `addEntry`, `removeEntry`, `playingCount` (add); `CandidateResolutionService.save` (call `align`, order the checks); `routes/api.ts` (`PUT /games/:id/convocatoria/members` body `{ member, playing }` — replaces the HLD's `…/members/:playerId`, which cannot name an anonymous plus-one — and the two participation routes); `repo/index.ts`; tests.

**Test Methodology.** HLD §2.10. Service/route tests in both states for S1, S2 (13 members), S3, S4, S5, S6 (`changed_by_hand` derived, `outcome` unchanged), S7 outline (created and confirmed), the new sign-up getting a below-the-line entry, an anonymous plus-one moved and counted, and `save` writing nothing when it refuses. Fully automatable; the drag gesture is F10's.

**Data Contract Verification.** Writes only `convocatoria_entries.playing` (and adds/removes entries for sign-up changes); `outcome`, `points`, `wait_counter`, `position`, `rules_json` are never edited by hand, so the frozen record stays auditable (`VISION.md` §5). Reader `find`/`saved` derives `changed_by_hand` the same way `create` (F3) derives "has hand edits": one private method on `ConvocatoriaRepository`'s row mapper, used by both, so the two cannot disagree. Delete: an entry is deleted only when its person is no longer signed up and not playing.

**Patterns and Conventions.** Service per use case; the guard first, writes after; refusals before side effects; the same `MemberKey` value type across F3, F4, F6.

**File Changes.** Create: `repo/convocatoria-edit-service.ts` + test. Modify: `convocatoria-repository.ts`, `candidate-resolution-service.ts`, `routes/api.ts`, `repo/index.ts`, `api.test.ts`, `candidate-resolution-service.test.ts`. Delete / Migrate: none.

#### F5 — Derive `played` and exclusion points

**Current Implementation.** Today `commit` writes the exclusion rows (`excluded` → `points`, `demoted` → `demoted`, `mercy` → `mercy`) and `FinalListResolutionService.reconcileExclusions` retracts the row of an `excluded` or `demoted` player who is on the pasted list and restores it if not; it never retracts `mercy` and never penalises a `called_up` player who did not play (`verified — source`: `convocatoria-service.ts`, `final-list-resolution-service.ts:245–262`). `played` is written only by the final-list paste and the chip. Only kinds `points` and `demoted` score; a `mercy` row never scores but feeds `waitCounter` and `mercyCount` (`verified — source`: `exclusion-history.ts`). `ExclusionRepository.historyFor` reads every exclusion row of the season before a given game, by date and id (`verified — source`).

**Approach.** One rule, two classes.

1. `PlayedDerivation` (domain, pure): `derive(entries)` returns, per entry that is a registered player, `{ playerId, played, exclusion }`. Anonymous plus-ones have no player and yield nothing. The rule, from `playing` and the algorithm's `outcome` (`author decision`: UC-003-05 table; the row marked `inferred` is flagged in _Owed_):

| `playing` | `outcome`                       | `played` | exclusion row                        |
| --------- | ------------------------------- | -------- | ------------------------------------ |
| yes       | `called_up`                     | yes      | none                                 |
| yes       | `excluded` (put in by hand)     | yes      | none                                 |
| yes       | `demoted` (put in by hand)      | yes      | none                                 |
| yes       | `mercy`                         | yes      | `mercy` (history only; never scores) |
| no        | `excluded`                      | no       | `points`                             |
| no        | `demoted`                       | no       | `demoted`                            |
| no        | `called_up` (taken out by hand) | no       | `points`                             |
| no        | `mercy` (taken out by hand)     | no       | `points` (`inferred`)                |

2. `PlayedOutcomeEffect` (repo, implements F2's `PlayedEffect`): `apply(game)` reads the stored convocatoria and, in the caller's transaction, deletes the game's exclusion rows then writes `played` (1/0) for every entry's player and the exclusion row the derivation gives; `retract(game)` sets `played = 0` for every participation of the game and deletes the game's exclusion rows. It never touches `paid_cents`, `paid_on` or `team` (S4: "recorded payments are kept"; teams are an independent record). It is registered first in `repo/index.ts`, billing (F6) second.

Because `apply` always deletes then rewrites, marking as played again after a hand swap recomputes (S5), and a point is retracted when the player is swapped in and restored when swapped out, which is exactly what `reconcileExclusions` did for the first case and what the author's decision adds for the second. Standings need no change: exclusion rows exist only for played games, so `historyFor` and `StandingsService` see a game's points only while it is played, and a cancelled game's rows are removed on cancel (the `retract` path of F2).

Worked example, by hand (`not yet run`): confirmed convocatoria of 16: P01–P14 `called_up`, P15, P16 `excluded`; Raúl (P03) taken out and Marta (P15) put in by hand. `play` → P03 `played = 0`, row `points`; P15 `played = 1`, no row; P16 `played = 0`, row `points`; the other 13 `played = 1`. `reopen` → every `played = 0`, no exclusion row for the game, `paid_cents` untouched.

**Impacted Units.** `PlayedDerivation` — `domain/played-derivation.ts` (create); `PlayedOutcomeEffect` — `repo/played-outcome-effect.ts` (create); `ExclusionRepository.clear` (R1) used by the effect; `ParticipationRepository.setPlayedForGame` (add: sets `played` for a list of ids, clears for the rest) ; `repo/index.ts` (register); tests. `ExclusionRepository.frozenOutcomes` stays (its last consumer, `FinalListResolutionService`, is deleted in F12, which deletes it too).

**Test Methodology.** HLD §2.10. Domain: `played-derivation.test.ts`, one case per row above (S1 outline). Effect, real SQLite: apply writes the right flags and rows; S2 (an unpaid member has `paid_cents = 0` and the standings count 0 paid games for the game); S4 (reopen retracts, payments kept); S5 (swap then replay); cancel from played retracts and undo re-applies. **S3, equality with WP-001:** a differential test builds one database through the legacy path (a confirmed convocatoria, the final-list paste of the same 14, which still exists until F12) and one through the new path (`create`, `confirm`, `play`, then 14 payments), and asserts equal `standings(season)` and equal exclusion rows; when F12 deletes the legacy path, the test keeps the values it produced as a fixed expectation. The tests that assert exclusions after the old `commit` (F3's note) are rewritten with a `GameFlow` test helper that runs create → confirm → play. Fully automatable.

**Data Contract Verification.** Written: `participations.played`, `exclusions(game_id, player_id, kind)`. Readers: `StandingsService` (`played` → `gamesPlayed`; exclusions → points via `historyFor`), `ConvocatoriaBuilder` for later games (via `historyFor`), the web (old chips, F11). The stored `kind` values equal the `ExclusionKind` union and the table `CHECK`. The derivation handles every storable `(playing, outcome)` pair (8 rows above cover the 2 × 4). Deletion: exclusion rows of a game are removed on retract and on rewrite.

**Patterns and Conventions.** Pure domain class plus an adapter (the `PlayedEffect` port of F2); derive-don't-store; no free functions.

**File Changes.** Create: `domain/played-derivation.ts` + test, `repo/played-outcome-effect.ts` + test, `repo/game-flow-test-support.ts`. Modify: `participation-repository.ts`, `repo/index.ts`, `convocatoria-service.test.ts`, `candidate-list-requirements.test.ts`, `standings-service.test.ts`. Delete / Migrate: none.

#### F6 — Debts per share, payment by anyone, undo, debt in standings

**Current Implementation.** Debt is computed, not stored: `played = 1 AND paid_cents = 0` times the standard share, summed over every game of the season in a scan of `participations` (`standings-service.ts`, `verified — source`). Payment is `participations.set(paid_cents, paid_on)`, called by the chip route and by the final-list paste (`verified — source`). `ParticipationRepository.set` stamps `paid_on` with today's date in UTC (`new Date().toISOString().slice(0,10)`) when money first appears (`verified — source`, `:67–72`), while `LocalCalendar` is the codebase's local-date helper. Imported rows carry `paid_cents` as the total with plus-ones and `guests` as a count (`verified — invocation`, F1). Season price: `price_cents / slots`, rounded, is the share (`verified — source`, repeated in `StandingsService` and `FinalListResolutionService.perHead`).

**Approach.** Two decoupled facts (HLD §2.2.3).

- `DebtLedger` (domain, pure): `plan(members, billed, amountCents)`. A _billable share_ is `{ key, holder, beneficiary | { host, ordinal } }`; `key` is `p:<playerId>` or `g:<host>:<ordinal>`. `plan` returns the shares not already billed. `holders(shares)` and `holdsOf(playerId)` answer the screen's totals (each share counted once).
- `BillingEffect` (repo, `PlayedEffect`, F2): `apply(game)` reads the convocatoria's `playing` entries, assigns each a holder (a registered player holds their own share, unless named in `guest_candidates` as a guest of a host, in which case the host holds it; an anonymous plus-one is held by its host), and **in the caller's transaction** inserts the `share_debts` rows for shares that have neither a debt nor a payment row, deletes unpaid debt rows of shares whose member no longer plays (a reopen followed by a swap), and leaves payments alone. Amount = `round(price_cents / slots)` of the game's season at billing time, stored on the row, so a later price change never rewrites an existing debt. `retract(game)` does nothing: debts and payments survive reopen and cancel (S4 of UC-003-05); `StandingsService` ignores a game that is not `played`.
- `PaymentService.pay(gameId, { shares, payerPlayerId, amountCents?, paidOn? })` (route `POST /games/:id/payments`): guard `pay` (F2: messages of UC-003-06-S6 rows 1 and 3), then per share: no debt row and no payment row → "<nombre> no estaba en la convocatoria" (row 2); a payment row → "<nombre> ya está pagado"; the payer must be the share's holder or its beneficiary, else "Solo puede pagar quien lo debe o a quien corresponde" (`inferred` from the author's "via Anna or via Maria"); `amountCents` is allowed only with one share (S4, an odd amount is an adjustment: the share is settled with that amount and no balance remains). In one transaction: delete the debt row, append the `payments` row (`paid_on` = given or today's **local** date through `LocalCalendar`), and when the beneficiary is a registered player set that player's `participations.paid_cents` and `paid_on`. So a host who pays everything they hold settles several shares at once (S3c), and a guest who pays their own share settles one and lowers the host's holdings (S3d); the point follows the beneficiary (S3b).
- `PaymentService.undo(gameId, paymentId)` (route `DELETE /games/:id/payments/:paymentId`): guard `pay`; one transaction: delete the payment, re-insert the debt (holder, key, amount = the season's current share; `inferred`: the adjusted amount of an odd payment is not restored), and for a registered beneficiary set `paid_cents = 0`, `paid_on = NULL` (S5).
- `StandingsService`: the debt query becomes `SELECT holder_player_id, SUM(amount_cents) FROM share_debts d JOIN games g ON g.id = d.game_id WHERE g.season_id = @s AND g.status = 'played' GROUP BY holder_player_id`; the `participations` debt scan and the `@price` parameter go. `paidGames` keeps counting `paid_cents > 0`, now meaning "this player's own share was settled, by whoever paid it". `GameDetail` (GET `/games/:id`) gains `debts[]` and `payments[]`; the per-player totals the screen needs (`holds`, per-share `heldBy`) are computed from them in the web's `lib/money.ts` (pure calculation, per the frontend standard), which replaces the HLD's server-computed fields.
- **Query cost (author requirement).** Debt reads touch only `share_debts` (size = shares outstanding), served by `idx_share_debts_game` and `idx_share_debts_holder`; `payments` is read by `game_id` or `payer_player_id` and never on the debt path. The season-wide debt sum joins `games` by primary key from the outstanding rows only.
- **Seed** (`import-season.ts`, as F1 promised): for each imported row, `paid_cents` becomes the player's own share (`value × 100 − guests × share`; a 3,75 € value stays 375), plus a `payments` row (holder = beneficiary = payer = the player, `paid_on` = the stamped game date); each `*` row gets one `share_debts` row (amount = the share). Imported plus-ones' payments leave no row (author: "the easier"); `guests` stays a count until F12 drops it.

Billing idempotence, traced by hand (`not yet run`): Ana plays and holds her own share (`p:Ana`) and Marta's (`p:Marta`, a named guest of Ana). `play` → two debt rows (400 each, holder Ana). Ana pays both (payer Ana) → two payment rows, no debt rows, Ana's and Marta's `paid_cents` 400. `reopen`, Marta swapped out by hand, `play` again → `plan` finds `p:Ana` billed (payment row) and `p:Marta` billed, so inserts nothing; Marta's debt row would have been deleted had she been unpaid. Undo of Marta's payment (while played) → payment deleted, debt re-inserted held by Ana, Marta's `paid_cents` 0.

**Impacted Units.**

| Unit                                                                                                                                        | Location                                            | Action |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------ |
| `DebtLedger`, `ShareKey`                                                                                                                    | `domain/debt-ledger.ts`                             | Create |
| `DebtRepository` (`list`, `insert`, `delete`, `byKey`, `deleteUnpaidNotIn`, `totalsByHolder`, `outstandingCents`; `anyOutstanding` from F2) | `repo/debt-repository.ts`                           | Modify |
| `PaymentRepository` (`append`, `find`, `delete`, `list`, `byKey`)                                                                           | `repo/payment-repository.ts`                        | Create |
| `BillingEffect`, `PaymentService`                                                                                                           | `repo/billing-effect.ts`, `repo/payment-service.ts` | Create |
| `StandingsService` (debt query)                                                                                                             | `repo/standings-service.ts`                         | Modify |
| `GET /games/:id`, `POST …/payments`, `DELETE …/payments/:id`                                                                                | `routes/api.ts`                                     | Modify |
| seed: own-share `paid_cents`, payments, debts                                                                                               | `scripts/import-season.ts`                          | Modify |
| wiring                                                                                                                                      | `repo/index.ts`                                     | Modify |

**Test Methodology.** HLD §2.10. Domain: `debt-ledger.test.ts` (shares to bill; each share once in the totals; S3e: Ana holds two shares, the total is 8 €, not 12 €). Service/route, real SQLite, integer cents: S1 (400 paid on 2026-10-07), S2 (3 of 14 paid → 11 owing, 4 400 cents outstanding), S3 (a `Dani +1` line gives two shares held by Dani), S3b both rows, S3c, S3d, S4 (375), S5, S6's three refusals plus "ya está pagado" and the payer rule, the billing trace above, and a rollback test (a payment that fails on its second share leaves the first debt intact). **Query-cost tests:** seed N played games with every share paid and assert the debt read and the standings debt sum read zero `participations` rows (`EXPLAIN QUERY PLAN` names `share_debts` and an index, not `participations`) and that the outstanding count equals the unpaid shares. Standings equality for the imported history: seed to a temporary database before and after the element; `standings` including `debtCents` are identical (F1's baseline). Fully automatable.

**Data Contract Verification.** Stored: `share_debts`, `payments` (F1) and `participations.paid_cents/paid_on`. Writers: `BillingEffect` (insert/delete debt), `PaymentService` (delete debt, append payment, set paid fields; the reverse on undo), the seed. Loaders: `DebtRepository`, `PaymentRepository`, `StandingsService`. Consumers: `GET /games/:id` → `web/src/api.ts` (F11 types), `StandingsService` → `/seasons/:id/standings` → `Standing.debtCents` (unchanged shape). Parser for the key: `ShareKey` converts between the row's columns and `p:` / `g:` strings; every storable combination (player beneficiary, or host plus ordinal) round-trips (unit test). A share is in `share_debts` or in `payments`, never both: both writers run in one transaction and a test asserts the invariant after every operation. Mismatch noted: until F12 the old chip route and the final-list paste still write `paid_cents` directly and know nothing of the two new tables; F12 removes both writers.

**Patterns and Conventions.** Repository per table, service per use case, effect adapter for billing, value type `ShareKey`/`MemberKey` shared with F3/F4, money in integer cents, local dates through `LocalCalendar`, Spanish messages, no free functions.

**File Changes.** Create: `domain/debt-ledger.ts` + test, `repo/payment-repository.ts`, `billing-effect.ts`, `payment-service.ts` and tests. Modify: `repo/debt-repository.ts`, `standings-service.ts` (+ test), `routes/api.ts` (+ `api.test.ts`), `import-season.ts`, `repo/index.ts`. Delete / Migrate: none.

#### F7 — The team paste records only `team`

**Current Implementation.** `FinalListParser.splitByTeam` already does only team parsing: headings `Claros`/`Oscuros` switch team, lines with no letters are dropped, a player line before a heading throws (`verified — source`, `domain/final-list-parser.ts`). Everything else the paste does lives in `FinalListResolutionService.paste` (`played`, payment, `guests`, sign-up, exclusions, status) and its seniority prompt (`verified — source`). Unresolved lines are returned in the response and never stored (`verified — source`: `paste` returns `unresolved`, no write). `LineResolver.settle` offers `link`, `linkAsAlias`, `register` (`verified — source`). The web paste is `FinalListPaste` + `useFinalListPaste`; two e2e specs use it (`e2e/tests/season-and-player.spec.ts:186`, `:275`, `verified — invocation`).

**Approach.** Teams are a resource of the game; a paste is one way to produce them, so the design separates _what_ the teams are from _where_ they came from, and tomorrow's automatic generation plugs in without touching either (`author decision`: "teams may be generated automatically").

- Rename `FinalListParser` to `TeamListParser` (file, class, test; its behaviour already matches), so the "final list" vocabulary leaves the code before F12 checks for it.
- **`TeamAssignmentService` (repo, the source-agnostic core):** `assign(gameId, assignments)` guards `teams` (F2: played only), accepts only convocatoria members (`playing` entries; anything else is refused with "<nombre> no estaba en la convocatoria"), and in one transaction clears every team of the game and writes the given ones (S4: replace). It sets `team` and nothing else, so played flags, payments, exclusions and sign-ups cannot change (S1, S5). `assignOne(gameId, assignment)` sets one member's team without clearing the rest; `read(gameId)` returns the current assignments.
- **`TeamPasteService` (repo, one producer of assignments):** `paste(gameId, text)` splits by team, parses each line with `CandidateLineParser`, matches with `LineResolver.matcher()` and puts each line in one bucket: **matched member** (first appearance wins if a name repeats), **outside** (a registered player who is not a member: kept as text, no team, row untouched, S2), **unresolved** (unmatched or ambiguous name: returned with its candidates, stored nowhere, S3), or **ignored plus-one** (an `X +1` line names an anonymous guest with no row; reported, not resolved; `inferred`). It then calls `TeamAssignmentService.assign` with the matched ones. `resolve(gameId, { line, field, team }, action)` (S3b) settles one line with `LineResolver` (`link`, `linkAsAlias`; `register` refused with "Aquí solo se puede elegir un jugador de la convocatoria") and, for a member, assigns that one player without clearing the others (it adds to the teams, using `assignOne`). Result of `paste`: `{ matched, outside, unresolved, ignored }`; no seniority prompt (a member has already appeared through the apuntados).
- **The extension point, not built now:** a `TeamGenerator` interface (`generate(members, rules): TeamAssignment[]`, a strategy like the codebase's `GuestSlotAllocator`) and a `TeamGenerationService` that would call it and then `assign`. It would add `POST /games/:id/teams/generate` (returns the proposal for the organiser to accept or edit with `PUT`, since the proposal is not persisted until `assign`). Adding it means new classes and one route; `TeamAssignmentService`, the table, the `GET`/`PUT` and the paste do not change. If the organiser later wants to know how a team list was produced, that is one nullable column on `games` (`teams_source`), added then; it is not added now because nothing reads it.
- Routes: `GET /games/:id/teams` and `PUT /games/:id/teams` (the resource), `POST /games/:id/teams/paste` and `POST /games/:id/teams/paste/resolve` (the paste producer), replacing the final-list pair.

Worked example (`not yet run`, S1/S2/S4): played, 14 members, Marta signed up but not a member. Paste `Claros` + 7 member names + `Marta`, `Oscuros` + 7 names → 14 teams set, `outside: [Marta/claros]`, Marta's row unchanged. Paste again with the teams swapped → every team replaced.

**Impacted Units.** `TeamListParser` (rename of `final-list-parser.ts` + test); `TeamAssignmentService` (create, `repo/team-assignment-service.ts`), `TeamPasteService` (create, `repo/team-paste-service.ts`); `ParticipationRepository.clearTeams(gameId)` (add); routes `GET`/`PUT /games/:id/teams`, `POST …/teams/paste`, `…/teams/paste/resolve`; `repo/index.ts`; tests (`team-paste-service.test.ts`, `api.test.ts`). The old routes and services stay until F12.

**Test Methodology.** HLD §2.10. Service and route, real SQLite: S1 (a paste changes only `team`; compare the whole participation rows and the exclusion rows before and after), S2, S3 (one unmatched and one ambiguous stay unresolved with candidates, no team), S3b (link, and link-as-alias; register refused), S4, S5 (record a payment with no team), the guard refusing a paste while the game is not played. `TeamAssignmentService` is tested on its own with assignments given directly (no paste involved), including the refusal of a non-member, which is what a future generator will rely on. Fully automatable.

**Data Contract Verification.** Written: `participations.team` (`'claros' | 'oscuros' | NULL`, `CHECK` in the schema). Readers: `GET /games/:id` (`participations[].team`) → `web/src/api.ts` `Participation.team` (exists, `:40`) and F11's table. Every value the parser can produce is in the `CHECK`. Create/update by paste, delete by the next paste's clear; no other writer after F12.

**Patterns and Conventions.** Service per use case; `LineResolver` reused (shared resolution with the apuntados, as the frontend standard's example asks for in the UI); no free functions.

**File Changes.** Create: `repo/team-assignment-service.ts` + test, `repo/team-paste-service.ts` + test. Modify (rename): `domain/final-list-parser.ts` → `team-list-parser.ts`, its test. Modify: `participation-repository.ts`, `routes/api.ts`, `api.test.ts`, `repo/index.ts`. Delete / Migrate: none.

#### F12 — Retire the final-list writers

**Current Implementation.** Find-references and `grep` over `server/src`, `server/scripts`, `web/src` (`verified — invocation`): `FinalListResolutionService` is built in `repo/index.ts` and called by three routes (`POST /games/final:paste`, `POST /games/:id/final/resolve`) and its own test; `FinalListTargetResolver` is used by the route `GET /games/final-list-target`, by the service, by `repo/index.ts` and its test; `GameRepository.unresolvedOnOrBefore` has the resolver as its only consumer; `ScheduleResolver.cutoffFor` and `LocalCalendar.dateTimeOf` are used only by the resolver (and their tests); `ParticipationRepository.clearFinalOutcome` only by the service (and `participation-repository.test.ts:69`); `ExclusionRepository.frozenOutcomes` only by the service. In the web: `FinalListPaste`, `useFinalListPaste`, `api.pasteFinalList`, `api.resolveFinalLine`, and the chips in `GameDay` that call `PUT …/players/:id` with `played`, `paid_cents`. `participations.guests` is written only by the service and the seed, read only by `web/src/api.ts:39,242`.

**Approach.** Last element in the order, once the screen (F9, F11) has replaced every web consumer: a deletion with proof. It is ordered after F11 because removing the paste and the chips earlier would leave the old screen calling routes that no longer exist.

1. Delete `FinalListResolutionService`, `FinalListTargetResolver`, their tests, the three routes and their `api.test.ts` cases, the `repo/index.ts` exports, `GameRepository.unresolvedOnOrBefore` (+ test case), `ParticipationRepository.clearFinalOutcome` (+ its test), `ExclusionRepository.frozenOutcomes`, and — after find-references show no remaining caller — `ScheduleResolver.cutoffFor` and `LocalCalendar.dateTimeOf` with their tests.
2. Narrow `PUT /games/:id/players/:playerId` to `signed_up` and `note` (the route builds that object from the body); drop `played`, `paid_cents`, `paid_on`, `team`, `guests` from the web `setParticipation` patch type.
3. Drop `participations.guests` from `schema.sql`, `ParticipationRow`/`Patch`, `ParticipationRepository.set`, the seed's write (the seed keeps its local count to split the imported amount), and `web/src/api.ts`.
4. Convert F5's differential test (legacy path against the new one) into a fixed expectation with the values it produced, then delete the legacy side; the F3-note tests already run through `GameFlow`.
5. Verify by search that none of these strings remain in code, tests or scripts: `FinalList`, `final-list`, `finalList`, `unresolvedOnOrBefore`, `frozenOutcomes`, `clearFinalOutcome`, `cutoffFor`, and `guests` as a participation column (the `guest_candidates` table is unrelated and stays). Documents are F-level documentation impact, listed in section 4.

**Impacted Units.** As listed in 1–3; plus `AGENTS.md`, `README.md` and the domain documents named in §2.8 (written with the final text, section 4).

**Test Methodology.** HLD §2.10. The full suite (`npm test`, `npm run test:e2e`, `npm run lint`, `npm run format:check`) passes with the deletions; the search of step 5 returns nothing; `schema.test.ts` (F1) asserts `participations` has no `guests` column; F5's fixed expectation passes. No manual part.

**Data Contract Verification.** Removes a stored column (`guests`) with no remaining reader or writer after step 3 (verified by the search); `played`, `paid_cents`, `paid_on` keep their writers (`PlayedOutcomeEffect`, `PaymentService`, the seed). `unresolvedOnOrBefore` removal does not touch the `games.status` contract. After the narrowing, the only writer of a participation's sign-up outside the candidate save is the route, behind the F2 guard.

**Patterns and Conventions.** Delete, don't deprecate: no shim, no re-export, no commented code; the standards' "clean code" ruling.

**File Changes.** Delete: `final-list-resolution-service.ts` + test, `final-list-target-resolver.ts` + test, `web/src/components/FinalListPaste.tsx`, `web/src/hooks/useFinalListPaste.ts` (if F11 has not already). Modify: `routes/api.ts`, `api.test.ts`, `game-repository.ts` + test, `participation-repository.ts` + test, `exclusion-repository.ts` + test, `schedule-resolver.ts` + test, `local-calendar.ts`, `schema.sql`, `repo/index.ts`, `import-season.ts`, `web/src/api.ts`, F5's differential test. Migrate: none.

#### F8 — History conversion for seeded played games

**Current Implementation.** The seed (`server/scripts/import-season.ts`) creates games, players, participations and exclusions and prints standings; it writes no convocatoria (`verified — source`). `ConvocatoriaService.preview` computes a selection for any game from its sign-ups, with `StandingsService.standings(seasonId, gameId)` for points as of that game: the paid-games and exclusion-history queries both filter by `played_on` and `id` strictly before the game (`verified — source`, `standings-service.ts:46–60`, `exclusion-repository.ts` `historyFor`). `byPoints` throws `Falta la antigüedad de: …` for a signed-up player with no `season_players` row; the seed enrols every player it creates (`players.add` for both CSVs, `verified — source`). Imported rows: every one `signed_up = 1`, no `guest_candidates` rows, 39 played games with 10–15 `played = 1` rows each, 9 cancelled with no signed-up row (`verified — invocation` / `verified — document`: UC-003-09 claims). `--reset` deletes the season row and the cascade reaches `games` and, after F1, `convocatorias` (`verified — source`, `ON DELETE CASCADE`).

**Approach.**

- `ConvocatoriaService` exposes `store(gameId, source)` (split out of F3's `create`): it previews, maps the entries (`GuestOrdinals`) and calls `ConvocatoriaRepository.replace(gameId, rulesJson, entries, source)`, with **no state change and no exclusion row**. `create` is `perform(…, 'create', () => store(gameId, 'generated'))` after its guards; the converter calls `store(gameId, 'history')` directly, because the game stays `played`.
- `ConvocatoriaHistoryConverter` (repo, new): `convertSeason(seasonId)` walks `games.list(seasonId)` (already ordered by `played_on, id`) and, for each game with `status = 'played'` and **no stored convocatoria**, calls `store(gameId, 'history')` and then `ConvocatoriaRepository.confirm(gameId)` (stamps `confirmed_at`). It returns `{ converted, skipped }` game ids; the seed prints them. Cancelled and open games are skipped (S6); a game that already has one is skipped, so a second run changes nothing (S5). It runs in one transaction and **fails loudly**: if the algorithm throws for a game (a player with no seniority row), the whole conversion rolls back and the seed reports the game. The alternative — skip with a report — was rejected because every seeded player is enrolled, so a throw means a broken seed, and a silent hole would reappear as the special case the design is meant to remove (`inferred`).
- The seed calls `converter.convertSeason(season.id)` after importing, inside the same command; `npm run seed -- --reset` therefore rebuilds a database whose every played game has a convocatoria (S7 is retired; the "run on the live database" form is gone with the ruling).
- Nothing is derived: no `played`, payment, `paid_on`, exclusion or `signed_up` is written, and `PlayedOutcomeEffect` is not run, so who played stays as the history says even where the algorithm disagrees (S4). The cap of 14 comes from the algorithm itself (`byArrival` seats at most `slots`, `byPoints` ranks and cuts at `slots`), so 10 / 14 / 15 / 16 signed up give 10 / 14 / 14 / 14 in (S2).
- S8 needs no code: a game dated in the past is created by the same `POST /games` (no date check there, `verified — source`) and walks the normal lifecycle; a route test proves it.

Worked example, by hand (`not yet run`): imported game 12 Mar 2025, 16 signed up, 15 of them `played = 1`. `convertSeason` → `store` previews with points as of that game (regulars 16 > 14 → `byPoints`), writes 16 entries (14 `playing`, 2 `excluded`), `source = 'history'`, `confirmed_at` set; the game stays `played`; the 15 `played` flags are unchanged, even for the one the algorithm left out. A second `convertSeason` finds the stored record and skips.

**Impacted Units.** `ConvocatoriaHistoryConverter` (`repo/convocatoria-history-converter.ts`, create); `ConvocatoriaService.store` (modify, from F3); `repo/index.ts` (wire); `import-season.ts` (call after the import, print the report); tests.

**Test Methodology.** HLD §2.10. Converter test on real SQLite with a built fixture season: a played game with 16 / 15 / 14 / 10 signed up (S1, S2), history columns and standings identical before and after, comparing full dumps of `participations`, `exclusions`, `payments`, `share_debts` and `standings` (S3), an algorithm-left-out player who played keeps `played = 1` and an `excluded` entry (S4), a second run adds nothing (S5), cancelled and open games get none and keep their state (S6), a later game is computed with the earlier game's payments, not today's (the D1 `assumed`: two games, a payment in the first changes the second's ranking; this is where the assumption is run). Route test for S8 (a game dated 2025-03-12 walks open → played with no past-date branch). Seed check as a recorded command in the task's verification: `PACHANGUERO_DB=<tmp> npm run seed -- --reset` then query counts (48 games, 39 convocatorias, none above 14 entries playing, 9 cancelled with none) and compare standings with F1's baseline. Fully automatable.

**Data Contract Verification.** Written: `convocatorias(source = 'history', confirmed_at)` and `convocatoria_entries` through `replace`. Readers: `ConvocatoriaRepository.find` → `saved` → `GET /games/:id`; `GameLifecycle` (`reopen` from played needs a confirmed convocatoria: converted games have one); `PlayedOutcomeEffect` on a later reopen-and-replay reads these entries (UC-003-09-S4 and the HLD risk: it may disagree with history; the screen can label `source = 'history'`). Every `outcome`/`playing` the algorithm can emit is storable. Delete: `--reset` cascades; the converter never deletes.

**Patterns and Conventions.** One service per use case; the converter composes `ConvocatoriaService.store` instead of duplicating its mapping; fail-loudly seed; no free functions.

**File Changes.** Create: `repo/convocatoria-history-converter.ts` + test. Modify: `convocatoria-service.ts` (split `store`), `repo/index.ts`, `scripts/import-season.ts`, `api.test.ts` (S8). Delete / Migrate: none.

#### R2 — Split `GameDay.tsx`

**Current Implementation.** `web/src/pages/GameDay.tsx` (437 lines, `verified — source`) holds, in one component: the fetch of the game (`load`, `detail`, `error`), the money maths (`euros`, `perHead`, `owed`, `paidCount`), the chip mutation (`mutate`), the game picker, and five cards (Partido, Lista de apuntados via `CandidateList`, Lista final via `FinalListPaste`, Jugadores, Convocatoria with the local `ConvocatoriaList`). The frontend standard names exactly this file and prescribes `useGameDetail`, `lib/money.ts` and per-card components (`.agents/rules/frontend-coding-standard.md`, `verified — document`). Seven of the nine e2e specs do not touch the final-list paste or the old convocatoria buttons; the other three (`:186`, `:248`, `:364`) do (`verified — invocation`, grep of `Simular`, `Registrar lista final`, `/convocatoria`).

**Approach.** A pure move, with no visible change:

- `hooks/useGameDetail(gameId)` → `{ detail, error, reload }` (the `load` effect).
- `lib/money.ts`: `euros(cents)`, `shareCents(price, slots)`; `lib/dates.ts`: `fmtDate`. (F9 extends `money.ts` with the format and parser of UC-003-06's non-behavioural rule.)
- Components `GameHeader` (picker, `RecordPastGame`, `DeleteGame`, the four counters), `PlayerList` (today's Jugadores card with its chips), `ConvocatoriaPanel` (the buttons and `ConvocatoriaList`); `GameDay` composes them and keeps only the selected-game state.
- **Ordering:** this element is cut with the first group, before F3: its verification — all nine e2e specs green against an unchanged behaviour — only means something while the server still behaves as today. From F3 on, three of those specs are rewritten by F9 and F11.

**Impacted Units.** `pages/GameDay.tsx` (shrinks); new `hooks/useGameDetail.ts`, `lib/money.ts`, `lib/dates.ts`, `components/GameHeader.tsx`, `PlayerList.tsx`, `ConvocatoriaPanel.tsx`.

**Test Methodology.** HLD §2.10: E2E only (the existing nine specs, unchanged, plus `npm run lint` and `npm run build`). There is no web unit-test runner today (see F9), so R2 adds none.

**Data Contract Verification.** Nothing stored; `GameDetail` is read unchanged.

**Patterns and Conventions.** SRP per component and hook, data through `api.ts`, pure calculation in `lib/` (frontend standard §1, §4).

**File Changes.** Create: the six files above. Modify: `GameDay.tsx`. Delete / Migrate: none.

#### F9 — The game screen: state header, one players table, counters

**Current Implementation.** The Partido tab is five stacked cards with no state shown (`verified — document`: Q-07); the tab chrome is `App.tsx` (three tabs, `nav.tabs` fixed at the bottom, `header.top` sticky), styles in `styles.css` (406 lines, dark theme tokens `--bg`, `--surface`, `--accent`…, `.card`, `.row`, `.chip`, `.tag`, `.stat-row`; `verified — source`). The mockups are static HTML + the CSS in `requirements/examples/mockups/style.css`, reviewed and accepted (`author decision`): a sticky bar (game picker, `+ Nuevo`, counters, "Cancelar partido", the step trail, the next-action line with its button), a tab strip on a phone (`Jugadores` / `Apuntados`, or `Equipos` once played), a two-column grid on a desktop, `table` rows with a grip column, a line after the last member, tags, `hide-sm` columns. Web dependencies are `react` ^19.3.0 and `react-dom` ^19.3.0 (`web/package.json`, `verified — source`): `AGENTS.md`'s "React 18" is stale (carried to section 4). **There is no web unit-test runner**: `vitest` lives only in `server/node_modules/.bin`, `web` has none and no `*.test.*` file (`verified — invocation`), although `docs/test-strategy.md` names `web/src/**/*.test.tsx`. `GET /games/:id` returns `{ game, participations, convocatoria }` only (`routes/api.ts`).

**Approach.**

- **Server: `GameViewService`** (repo, new) builds the response of `GET /games/:id`; the route stays thin. It returns `{ game, state, nextAction, participations, convocatoria, debts, payments, arrivals, points }`: `state`/`nextAction` from `GameLifecycleService.describe`; `convocatoria` as `saved()` (F3: `changed_by_hand`, `source`, entries with player or host+ordinal); `debts`/`payments` (F6); `arrivals` = the matched rows of `CandidateResolutionService.load(gameId)` (position, player or host, kind), which is where "Llegada" lives; `points` = `StandingsService.standings(seasonId, gameId)` as `{ playerId: points }`, the same numbers the algorithm sees. The HLD's server-side `counters` are dropped: the counters are computed in the web from this data, in `lib/` (amends HLD §2.4).
- **Web `lib/` (pure, unit-tested):**
  - `money.ts`: `euros(cents)` → "4 €", "3,5 €", "3,75 €" (whole when whole, decimals otherwise) and `parseEuros(text)` accepting the same, `null` otherwise (UC-003-06 non-behavioural rule).
  - `gameRows.ts`: `buildRows(detail, points)` returns the table's rows for the game's state: `open`: matched candidate rows in arrival order; `convocatoria_created` / `convocatoria_confirmed`: entries members first by `position`, then the rest, with the **line** between the two groups; `played`: all entries, those who owe first then alphabetical (`es` locale); `cancelled`: the table of the state it was cancelled from (`cancelled_from`), read-only. Each row carries `labels` (`plaza de gracia` = `mercy` outcome and playing; `degradado` = `demoted` outcome; `cambiado a mano` = `changed_by_hand`; S7, wording `assumed` in the requirements and confirmed by use) and, for a plus-one entry, `host` so that in `played` it renders as a sub-row under its host.
  - `columns.ts`: the columns per state (S2) and `sortRows(rows, column, direction)` with toggling (S4).
  - `holdings.ts`: from `debts[]`, `holdsOf(playerId)` and `outstanding(game)`, each share counted once (UC-003-06-S3e).
  - `counters.ts`: apuntados, plazas, pagados (shares settled), deuda (sum of debts).
- **Web components and hooks:** `GameBar` (picker, `+ Nuevo` = `RecordPastGame`, counters, `Cancelar partido`/`Deshacer cancelación`, `StateSteps`, `NextAction`) sticky below `header.top`; `PlayersTable` (columns from `columns.ts`, header click sorts in `played`); `SidePanel` (`CandidateList` as today, or the teams panel from F11); `GameDay` composes them in the mockup's grid, with the phone tab strip. `NextAction` shows the server's `nextAction` label and the buttons of the state: open → "Crear convocatoria"; created → "Confirmar convocatoria" + "Crear de nuevo"; confirmed → "Marcar como jugado" + "Crear de nuevo"; played → "Registrar pagos" as text while anything is owed + "Reabrir partido"; cancelled → "Deshacer cancelación". "Crear de nuevo" asks "Se perderán tus correcciones" only when the server refuses with that message, then repeats with `discardEdits` (F3). Server errors (`Falta la antigüedad de …`, "No hay nadie apuntado", the lifecycle refusals) show in an alert beside the bar. Hooks: `useGameDetail` (R2), `useGameActions(gameId, reload)` (`transition`, `create`, `confirm`), no component calls `api` directly.
- **Phone, S5:** below 600 px the columns `Llegada`, `Puntos` and `Equipo` collapse into a second line under the player's name in the same cell, so nothing the state needs lives only in a wide column; the page never scrolls horizontally (the table is `width: 100%` with wrapping names). Tap targets are at least 44 px.
- **Web unit tests (new tooling):** add `vitest` to `web`'s `devDependencies` at the version `server` already uses, a `test` script, and run it from the root `npm test`; the `lib/` modules above are pure TypeScript, so no DOM library is needed. **Adding the dependency needs the author's explicit permission when this element is implemented** (`CLAUDE.md`, "never install software without explicit permission"); until then the `lib/` logic is covered by e2e only.
- **e2e rewritten** (`e2e/tests/season-and-player.spec.ts`, and a new `game-screen.spec.ts`): `:186` ("a final list retracts the exclusion…") becomes the walk create → confirm → play with a hand swap and the resulting exclusion, read from the standings; `:248` ("records a past game in the season its date belongs to") becomes a past-dated game walking the normal lifecycle (UC-003-09-S8); `:364` keeps its point (the missing seniority shows right where "Crear convocatoria" was pressed) with the new button name; the other six are unchanged. The new spec walks open → created → confirmed → played → reopen → cancel → undo reading the state and next action (UC-003-01-S1); then, for each state at 1280 × 800 and 390 × 844, the visible state and next action, the columns and order (S1, S2), sorting (S4), no horizontal scroll on the phone (S5), the counters (S6), and the label `cambiado a mano` after a hand swap (S7; `plaza de gracia` and `degradado` are covered by `gameRows` unit tests because producing them needs a season of exclusion history).
- **Styles:** the mockup rules are merged into `styles.css` under the app's existing tokens (the mockup's own palette is not copied).

**Impacted Units.**

| Unit                                                                                | Location                                | Action              |
| ----------------------------------------------------------------------------------- | --------------------------------------- | ------------------- |
| `GameViewService`                                                                   | `server/src/repo/game-view-service.ts`  | Create              |
| `GET /games/:id`                                                                    | `server/src/routes/api.ts`              | Modify              |
| `GameDetail`, `GameView` types, `api.game`                                          | `web/src/api.ts`                        | Modify              |
| `lib/money.ts`, `gameRows.ts`, `columns.ts`, `holdings.ts`, `counters.ts` (+ tests) | `web/src/lib/`                          | Create / Modify     |
| `GameBar`, `StateSteps`, `NextAction`, `PlayersTable`, `SidePanel`                  | `web/src/components/`                   | Create              |
| `useGameActions`                                                                    | `web/src/hooks/`                        | Create              |
| `GameDay.tsx`                                                                       | `web/src/pages/`                        | Modify              |
| `PlayerList`, `ConvocatoriaPanel` (from R2)                                         | `web/src/components/`                   | Delete              |
| styles                                                                              | `web/src/styles.css`                    | Modify              |
| `vitest` + `test` script                                                            | `web/package.json`, root `package.json` | Modify (permission) |
| e2e                                                                                 | `e2e/tests/*.spec.ts`                   | Modify / Create     |

**Test Methodology.** HLD §2.10. Server: `GameViewService` route test for each state's response (arrivals, points as of the game, `nextAction`). Web unit tests (once vitest is permitted) for every `lib/` module. E2E as above. Manual (HLD testability: "mostly"): on a real phone, open a game in `played` with 14 players, confirm the layout reads comfortably, the payment button is reachable by thumb without zooming, and the sticky bar keeps the state in view while scrolling; nothing persists.

**Data Contract Verification.** Reads only. `GET /games/:id` shape: `game` (F1/F2 columns), `state`, `nextAction`, `participations` (rows with `signed_up`, `played`, `paid_cents`, `team`, `note`), `convocatoria` (F3 `StoredConvocatoria`, entries with a nullable `player_id` and `guest_host_player_id`/`guest_ordinal` for an anonymous plus-one; the web type marks them so `buildRows` cannot dereference a missing player), `debts`, `payments` (F6), `arrivals`, `points`. A `cancelled` game exposes `cancelled_from`, which `buildRows` needs. Every `state` value has a row builder and a column set (a unit test iterates the `GameState` union).

**Patterns and Conventions.** Frontend standard throughout: hooks for data, `lib/` for pure calculation, composition per state instead of one component with a `state` switch, props narrow per component, no `api.*` inside rendering components.

**File Changes.** As the table; Delete: `PlayerList.tsx`, `ConvocatoriaPanel.tsx`, the old counters in `GameDay`.

#### F10 — Swap by dragging a row across the line

**Current Implementation.** No drag exists in the web (no dependency, `web/package.json`, `verified — source`). The move is `PUT /games/:id/convocatoria/members` (F4). Candidate libraries, checked with `npm view` (`verified — invocation`, 2026-10-06): `@dnd-kit/core` 6.3.1 (peer `react >=16.8`, last modified 2024-12-05) with `@dnd-kit/sortable` 10.0.0; `@dnd-kit/react` 0.5.0 (peer `react ^18 || ^19`, modified 2026-09-12, pre-1.0); `@hello-pangea/dnd` 18.0.1 (peer `react ^18 || ^19`). Touch behaviour of any of them is `assumed` until run.

**Approach.** The author chose a library for maintainability (`author decision`). Recommendation: `@dnd-kit/core` alone (no `sortable`: the gesture is "move this row to the other side of the line", i.e. a draggable row and two drop zones, not a reorder). It is stable and documents pointer, touch and keyboard sensors. The cost is that its last release is ten months old; the alternative `@dnd-kit/react` is active but pre-1.0. The choice is therefore **made replaceable**: the library is touched in one file.

- `components/MemberDnd.tsx` (new): exports `<MemberDnd onMove>` (a `DndContext` with a pointer sensor and a touch sensor with a short press-delay so a scroll is not a drag, plus the keyboard sensor), `<DragHandle memberKey>` (the grip cell) and `<DropZone playing>` (the two `tbody`s of the table). Its props are plain (`onMove(memberKey, playing)`); nothing else in the app imports the library (frontend standard §4).
- `PlayersTable` renders members and non-members as two `tbody`s inside `<DropZone>`s in states `convocatoria_created` / `convocatoria_confirmed`; the line is the boundary between them. Dropping on the other zone calls `useGameActions.move(memberKey, playing)` (F4), then reloads; the table stays mounted (S3). Moving someone in over the cap shows the server's "No quedan plazas" in the alert; a swap is two drags, out then in.
- **A non-drag control is added beside the grip**: a per-row "Meter" / "Sacar" button calling the same `move`. It is a reliable thumb-tap path whatever the library does on touch, and it gives S5 ("every row's action reachable with a thumb tap") a basis that does not depend on a gesture. It is an addition to the requirements, flagged in _Owed_.
- **Installing the library needs the author's explicit permission when this element is implemented**, with the library named then; until it is installed the buttons above already deliver every scenario except the drag gesture itself.

**Impacted Units.** `components/MemberDnd.tsx` (create); `PlayersTable` (modify, from F9); `web/package.json` (dependency, permission); `useGameActions.move` (F9/F4 client).

**Test Methodology.** HLD §2.10. E2E on desktop with real mouse events: drag a below-the-line row above the line, assert it is in the convocatoria and the table stayed; drag a member below; assert `cambiado a mano` on both; assert "No quedan plazas" on the 15th. The "Meter"/"Sacar" buttons get the same assertions on the phone viewport. **Manual** (touch cannot be driven faithfully by the e2e runner): on a real phone, press and hold a row's grip, drag it across the line, release; the table stays on screen, the label `cambiado a mano` appears, and the change is still there after a reload; then scroll the table with a thumb and confirm a scroll does not start a drag.

**Data Contract Verification.** Writes through `PUT …/members` only (F4): the body `{ member, playing }` with `member` = `{ playerId }` or `{ hostPlayerId, ordinal }`, taken from the row's key built in `gameRows`; `playing` boolean. Nothing is stored by the web.

**Patterns and Conventions.** Wrapper component isolating a third-party library (Dependency Inversion, functionally); accessibility through the keyboard sensor and real buttons.

**File Changes.** Create: `components/MemberDnd.tsx`. Modify: `PlayersTable.tsx`, `web/package.json` (permission). Tests: the e2e above. Delete / Migrate: none.

#### F11 — Played-state actions: payments, holder tag, teams paste

**Current Implementation.** Payment is the chip `jugó → debe → pagó` calling `PUT /games/:id/players/:id` (`GameDay.tsx`); the team paste is `FinalListPaste` + `useFinalListPaste` + `api.pasteFinalList`/`resolveFinalLine`, with `ResolveLine` (link / alias / register) and `SeniorityPrompt` (`verified — source`). `ResolveLine` is shared with `CandidateList`. The mockup `4-jugado.html` shows the payment cell as a "debe 4 €" chip and a "Marcar pagado" button, an "Otro importe…" button on single shares, an "↳ Invitado de Dani" sub-row, and a "Jugadores / Equipos" tab pair (`verified — document`); the author refined the rule in this design session (a holder's button pays everything they hold; a beneficiary pays their own share and the holder's amount drops; a "Deuda de <holder>" tag on the beneficiary's row, so the total is never read as 12 €).

**Approach.**

- `PaymentCell` (component) in the `Pago` column of the `played` table, driven by `holdings.ts` (F9): a row whose player **holds** shares shows `Pagar <total>` (e.g. "Pagar 8 €"), which sends every share they hold in one request with themself as payer (UC-003-06-S3c); a row whose own share is held by someone else shows `Pagar 4 €` for that share with the player as payer, plus the tag `Deuda de <holder>` (S3d, S3e); a settled share shows `Pagado <amount>`, plus `por <payer>` when the payer is not the beneficiary, and `Deshacer` (S5). A plus-one's share is a sub-row (`↳ Invitado de Dani`) with its own `Pagar 4 €` / `Pagado` / `Deshacer`. A single, unsettled share has `Otro importe…`: an inline field parsed by `parseEuros`, sent as `amountCents` (S4). Refusals (S6) are shown in the alert.
- `usePayments(gameId, reload)` (hook): `pay(shares, payerPlayerId, amountCents?)` → `POST /games/:id/payments`, `undo(paymentId)` → `DELETE`, both then `reload`.
- Teams: `TeamsPanel` (replaces `FinalListPaste`) is the `Equipos` tab / side card in `played`: a textarea ("Pega los equipos"), a button "Registrar equipos", the result (`matched` by team, `outside` lines, `ignored` plus-ones, and `unresolved` lines through the shared `ResolveLine` with its `register` option switched off by a prop), and a note that teams are optional (S5). `useTeamsPaste(gameId, onChanged)` replaces `useFinalListPaste` and calls `POST …/teams/paste` and `…/teams/paste/resolve` (F7). The `Equipo` column of the table shows the chip from `participations.team`. `SeniorityPrompt` stays with `CandidateList`; the team panel has no seniority prompt (F7).
- `api.ts`: add `pay`, `undoPayment`, `pasteTeams`, `resolveTeamLine`, `teams`, `setTeams`; remove `pasteFinalList` and `resolveFinalLine` (their server routes are deleted in F12, after this).

**Impacted Units.** `PaymentCell`, `TeamsPanel` (create); `usePayments`, `useTeamsPaste` (create); `ResolveLine` (modify: `allowRegister` prop); `PlayersTable` (modify, from F9); `web/src/api.ts`; delete `FinalListPaste.tsx`, `useFinalListPaste.ts` (F12 verifies none remain).

**Test Methodology.** HLD §2.10. Unit (once vitest is permitted): `holdings.ts` and the cell's label function (the matrix of own share / held shares / settled / payer). E2E: a played game with a host who has a plus-one and a named guest: the host's button reads 8 € and the guest's row reads 4 € with the tag `Deuda de <host>` (S3e: the counter says 8 €, not 12 €); clicking the guest's button lowers the host's to 4 €; clicking the host's pays what remains; `Deshacer` restores; an odd amount `3,75`; payments refused in a non-played game (the buttons are absent and the server refusal is shown if forced); the team paste (headings, a name outside the convocatoria, an unmatched name resolved by choosing a player) changes only the `Equipo` column; recording a payment never asks for teams (UC-003-07-S5). No manual part.

**Data Contract Verification.** Writes: `POST /games/:id/payments` body `{ shares: ({ beneficiary_player_id } | { holder_player_id, guest_ordinal })[], payer_player_id, amount_cents?, paid_on? }`, built from the debt rows' own columns (so a share is named exactly as the server stored it); `DELETE …/payments/:id` from a payment row's `id`; `POST …/teams/paste` `{ text }`; `…/teams/paste/resolve` `{ line, field, team, action }`. Reads: `debts`, `payments`, `participations.team` (F9). Euros are converted to cents only in `parseEuros`; no float reaches the API.

**Patterns and Conventions.** Composition over `mode` props (`ResolveLine` gets one narrow prop, not a mode); one hook per use case; pure formatting in `lib/`.

**File Changes.** Create: `components/PaymentCell.tsx`, `TeamsPanel.tsx`, `hooks/usePayments.ts`, `useTeamsPaste.ts`. Modify: `ResolveLine.tsx`, `PlayersTable.tsx`, `api.ts`. Delete: `FinalListPaste.tsx`, `useFinalListPaste.ts`. Migrate: none.

## 4. Documentation Impact

Each entry says what stops being true and what replaces it. A document that ships (everything outside `specs/`) is written without any identifier that only resolves inside this work package: no use-case, decision or work-package ids, in the text it receives.

#### `AGENTS.md`

- _Domain invariants_, "A game goes candidates → convocatoria → final list, and only the final list records what happened": stops being true. Replaced by: a game has five states (Abierto, Convocatoria creada, Convocatoria confirmada, Jugado, Cancelado); the convocatoria is the final list, and who played is derived from it when the game is marked as played; `PlayedOutcomeEffect` is the writer of `played` and of exclusion points, `PaymentService` of payments, `TeamAssignmentService` of `team`; `CandidateResolutionService` still writes `signed_up` and `guest_candidates` on save.
- _Domain invariants_, "Convocatorias are frozen: … `rules_json` plus every entry": revised: a convocatoria is stored when created and stamped when confirmed; hand corrections change only `playing`, never the algorithm's `outcome`.
- _Domain invariants_, "The legacy `*` meant three things; they are separate columns": add that payment is a debt row (`share_debts`) until settled and a `payments` row after, and `paid_cents` is the player's own share settled by whoever paid it.
- _Architecture_ block (`FinalListParser`, `FinalListResolutionService`): replaced by `GameLifecycle`, `PlayedDerivation`, `DebtLedger`, `GameLifecycleService`, `ConvocatoriaService`/`ConvocatoriaEditService`, `PaymentService`, `TeamAssignmentService`/`TeamPasteService`, `GameViewService`, `ConvocatoriaHistoryConverter`.
- _db/_: "an edit to an existing table needs the local DB file deleted or `npm run seed -- --reset`": half wrong, corrected. `--reset` only removes the imported season's rows; a changed table definition needs the DB file (and its `-wal`, `-shm`) deleted. "No migration system" stays true.
- _Web_: "React 18" is stale (`web/package.json` has React 19); `App.tsx`/`GameDay` description updated to the lifecycle screen.
- _Commands_: `npm test` also runs the web unit tests once `vitest` is added to that workspace.

#### `docs/domain-model/ciclo-del-partido.md`

§2 Convocatoria and §3 Lista final, and "Partidos del pasado": the order of the match and its states replace them. Written: the five states and their transitions (cancel from any state, undo returns to the state left), who may edit what in each, the convocatoria created, corrected by hand and confirmed, who played derived on marking the game as played (with the exclusion point table), payment after the game, the team paste as an optional later step, and a game dated in the past following the same path. The diagram `game-states.puml` content is carried in prose or copied under `docs/`.

#### `docs/domain-model/convocatoria.md`

The note "quién jugó y quién pagó lo fija la lista final" stops being true: who played is read from the convocatoria at the moment the game is marked as played; payments are recorded separately. Add hand corrections (`changed by hand` derived from `playing` ≠ outcome) and anonymous plus-ones as entries.

#### `docs/domain-model/points.md`

§1 ("una lista final resuelta") and the §2 retraction paragraph: a game counts for a player when their own share is settled, by whoever paid it; an exclusion point stands while the game is played and the player is signed up and out of the convocatoria; a point is retracted when the game is reopened or cancelled and restored when marked played again.

#### `docs/domain-model/glossary.md`

_Claros y Oscuros_: they head the team-recording step, not "la lista final". New entries: _Convocatoria creada / confirmada_, _Jugado_, _Cancelado_, _deuda_ (a share owed, with holder and beneficiary), _plaza de gracia_, _degradado_, _cambiado a mano_.

#### `docs/domain-model/README.md`

Index line for `ciclo-del-partido.md`: wording follows the new title and scope.

#### `README.md`

The "Lista final" bullet under _Qué hace_ is replaced by: lifecycle of a game, convocatoria edited by hand, payments by share, teams optional. The developer-setup section (moved to docs earlier) is untouched.

#### `docs/test-strategy.md`

- Unit layer: web unit tests exist for `web/src/lib/` (pure functions, no DOM) once `vitest` is installed in that workspace; the sentence about `web/src/**/*.test.tsx` is made accurate.
- Integration layer: add the query-plan tests (`EXPLAIN QUERY PLAN`) as the way to guard that a read uses an index and stays off a growing table.
- E2E layer: the lifecycle walk and the per-state checks at a desktop and a phone viewport; the drag is driven with mouse events and touch is manual.

#### `.agents/rules/frontend-coding-standard.md`

The paragraph that cites `GameDay.tsx (324 lines)` as the example of what the standard prevents: stale after the split (the file is 437 lines today and is reduced by R2); updated to name the new components, hooks and `lib/` modules as the worked example.

#### WP-001 `REQUIREMENTS.md` and `DESIGN_PLAN.md`

N2 (the final list as the record of what happened), N3, UC-001-05, UC-001-06 and UC-001-07 are retracted or revised in place by identifier, each with a one-line pointer to the replacing behaviour; their elements in WP-001's design that wrote `played`/`paid_cents` from a paste are marked retracted with the replacing document named. Surviving identifiers keep their numbers; the argument of a retracted one is deleted.

`docs/domain-model/legacy-script-review.md` mentions the "lista final" only as the sheet's output: stays true, no change.

---

## Owed to the author

**Decisions:** none open. Rulings taken (`author decision`, 2026-10-06): recreate the database, no upgrade path or workaround; debts as rows removed when paid, with debt queries that do not slow down as history grows; a drag library; imported plus-one payments left unrecorded ("the easier"); UC-003-06 gains the payer and the host/guest scenarios S3c–S3e; UC-003-09-S7 retired.

**Answers:** none carried from the study.

**Confirmations (all presented with the group they came from and approved as written; listed so none is lost):**

- _Lifecycle, convocatoria (F2–F4):_ anonymous plus-ones are convocatoria entries that take slots and can be moved like players (`inferred`); refusal messages not in the requirements are `inferred` from those that are ("Crea la convocatoria antes de confirmarla" / "…de editarla", "El partido ya está jugado / cancelado", "El partido no está jugado / cancelado", "<nombre> no está apuntado", "Marca el partido como jugado antes de pegar los equipos"); recreating the convocatoria warns only when hand corrections exist.
- _Played, money (F5–F6):_ a `mercy` seat taken out by hand earns a `points` exclusion (`inferred`); the payer must be the share's holder or beneficiary; undoing restores the debt at the season's current share; the imported own share is `value − guests × share`; payments use the local date (`LocalCalendar`) where `ParticipationRepository.set` uses the UTC date today.
- _Teams, retirement (F7, F12):_ an `X +1` line in a team paste is reported and ignored (`inferred`); teams are a resource (`GET`/`PUT /games/:id/teams`) with the paste as a sub-resource, so a generator is a sibling route later; F12 is cut last, and `ScheduleResolver.cutoffFor` and `LocalCalendar.dateTimeOf` are deleted if find-references confirm they are dead.
- _History (F8):_ the conversion fails loudly and rolls back if the algorithm throws for any game; `ConvocatoriaService.store(gameId, source)` is split out of `create`; converted games carry `confirmed_at` = the moment of the seed and `source = 'history'`. The `assumed` that standings can be read "as of that game" is verified in F8's tests and the seed check.
- _Screen (R2, F9–F11):_ R2 is cut with the first group, before the first element that changes server behaviour; the drag library recommendation is `@dnd-kit/core` 6.3.1 alone, wrapped in one file; installing it, and adding `vitest` to the web workspace, each need the author's explicit permission when implemented; a per-row "Meter"/"Sacar" button beside the grip; below 600 px arrival, points and team fold under the name; counters: pagados = shares settled, deuda = sum of debts; `GET /games/:id` returns `arrivals` and `points` as of that game; three existing e2e specs are rewritten, `plaza de gracia` and `degradado` are covered by unit tests.

**Amended while drafting (settled elements re-opened in place):** F1 rebuilds `convocatoria_entries` so anonymous plus-ones are entries, and identifies an anonymous plus-one's share by (holder, ordinal) instead of a list position, which a list edit would shift; R1's repository types follow.

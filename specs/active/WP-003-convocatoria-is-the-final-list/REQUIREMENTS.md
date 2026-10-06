# Requirements — WP-003-convocatoria-is-the-final-list

## 1. Use Case Audit

**Component:** the game lifecycle — from creating a game to its end state — and what each state allows.

**Variants** (from `study/variants.md`): `scheduled` future, `scheduled` past, `played`, `cancelled`, a second game on one date ("Bis"), a game with no convocatoria (all 48 imported games), a game with a convocatoria. Payment: standard share, multiple (plus-ones), odd amount, debt, signed up and did not play, late payment, no partial payment.

**Covered:** every need in `VISION.md` (table below). **Not covered:** team statistics, the points and mercy rules, how the convocatoria is generated (`VISION.md` §3).

| Need                                                                                | Answered by          |
| ----------------------------------------------------------------------------------- | -------------------- |
| N1 The game follows the real order; each fact entered once                          | UC-003-01, UC-003-03 |
| N2 The convocatoria is the final list: generated, or edited by hand as a correction | UC-003-03, UC-003-04 |
| N3 Who played is computed, with the exclusion point                                 | UC-003-05            |
| N4 A player enters the convocatoria only if already in the apuntados                | UC-003-04            |
| N5 The Claros/Oscuros paste records only the team                                   | UC-003-07            |
| N6 Payments are recorded as part of the same game                                   | UC-003-06            |
| N7 See the game's state and the next action                                         | UC-003-01            |
| N8 Game view comfortable through the lifecycle, phone and desktop                   | UC-003-10            |
| Q1 Standings and exclusion points equal WP-001's                                    | UC-003-05            |
| Q2 Past games need no re-entry, no special-case branch                              | UC-003-09            |
| Scope: state machine to its end state, including cancelled                          | UC-003-01            |

No row is empty.

## 2. Use Cases

Diagrams: [`requirements/diagrams/use-cases.puml`](requirements/diagrams/use-cases.puml) (actors and use cases) and [`requirements/diagrams/game-states.puml`](requirements/diagrams/game-states.puml) (the states of UC-003-01 and their transitions). UC-003-02 and UC-003-08 are retired and do not appear.

### UC-003-01 — See the game's state and the next action

- **Actor:** the organiser.
- **Goal:** know at any moment which state the game is in and what to do next, and move the game between states.
- **Graduation:** hard requirement.
- **Rests on:** Q-04 (game situations), Q-01 (`status` writers). Decisions D1, D2, D4 of `requirements/agenda.md` (`author decision`).

**States.** `Abierto` (no convocatoria yet), `Convocatoria creada` (calculated, not confirmed), `Convocatoria confirmada`, `Jugado`, `Cancelado`.

#### UC-003-01-S1 — The state and the next action are shown (outline)

Given a game in state <state>
When the organiser opens the game
Then the game shows the state <state> and the next action <next action>

| state                   | next action                                                 |
| ----------------------- | ----------------------------------------------------------- |
| Abierto                 | Crear convocatoria                                          |
| Convocatoria creada     | Confirmar convocatoria                                      |
| Convocatoria confirmada | Marcar como jugado                                          |
| Jugado                  | Registrar pagos (while any player in the convocatoria owes) |
| Cancelado               | Deshacer cancelación                                        |

#### UC-003-01-S2 — Mark a game as played

Given a game in state Convocatoria confirmada with 14 players in the convocatoria
When the organiser marks the game as played
Then the game is in state Jugado and its apuntados and convocatoria accept no edits

#### UC-003-01-S3 — Marking as played is refused without a confirmed convocatoria

Given a game in state Abierto with 12 apuntados
When the organiser marks the game as played
Then the game stays in state Abierto and the organiser sees "Confirma la convocatoria antes de marcar el partido como jugado"

#### UC-003-01-S4 — Editing a played game is refused

Given a game in state Jugado
When the organiser removes a player from its convocatoria
Then the convocatoria is unchanged and the organiser sees "Reabre el partido para editarlo"

#### UC-003-01-S5 — Reopen a played game

Given a game in state Jugado
When the organiser reopens the game
Then the game is in state Convocatoria confirmada and its apuntados and convocatoria accept edits again

#### UC-003-01-S6 — Cancel a game (outline)

Given a game in state <state>
When the organiser cancels the game
Then the game is in state Cancelado, accepts no edits and counts for nothing in standings or debt

| state                   |
| ----------------------- |
| Abierto                 |
| Convocatoria creada     |
| Convocatoria confirmada |
| Jugado                  |

#### UC-003-01-S7 — Undo a cancellation (outline)

Given a game cancelled while in state <state>
When the organiser undoes the cancellation
Then the game is in state <state>

| state                   |
| ----------------------- |
| Abierto                 |
| Convocatoria creada     |
| Convocatoria confirmada |
| Jugado                  |

**Claims.** `verified — document`: today's states are `scheduled`, `played`, `cancelled`, no screen sets `cancelled`, and standings and debt skip cancelled games (`study/writers-and-readers.md`, `study/variants.md`). `author decision`: manual `played`, reopen-to-edit, cancel from any state and undoable (D1, D2, D4); the five state names; "Convocatoria creada" is a stored state; S3 (no `played` without a confirmed convocatoria); graduation `hard requirement` (interview 3, confirmed 2026-10-05).

- ~~UC-003-02~~ — withdrawn by the author (2026-10-05): the apuntados work today and do not change in this work package. The one rule it carried that still binds, the convocatoria being a subset of the apuntados, is UC-003-04-S7.

### UC-003-03 — Create and confirm the convocatoria

- **Actor:** the organiser.
- **Goal:** get the 14 who play from the apuntados and freeze them.
- **Graduation:** hard requirement.
- **Rests on:** Q-02 (what `commit` freezes), `AGENTS.md` (convocatorias are frozen). Decision D5 (`author decision`). The selection algorithm is out of scope (`VISION.md` §3).

#### UC-003-03-S1 — Create the convocatoria (outline)

Given a game in state Abierto with <apuntados> players signed up
When the organiser creates the convocatoria
Then the game is in state Convocatoria creada, showing <in> in and <out> out, ranked with their points, and nothing is frozen

| apuntados | in  | out |
| --------- | --- | --- |
| 12        | 12  | 0   |
| 14        | 14  | 0   |
| 16        | 14  | 2   |

#### UC-003-03-S2 — Creating with nobody signed up is refused

Given a game in state Abierto with no apuntados
When the organiser creates the convocatoria
Then the game stays in state Abierto and the organiser sees "No hay nadie apuntado"

#### UC-003-03-S3 — Confirm the convocatoria

Given a game in state Convocatoria creada with 14 in and 2 out
When the organiser confirms the convocatoria
Then the game is in state Convocatoria confirmada and the selection is frozen with the rules in force and each player's points as the algorithm saw them

#### UC-003-03-S4 — Creating again discards hand corrections

Given a game in state <state> in which the organiser swapped 2 players by hand
When the organiser creates the convocatoria again and accepts the warning "Se perderán tus correcciones"
Then the game is in state Convocatoria creada with a freshly calculated selection and the hand corrections are gone

| state                   |
| ----------------------- |
| Convocatoria creada     |
| Convocatoria confirmada |

**Claims.** `verified — document`: a confirmed convocatoria stores `rules_json` and one entry per real player with position, points, wait counter and outcome; anonymous guests are not stored; re-commit rewrites it and discards manual changes (`study/convocatoria-and-exclusions.md`). `author decision`: the button name "Crear convocatoria". `assumed`: that "Crear convocatoria" is the old "Simular" and shows without freezing (confirmed in interview 3 only as a reading); S2 (no apuntados is refused); S4 (recreating is allowed from a created or confirmed game, with a warning).

### UC-003-04 — Correct the convocatoria by hand

- **Actor:** the organiser.
- **Goal:** change who is in the convocatoria, before confirming it or after, because something changed before the game.
- **Graduation:** hard requirement.
- **Rests on:** Q-02 (a hand edit has nowhere to live today). Decision D3 (`author decision`).

#### UC-003-04-S1 — Swap a player in for one out (outline)

Given a game in state <state> with 14 in the convocatoria, Marta signed up and below the line after the 14th row
When the organiser drags Marta above the line and Raúl below it
Then Marta is in the convocatoria, Raúl is not, and both stay signed up

| state                   |
| ----------------------- |
| Convocatoria creada     |
| Convocatoria confirmada |

#### UC-003-04-S2 — Take a player out

Given a game in state Convocatoria creada with 14 in the convocatoria
When the organiser drags Raúl below the line
Then the convocatoria has 13 players and Raúl stays signed up

#### UC-003-04-S3 — A player who is not signed up cannot be in the convocatoria

Given a game in state Convocatoria creada and Pepe on the roster but not signed up
When the organiser opens the convocatoria
Then Pepe is not in the table and cannot be put in the convocatoria until he is signed up

#### UC-003-04-S4 — Going over the slots is refused

Given a game in state Convocatoria confirmada with 14 in the convocatoria and 14 slots
When the organiser drags a 15th signed-up player above the line without dragging anyone below it
Then the convocatoria is unchanged and the organiser sees "No quedan plazas"

#### UC-003-04-S5 — Confirming after hand corrections

Given a game in state Convocatoria creada in which Marta was swapped in for Raúl by hand
When the organiser confirms the convocatoria
Then the frozen selection shows what the algorithm chose, and Marta's and Raúl's entries are marked as changed by hand

#### UC-003-04-S6 — A correction after confirming stays auditable

Given a game in state Convocatoria confirmada
When the organiser drags Marta above the line and Raúl below it
Then the frozen selection still shows what the algorithm chose, and Marta's and Raúl's entries are marked as changed by hand

#### UC-003-04-S7 — Removing from the apuntados a player who is in the convocatoria is refused (outline)

Given a game in state <state> in which Ana is signed up and in the convocatoria
When the organiser removes Ana from the apuntados
Then Ana stays signed up and in the convocatoria and the organiser sees "Quítalo primero de la convocatoria"

| state                   |
| ----------------------- |
| Convocatoria creada     |
| Convocatoria confirmada |

**Claims.** `verified — document`: no edit of an entry exists today (`study/convocatoria-and-exclusions.md`). `author decision`: the convocatoria is edited by dragging rows across the line (interview 9); it is always a subset of the apuntados and edited independently, with the refusal message (D3); hand edits allowed in both Convocatoria creada and Convocatoria confirmada (interview 4, 2026-10-05); S2, S4 as written, S5, S6 and the 14-slot cap are confirmed ("look good"); graduation `hard requirement`. `inferred` from `VISION.md` §5 (frozen convocatorias stay auditable): S5 and S6.

### UC-003-05 — Derive who played and the exclusion point

- **Actor:** the organiser, who marks the game as played; the system derives the rest.
- **Goal:** record who played and who earns an exclusion point without pasting a final list.
- **Graduation:** hard requirement.
- **Rests on:** Q-02, Q-03 (exclusions today), Q-01 (`played` is not read by points). The "Decision (author)" block of `study/convocatoria-and-exclusions.md` (`author decision`).

**Rule.** When the game is marked as played: a signed-up player in the convocatoria played; a signed-up player not in it did not and earns an exclusion point; a player in the convocatoria earns the attendance point only once they pay (paid games count, not appearances).

#### UC-003-05-S1 — Played and exclusion point per case (outline)

Given a game in state Convocatoria confirmada in which a signed-up player is <case>
When the organiser marks the game as played
Then that player's played flag is <played> and they earn <exclusion point>

| case                                               | played | exclusion point                  |
| -------------------------------------------------- | ------ | -------------------------------- |
| in the convocatoria, chosen by the algorithm       | yes    | none                             |
| left out by the algorithm (`excluded`)             | no     | 1, kind `points`                 |
| demoted by the algorithm (`demoted`) and still out | no     | 1, kind `demoted`                |
| chosen by the algorithm and taken out by hand      | no     | 1, kind `points`                 |
| left out by the algorithm and put in by hand       | yes    | none                             |
| in the convocatoria through the mercy seat         | yes    | none (a mercy seat never scores) |

#### UC-003-05-S2 — The attendance point waits for the payment

Given a game in state Jugado in which Ana is in the convocatoria and has not paid
When the organiser opens the standings
Then Ana has 0 paid games for this game and appears as owing

#### UC-003-05-S3 — Same outcome, same standings as WP-001

Given 16 signed up, 14 in the convocatoria, 2 out, and the 14 paid
When the organiser marks the game as played
Then the standings and exclusion points equal those WP-001's final-list flow produced for the same 14 who played

#### UC-003-05-S4 — Reopening retracts what was derived

Given a game in state Jugado with Luis out of the convocatoria holding 1 exclusion point from it
When the organiser reopens the game
Then no player has a played flag or an exclusion point from this game, and recorded payments are kept

#### UC-003-05-S5 — Marking as played again recomputes

Given a game reopened, in which the organiser swapped Marta in for Raúl by hand
When the organiser marks the game as played again
Then Marta is recorded as played with no exclusion point and Raúl as not played with 1 exclusion point

**Claims.** `verified — document`: points count paid games (`paid_cents > 0`), `played` feeds only `gamesPlayed` and debt; today's reconcile retracts the point of an `excluded` or `demoted` player who played, never penalises a swapped-out `called_up` player and never retracts `mercy`; only kinds `points` and `demoted` score (`study/writers-and-readers.md`, `study/convocatoria-and-exclusions.md`, `AGENTS.md`). `author decision`: the rule and its three cases (study interview); derivation at the moment of marking as played; reopening keeps payments; "mercy seat" is a mercy player inside the convocatoria; graduation `hard requirement` (interview 5, 2026-10-05).

- ~~UC-003-08~~ — retired (2026-10-05): cancelling and undoing a cancellation are UC-003-01-S6 and S7. Never reused.

### UC-003-06 — Record payments after the game

- **Actor:** the organiser.
- **Goal:** record who has paid their share of a played game, and see who still owes.
- **Graduation:** hard requirement.
- **Rests on:** Q-05 (payment situations), Q-01 (`paid_cents`, `paid_on` writers). Interview 2 decisions (`author decision`).

**Rules.** Payment is collected and recorded after the game. A debt has a holder (who answers for it) and a beneficiary (whose share it is); either can pay it, and the payment records who did (author, 2026-10-06). A named guest's share is held by their host. The payment button of a row shows what that row's player holds; the beneficiary's row also shows the share with a tag naming the holder, and the outstanding total counts each share once. A player in the convocatoria owes the standard share (`price_cents / slots`) until marked paid. A player's unknown plus-one adds one share to the **host's** debt. A row with plus-ones has one line per share (the host's own and each plus-one's), and each share is paid or not paid, so the host can pay less than the total owed; when the plus-one pays their own share, that amount comes off what the host owes. A single share cannot be partly paid; an odd amount for it is an adjustment. Listing a player is no longer the same as paying.

#### UC-003-06-S1 — Mark a player as paid

Given a game in state Jugado, a standard share of 4 €, and Ana in the convocatoria owing 4 €
When the organiser marks Ana as paid on 2026-10-07
Then Ana's row records 4 € (400 cents) paid on 2026-10-07 and the game counts as a paid game for her

#### UC-003-06-S2 — See who owes

Given a game in state Jugado with 14 in the convocatoria, 3 of them paid
When the organiser opens the game
Then the game shows 11 players owing and 44 € outstanding

#### UC-003-06-S3 — A plus-one is a share on the host's row

Given a game in state Jugado, a share of 4 €, and Dani signed up with a `Dani +1` line and in the convocatoria
When the organiser opens the game
Then Dani's row shows two shares of 4 €, his own and "Invitado de Dani", and Dani owes 8 €

#### UC-003-06-S3b — The host pays less than the total (outline)

Given Dani owing 8 € for two shares in a game in state Jugado
When the organiser marks <share> as paid
Then Dani owes <owed> and <point>

| share                | owed | point                                                        |
| -------------------- | ---- | ------------------------------------------------------------ |
| his own share        | 4 €  | his own paid game counts for him                             |
| the plus-one's share | 4 €  | his own paid game does not count until his own share is paid |

#### UC-003-06-S3c — The host pays everything they hold

Given a game in state Jugado, a share of 4 €, Dani holding two shares (his own and the one of "Invitado de Dani"), so Dani's payment button reads 8 €
When the organiser clicks Dani's 8 € button
Then both shares are settled, each as paid by Dani, and Dani owes nothing

#### UC-003-06-S3d — A guest pays their own share, and the host's debt drops

Given a game in state Jugado, a share of 4 €, Ana holding two shares (her own and Marta's, a named guest in the convocatoria), so Ana's button reads 8 € and Marta's row shows 4 € with the tag "Deuda de Ana"
When the organiser clicks Marta's 4 € button
Then Marta's share is settled as paid by Marta, Marta's paid game counts for Marta, Ana's button reads 4 €, and the game's outstanding total drops by 4 €

#### UC-003-06-S3e — A debt held by someone else is never counted twice

Given the game of S3d before any payment
When the organiser opens the game
Then the outstanding total is 8 € (not 12 €), Ana's row shows 8 € and Marta's row shows 4 € tagged "Deuda de Ana"

#### UC-003-06-S4 — An odd amount is an adjustment

Given a game in state Jugado with Ana owing 4 €
When the organiser records 3,75 € paid for Ana
Then Ana's row is settled with 3,75 € (375 cents) and no partial balance remains

#### UC-003-06-S5 — Undo a payment

Given a game in state Jugado with Ana marked paid 4 €
When the organiser marks Ana as not paid
Then Ana owes 4 € again and her payment date is cleared

#### UC-003-06-S6 — Payment is refused where it cannot apply (outline)

Given <situation>
When the organiser marks Ana as paid
Then Ana's row is unchanged and the organiser sees <message>

| situation                                                         | message                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| a game in state Convocatoria confirmada, Ana in the convocatoria  | "Marca el partido como jugado antes de registrar pagos" |
| a game in state Jugado, Ana signed up but not in the convocatoria | "Ana no estaba en la convocatoria"                      |
| a game in state Cancelado                                         | "El partido está cancelado"                             |

**Non-behavioural.** Money is stored as integer cents. The screen shows euros, whole when they are whole and with decimals otherwise ("4 €", "3,5 €", "3,75 €"), and accepts them the same way; fractions exist so that a change of the game's price mid-season works (the price is 4 € today).

Money is integer cents; `paid_on` is when the money arrived (`VISION.md` §5). Recording a payment does not count as an edit of the apuntados or the convocatoria, so it is allowed in state Jugado (UC-003-01-S4).

**Claims.** `verified — document`: payment today is set by the "jugó → debe → pagó" chip and automatically to a full share for everyone on a pasted final list, plus-ones multiply it, there are 12 played-not-paid rows and no partial payments in the data (`study/variants.md`, `study/writers-and-readers.md`). `author decision`: payment after the game, host debt for plus-ones (interview 2); a host can pay less than the total, and the plus-one's payment comes off the host's debt (interview 9), which replaces the interview 2 rule of no partial payment for rows with plus-ones. `author decision`: euros on screen, cents in the database, price 4 € today (interview 5). `verified — document`: an `Anfitrión +1` line in the apuntados is an anonymous companion (`docs/domain-model/ciclo-del-partido.md` §1). `inferred`: the plus-one in S3 comes from that line; **S3b's `point` column** (the attendance point depends on the host's own share, not on the plus-one's) is `assumed`. Interview 6 (2026-10-05): the `Ana +1` line is the plus-one source; S5, S6 and its three messages confirmed; graduation `hard requirement`. Seniority for first-time players is handled today and does not change in this work package.

### UC-003-07 — Record the teams

- **Actor:** the organiser.
- **Goal:** record which team (Claros or Oscuros) each player was on, as an optional later step.
- **Graduation:** hard requirement.
- **Rests on:** Q-01 (`team` writers), Q-07 (the final-list paste today). `VISION.md` §2 (`author decision`).

#### UC-003-07-S1 — Paste the two teams

Given a game in state Jugado with 14 in the convocatoria
When the organiser pastes a Claros list of 7 names and an Oscuros list of 7 names, all in the convocatoria
Then each of the 14 has the team of its list and nothing else about the game changes: played flags, payments, exclusion points and apuntados stay as they were

#### UC-003-07-S2 — A name outside the convocatoria gets no team

Given a game in state Jugado, Marta on the roster and signed up but not in the convocatoria
When the organiser pastes a Claros list that includes Marta
Then Marta's line is kept as text only, with no team and no change to her row

#### UC-003-07-S3 — An unmatched or ambiguous name stays unresolved

Given a game in state Jugado
When the organiser pastes an Oscuros list with 1 name that matches nobody and 1 that matches two players
Then both lines stay unresolved, kept as text only, and no player gets a team from them until the organiser resolves them

#### UC-003-07-S3b — Resolve an unresolved team line

Given an unresolved Oscuros line "Pepito" in a game in state Jugado, and Pepe in the convocatoria
When the organiser chooses Pepe for that line
Then Pepe has the team Oscuros

The resolution works as for the apuntados (`docs/domain-model/ciclo-del-partido.md` §1): choose the player for that line only, or choose them and remember the nickname. Registering a new player is not offered here, since a player must already be in the convocatoria.

#### UC-003-07-S4 — Pasting again replaces the teams

Given a game in state Jugado with teams recorded
When the organiser pastes the two lists again
Then the teams recorded before are replaced by those of the new paste

#### UC-003-07-S5 — Teams are optional

Given a game in state Jugado with no team recorded
When the organiser records a payment
Then the payment is recorded and nothing asks for teams

**Claims.** `verified — document`: today `team` is written only by the final-list paste and the pasted final list also sets played, payment and guests (`study/writers-and-readers.md`). `author decision`: the paste stays and records only the team (`VISION.md` §2); unmatched or ambiguous names are handled as in the apuntados (interview 5). The paste is allowed in state Jugado, and only there; S4 (replace) and S5 confirmed; graduation `hard requirement` (interview 6, 2026-10-05).

### UC-003-09 — Give past games a convocatoria

- **Actor:** `npm run seed`, which runs the history conversion whenever the database is rebuilt.
- **Goal:** have a convocatoria in the database for every imported game, so the design carries no branch for games that predate it. It exists only to have something stored.
- **Graduation:** throwaway (author: "I don't care, this is just to have something in the database").
- **Rests on:** Q-04 (every imported game has no convocatoria), Q-02. Interview 7 decision (`author decision`).

**Rule.** The conversion runs the convocatoria algorithm, game by game in date order, over the players signed up to each played game with no convocatoria, and freezes the result. Only 14 play, so no convocatoria holds more than 14. Nothing the import already recorded is changed: no played flag, payment, payment date, exclusion or `signed_up`, and the conversion writes no exclusion from these convocatorias.

#### UC-003-09-S1 — Seed a played game

Given an imported game in state Jugado with 16 signed up and no convocatoria
When the seed runs the history conversion
Then the game has a frozen convocatoria with 14 in and 2 out as the algorithm chooses with the points as of that game, marked as generated by the conversion, and the game stays in state Jugado

#### UC-003-09-S2 — The convocatoria never holds more than 14 (outline)

Given an imported game in state Jugado with <signed up> signed up
When the seed runs the history conversion
Then its convocatoria has <in> in

| signed up | in  |
| --------- | --- |
| 10        | 10  |
| 14        | 14  |
| 15        | 14  |
| 16        | 14  |

#### UC-003-09-S3 — History is untouched

Given the 39 played games of the 2024/2025 import, with their standings and exclusions
When the seed runs the history conversion
Then every played flag, `paid_cents`, `paid_on`, `signed_up` and exclusion row is the same as before and the standings are equal to those before it ran

#### UC-003-09-S4 — The converted convocatoria does not rewrite who played

Given an imported game in which Ana played and the algorithm leaves her out
When the seed runs the history conversion
Then Ana's played flag stays set and her entry in the convocatoria is out

#### UC-003-09-S5 — Running it again changes nothing

Given a database already converted
When the seed runs the history conversion again
Then no convocatoria is added, replaced or altered

#### UC-003-09-S6 — Cancelled and open games are left alone (outline)

Given a game in state <state> with no convocatoria
When the seed runs the history conversion
Then the game gets no convocatoria and stays in state <state>

| state     |
| --------- |
| Cancelado |
| Abierto   |

- ~~UC-003-09-S7~~ — retired (2026-10-06): the author ruled that the database may be recreated, so there is no live database to keep. Never reused.

#### UC-003-09-S8 — A game dated in the past follows the normal lifecycle

Given a game dated 2025-03-12 created now in state Abierto
When the organiser signs players up, creates and confirms the convocatoria and marks the game as played
Then the game reaches state Jugado with no step or rule that exists only for past dates

**Non-behavioural.** The database may be recreated: `schema.sql` is edited in place and `npm run seed -- --reset` rebuilds it (author, 2026-10-06, replacing interview 8). The seed runs the conversion after importing.

**Claims.** `verified — invocation`: in the live database the 39 played games have between 10 and 15 players with `played = 1`, no row has `played = 1` with `signed_up = 0`, the 9 cancelled games have no participation row signed up or played, and 1 game is `scheduled`: game 49, dated 2026-09-07, with 14 participations signed up, 14 candidate lines and no convocatoria (read-only query of `data/pachanguero.db`, 2026-10-05). `verified — document`: all 48 imported games have no convocatoria; 54 imported exclusions exist already (`study/variants.md`); every imported row is signed up. `author decision`: run the algorithm, cap 14, no graduation (interview 7); run it from the seed (interview 8, amended 2026-10-06: no run on a live database). `assumed`: that the algorithm can be evaluated with the points as of each game's date (the design verifies it, since the standings read today's payments); that a seeded convocatoria may disagree with who the history says played (S4); S8.

### UC-003-10 — Use the game screen by lifecycle phase

- **Actor:** the organiser, on a desktop or on a phone.
- **Goal:** run the whole game from one screen that shows the state, the next action and the players, without a long vertical scroll.
- **Graduation:** hard requirement for S1–S5; S6 `document`.
- **Rests on:** Q-07 (what the screen holds and which e2e specs depend on it). `VISION.md` §4 (`author decision`). Mockups: [`requirements/examples/game-screen.md`](requirements/examples/game-screen.md), `not yet built`.

#### UC-003-10-S1 — State and next action are always in view (outline)

Given a game in state Convocatoria creada with 18 players listed, on a screen <screen>
When the organiser opens the game
Then the state and its next action button are visible without scrolling, and stay visible while the players are scrolled

| screen              |
| ------------------- |
| desktop, 1280 × 800 |
| phone, 390 × 844    |

#### UC-003-10-S2 — One table of players, whose columns follow the state (outline)

Given a game in state <state>
When the organiser opens the game
Then one table shows the players with the columns <columns>, ordered <order>

| state                   | columns                                                  | order                                                          |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| Abierto                 | arrival, player, points                                  | arrival order                                                  |
| Convocatoria creada     | position, arrival, player, points                        | convocatoria order, a line after the 14th row                  |
| Convocatoria confirmada | position, arrival, player, points                        | convocatoria order, a line after the 14th row                  |
| Jugado                  | position, arrival, player, points, played, team, payment | those who owe first, then alphabetical; sortable by any column |

Every player listed is signed up, so no column says so; and a player's being in or out of the convocatoria is shown by the line after the 14th row, not by a column.

#### UC-003-10-S3 — Swap by dragging a row

Given a game in state Convocatoria creada with Marta signed up and below the line
When the organiser drags Marta's row above the line
Then Marta is in the convocatoria, her row is above the line and the table stays on screen

#### UC-003-10-S4 — Sort the table by a column in a played game

Given a game in state Jugado ordered with those who owe first
When the organiser sorts the table by the column Puntos
Then the rows are ordered by points, and sorting again reverses the order

#### UC-003-10-S5 — Usable on a phone

Given a phone 390 px wide and a game in state Jugado with 14 players
When the organiser opens the game
Then the page has no horizontal scroll, every row's action is reachable with a thumb tap, and nothing needed for the state sits only in a wide table column

#### UC-003-10-S6 — Every capability of today's screen stays reachable

Given today's Partido tab with its game registration, deletion, apuntados paste, convocatoria, per-player chips and counters
When the organiser opens the new game screen
Then each of them is still reachable, and the counters (apuntados, plazas, pagados, deuda) are shown

**Claims.** `verified — document`: the five sections of today's tab, one scroll, no state shown, nine e2e specs on this screen of which two use the final-list paste (`study/game-screen.md`). `author decision`: wide table-style, no long vertical scroll, must work on mobile (interview 3, D6). `author decision`: the columns and orders in S2 (interview 9: no apuntado column, no in/out column, the line after the 14th row, arrival and points columns, Jugado sortable and owing first); the mockups were reviewed and accepted with those comments. `assumed`: the 1280 × 800 and 390 × 844 viewports, the drag in S3, the thumb-tap target, and S5 (nothing of today's screen is dropped).

#### UC-003-10-S7 — Special entries are labelled in Spanish (outline)

Given a game in state Convocatoria creada with a player who is <case>
When the organiser opens the game
Then that player's row carries the label <label>

| case                              | label           |
| --------------------------------- | --------------- |
| in through the mercy seat         | plaza de gracia |
| demoted to make room              | degradado       |
| moved by hand after the algorithm | cambiado a mano |

The labels are `assumed` (the project's documents keep "mercy" and "demotee" in English).

## 3. Interface Examples

The interface that changes is the game screen and the states it moves through. Nothing here is built yet, so each is marked `not yet built` and is verified by implementation.

- [`requirements/examples/game-screen.md`](requirements/examples/game-screen.md) — visual HTML + CSS mockups of the five states, desktop and phone, reviewed and accepted by the author on 2026-10-05 (`not yet built`). Open `requirements/examples/mockups/index.html`.
- [`requirements/diagrams/game-states.puml`](requirements/diagrams/game-states.puml) — the states and transitions of UC-003-01 (`not yet built`).

## 4. File Locations

Expected from the study (`study/writers-and-readers.md`, `study/doc-map.md`); the design fixes the final list.

| Kind                      | Paths                                                                                                                                                                                                                                                                                                  | Count |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Schema                    | `server/src/db/schema.sql`                                                                                                                                                                                                                                                                             | 1     |
| Domain                    | `server/src/domain/convocatoria.ts`, `final-list-parser.ts` (reduced to teams), `types.ts`, plus new classes for the state machine, the derivation and the payment shares                                                                                                                              | ≥ 4   |
| Repositories and services | `server/src/repo/game-repository.ts`, `participation-repository.ts`, `convocatoria-service.ts`, `final-list-resolution-service.ts` and `final-list-target-resolver.ts` (replaced or reduced to teams), `game-day-resolution-service.ts`, `standings-service.ts`, `exclusion-repository.ts`, `index.ts` | ~9    |
| Routes                    | `server/src/routes/api.ts`, `api.test.ts`                                                                                                                                                                                                                                                              | 2     |
| Import and conversion     | `server/scripts/import-season.ts`, plus a new command for the conversion of UC-003-09                                                                                                                                                                                                                  | 2     |
| Server tests              | `server/src/**/*.test.ts` for each file above                                                                                                                                                                                                                                                          | ~12   |
| Web                       | `web/src/pages/GameDay.tsx` (split), `web/src/components/FinalListPaste.tsx` (becomes the teams paste), `CandidateList.tsx`, `web/src/hooks/useFinalListPaste.ts`, `web/src/api.ts`, `web/src/App.tsx`, new components for the table, the state header and the payment lines                           | ~10   |
| E2E                       | `e2e/tests/season-and-player.spec.ts` (nine specs; two use the final-list paste)                                                                                                                                                                                                                       | 1     |
| Documents made untrue     | `AGENTS.md`, `README.md`, `docs/domain-model/{ciclo-del-partido,convocatoria,points,glossary,README}.md`, `docs/test-strategy.md`; WP-001 `REQUIREMENTS.md` and `DESIGN_PLAN.md` (N2, N3, UC-001-05, UC-001-06, UC-001-07)                                                                             | 9     |
| This work package         | `specs/active/WP-003-convocatoria-is-the-final-list/requirements/**`                                                                                                                                                                                                                                   | —     |

## 5. Success Criteria

| Use case  | The check that fails if it is unmet                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC-003-01 | A domain test per transition and per refusal (S2–S7), and an e2e spec that walks Abierto → Jugado → reopen → cancel → undo, reading the state and next action on screen (S1).                                  |
| UC-003-03 | Route and service tests: the outline of 12 / 14 / 16 apuntados, nothing frozen until confirm, the frozen record (S3), the warning before recreating (S4).                                                      |
| UC-003-04 | Tests that a swap, a removal, the 14-cap and the subset rule each hold in both states, that a hand change is marked in the frozen record, and that removing an apuntado who is in the convocatoria is refused. |
| UC-003-05 | A domain test per row of S1; a comparison test that the same outcome gives the standings and exclusions WP-001's flow gave (S3); reopen retracts and marking again recomputes (S4, S5).                        |
| UC-003-06 | Tests for payments per share, the host's total, an odd amount, the three refusals, and the point rule of S3b; money asserted in integer cents.                                                                 |
| UC-003-07 | A route test that a team paste changes only `team`; unresolved lines stay text and are resolved as in the apuntados; replace on re-paste.                                                                      |
| UC-003-09 | Seed a temporary database: 48 imported games converted, none above 14, every history column and the standings identical before and after, and a second run changing nothing.                                   |
| UC-003-10 | An e2e spec per state at a 1280 × 800 and a 390 × 844 viewport: state and next action visible, columns and order per S2, drag swap, sorting, no horizontal scroll on the phone, labels of S7.                  |

## 6. Constraints

Copied from `VISION.md` §5 and the interviews:

- Must not rewrite history: frozen convocatorias stay auditable.
- Money stays in integer cents; `paid_on` is still when the money arrived. The screen shows euros.
- The legacy-bug-preserving default of the points rules is untouched.
- The result must not force effort on backfilled or imported data.
- The database may be recreated; no upgrade path or workaround to keep the current file (author, 2026-10-06).
- User-facing text is Spanish (`AGENTS.md`).
- No lint rule is downgraded, disabled or skipped without asking (`AGENTS.md`).

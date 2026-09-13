# Requirements — WP-001-season-player-match-lifecycle

## 1. Use Case Audit

Boundary: the season/player/game/convocatoria lifecycle and its WhatsApp-paste input, against the
variant inventory the Study surfaced ([guests-and-reserves.md](study/guests-and-reserves.md),
[name-matching.md](study/name-matching.md), [candidate-convocatoria-stages.md](study/candidate-convocatoria-stages.md)):
named occasional guests, anonymous plus-one guests, reserve/standby people, alias/nickname-decorated
pasted text, and historical backfill. The selection algorithm itself and actual message
transport (WhatsApp/Telegram sending or receiving) are out of this boundary per `VISION.md` §3.

One variant the Study raised is **explicitly retracted** by the author's own decision (interview,
this phase): a reserve/standby list is never modeled by the system — it stays the organizer's own
private note-taking, outside Pachanguero entirely. No use case below covers it, and none should.

### Coverage

| Need                                                                                                                                                                                                                               | Use Case(s)                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| N1 — Players persist independent of season boundaries; no per-season re-enrollment                                                                                                                                                 | UC-001-01                                                                                                                      |
| N2 — The real three-stage lifecycle (candidate list → algorithmic Convocatoria → post-game final attendance) is modeled as distinct stages, against a game that itself needs no manual creation or selection at either paste point | UC-001-03, UC-001-05, UC-001-06, UC-001-08, UC-001-10                                                                          |
| N3 — Points trigger correctly: an algorithmic cut still grants its point immediately, but the final list is authoritative and can retract it; the played/paid point is granted only on final confirmation                          | UC-001-05, UC-001-06                                                                                                           |
| N4 — Named occasional/guest players are trackable as ordinary players, linked to whoever introduced them; anonymous guests can still occupy a real, contested candidate slot with no persistent identity                           | UC-001-03, UC-001-04, UC-001-05, UC-001-06                                                                                     |
| N5 — New players (regular or occasional) can be registered inline while resolving a pasted list; seniority is captured the first time a player is tied to a season                                                                 | UC-001-02, UC-001-04                                                                                                           |
| N6 — Pasted WhatsApp text is matched against canonical names/aliases with decorations stripped; aliases accumulate over time as they're recognized; an unresolved or ambiguous name is never silently guessed                      | UC-001-03, UC-001-06, UC-001-09                                                                                                |
| N7 — A past game can be backfilled from its actual outcome alone, with no candidate/algorithm staging                                                                                                                              | UC-001-07                                                                                                                      |
| N8 — The input channel stays thin enough that a future Telegram bot needs no rework of the domain/parsing core                                                                                                                     | handled as a **Constraint** (§6), not a use case: every operation below is a REST endpoint, and the web UI is one client of it |

Use case diagram: [`requirements/diagrams/use-cases.puml`](requirements/diagrams/use-cases.puml).

## 2. Use Cases

Actor throughout: **Organizer** — the sole operator today (`VISION.md` §2); nothing here assumes a
second human actor, though endpoints are not hard-coded to a single caller (§6).

Written increment by increment; increments not yet drafted are listed in
[requirements/agenda.md](requirements/agenda.md) with status `pending`.

### UC-001-01 — Create a season with no roster re-entry

Rests on [season-player-enrollment.md](study/season-player-enrollment.md) (Q-01) and the author's
decision to drop the per-season "active" flag (interview, this phase: _"I think we should remove
that property"_ — `author decision`).

#### UC-001-01-S1 — New season starts with the full roster already available

Given an existing roster of players from prior seasons
When the Organizer creates a new season
Then the season is created with no player-enrollment step, and every existing player is available
as a candidate for that season's games without any prior "add to season" action.

#### UC-001-01-S2 — A player is never permanently excluded from being a candidate

Given a player who has not appeared in any game for several seasons
When the Organizer pastes a candidate list naming that player
Then the player is matched and offered like any other player — nothing in the season boundary
itself blocks them, because there is no per-season "active" state left to check.

#### UC-001-01-S3 — A new season starts everyone's within-season points at zero

Given a player who ended last season with 12 points (attendance + exclusions accumulated that
season, plus seniority)
When the new season begins, before that player has appeared in any of its games
Then their attendance and exclusion points for the new season are zero — only seniority carries
forward, and only via the explicit prompt of UC-001-02, never by copying last season's point total.
This is `inferred` from the existing, unchanged scoping of `standings()` by `season_id`
(verified — source, `repo.ts` function `standings`, `WHERE g.season_id = @seasonId`) — worth stating
explicitly here because the roster no longer resets, and a reader could otherwise assume points
carry over the way the roster now does.

#### UC-001-01-S4 — Season-level rule edits never touch the roster

Given an active season whose rules (slots, mercy seats, games-out-for-mercy, price) the Organizer
edits after creation
When those edits are saved
Then no player is enrolled, unenrolled, or otherwise touched — season rules and season roster are
independent, and editing one has no side effect on the other (unchanged behaviour, verified —
source, `repo.ts` function `updateSeason`, touches only the `seasons` row).

#### UC-001-01-S5 — The current season is derived from the calendar, not activated (author decision, revised)

Given a season runs September 1st through August 31st, back-to-back with no gap between one season's
end and the next one's start (author decision, this phase, simplifying away the actual last-Monday-
of-June end date and the gap that would otherwise leave: _"It is easier to consider that seasons end
on the August 31th and start on September 1st. Don't over complicate things."_)
When today's date falls within a season's Sept 1–Aug 31 range
Then that season is the current one automatically — there is no manual "activate" action, and no
date is ever outside every season's range. This removes today's manual mechanism entirely
(verified — source, `repo.ts` function `activateSeason`, `schema.sql` `seasons.is_active`), per the
author's separate correction this phase: _"the seasons move with the natural pass of time, we can't
activate anything from the past... why should the user have to activate anything, the clock does."_

**Non-behavioural:** the per-season "active" flag (`season_players.active`, verified — source,
`schema.sql` line `active INTEGER NOT NULL DEFAULT 1`) is removed from the model; a player's
standing in a season is derived from appearing on that season's candidate or final lists (UC-001-02),
never set or toggled directly.

Graduation: hard requirement (S1, S2, S3, S5); document (S4 — a statement of non-change).

### UC-001-02 — Capture a player's seniority on first appearance in a season

Rests on the author's decision (interview, this phase): _"A player is officially in a season when
it appears on the list of candidates or in the list of people that really [went]. In that moment
the system shall ask me how many seasons has it played before, with a suggestion of carrying the
number of previous season +1 (if any)."_ (`author decision`)

#### UC-001-02-S1 — Returning player, seniority suggested from their last recorded value

Given a player recorded with 3 seasons of seniority the last time they appeared in any season
(whether or not that was the immediately preceding one — see S5)
When that player first appears on a candidate list or a final list in the new season
Then the Organizer is prompted for this season's seniority value, pre-filled with 4, and may accept
or override it before the appearance is recorded.

#### UC-001-02-S2 — Brand-new player, seniority defaults to zero (author decision, revised)

Given a player with no seniority recorded in any earlier season — this is their first season ever
When that player first appears on any list in a season
Then the Organizer is prompted with a pre-filled seniority value of **0**, not 1. This reverses
today's default (verified — source, `repo.ts` function `addPlayer`'s `seasons = 1` default) per the
author's correction this phase: a rookie has zero _complete prior_ seasons, and
`seniorityPoints(1)` already scores a full 1.0 (verified — source, `seniority.ts`, doc comment
_"Season 1 is worth exactly 1.0"_) — crediting that in a player's own first season would be wrong.
The value `season_players.seasons` (or wherever Design places it) now means **complete prior
seasons**, not "which season number is this," so S1's and S5's "previous value + 1" suggestion logic
is unchanged in form — only the starting point moves from 1 to 0.

#### UC-001-02-S3 — No re-prompt within the same season

Given a player already has a seniority value recorded for the current season
When that player appears again on a later list in the same season — whether the first appearance
was on a candidate list and this one is the final list for the same or a later game, or vice versa
Then the Organizer is not prompted again; the recorded value stands unchanged for the rest of the
season.

#### UC-001-02-S4 — The Organizer overrides the suggestion

Given the prompt of S1 or S2, showing its pre-filled value
When the Organizer enters a different number before confirming
Then the value the Organizer entered is what gets recorded — the suggestion is a convenience, never
a constraint on what can be saved.

#### UC-001-02-S5 — A gap season doesn't reset the count (author decision)

Given a player recorded with 3 seasons of seniority as of two seasons ago, who did not appear at all
in the season immediately before this one
When that player first appears on a list this season
Then the suggested value is 4 — carried from their **last recorded** value, not reset by the gap.
The author's explicit decision this phase, choosing between carrying the last recorded value and
suggesting nothing after any gap: _"Carry from last played season."_

Graduation: hard requirement.

### UC-001-08 — Resolve which game a pasted list targets, from the weekly schedule

Rests on the author's correction this phase, extending the same calendar-driven principle as
UC-001-01-S5 to games themselves: _"how [does] the system know to which match it pertains? It
should be automatic, the user should not be forced to create a [game] entity, this is driven by the
calendar. Today we play every Monday (this should be configurable)... if I paste a list of
candidates on Tuesday it applies to next Monday's game, and if I paste it on Monday it applies that
very same date."_ (`author decision`) The configured schedule is a **day and kickoff time together**
— _"We play Mondays at 22:00"_ — not day alone; UC-001-10 derives its own cutoff from this same
setting rather than a hardcoded value.

#### UC-001-08-S1 — Pasting before game day targets the upcoming game

Given a season configured with a weekly game day (e.g. Monday) and no game record yet exists for
its next occurrence
When the Organizer pastes a candidate list on any day before that occurrence (e.g. the preceding
Tuesday)
Then the paste is attributed to the next occurrence of the game day, and a game record for that
date is created automatically if it did not already exist — no manual "create game" step.

#### UC-001-08-S2 — Pasting on game day itself targets today's game

Given today is the season's configured game day
When the Organizer pastes a candidate list
Then the paste is attributed to today's game, auto-created if needed, not to the following week's
occurrence.

#### UC-001-08-S3 — The weekly day and kickoff time are configurable, and can change mid-season (author decision, corrected)

Given today's fixed weekday is Monday at 22:00, but the author states this should be configurable
rather than hardcoded, and — correcting the initial framing — the setting is not fixed for a whole
season: _"it is not per season, it is per future — it has happened that in the middle of the season
we change the day, and it applies from then onwards"_
When the Organizer changes the configured day and/or kickoff time at any point
Then the new value governs every future occurrence computed from that point on; occurrences already
resolved (past games, and any game already auto-created for an upcoming date under the old setting)
are **not** retroactively recomputed — the setting needs an effective-from date, not a single
static value per season, since it can change more than once within one season. The kickoff time is
part of this same setting, not a separate one — it also drives UC-001-10's cutoff.

#### UC-001-08-S4 — An exceptional date is a manual correction to the auto-created game

Given an auto-created (or already-existing) game whose actual date needs to move — a one-off
exception to the weekly cadence
When the Organizer changes that game's date directly
Then the change applies to that single game record; this is the author's own stated fallback for
exceptions (_"if this happens we just change the date of the [game]"_) and needs no new mechanism —
today's date-editing capability already covers it (verified — source, `repo.ts` function
`updateGame`, `played_on` is an editable field).

Graduation: hard requirement (S1–S4). (A full calendar view/management — seeing every week's game,
cancelling one in advance — was raised only as a comment, not a requirement; left for a future work
package with no use case or scenario recorded here.)

### UC-001-03 — Paste and resolve the Sunday candidate list

Rests on [candidate-convocatoria-stages.md](study/candidate-convocatoria-stages.md) (Q-02) and
[name-matching.md](study/name-matching.md) (Q-05), and `VISION.md` §4 (never silently guess). Which
game a paste targets is resolved automatically per UC-001-08 — nothing below requires the Organizer
to have created a game first.

#### UC-001-03-S1 — Clean paste, everyone matched

Given a pasted, numbered WhatsApp-style list of names that each match an existing player's
canonical name or a known alias once emoji/decorations are stripped
When the Organizer submits the paste for a game
Then every line becomes a candidate (signed-up) entry for that game, and no name is left
unresolved.

#### UC-001-03-S2 — Ambiguous or unmatched name blocks nothing silently

Given a pasted list where one line's name matches no canonical name or alias unambiguously
When the Organizer submits the paste
Then the system shows the candidates it matched cleanly, alongside the unresolved name with a
view to resolve it (link to an existing player, or register a new one per UC-001-04) — and creates
no candidate entry for that line until it is resolved.

#### UC-001-03-S3 — A "Reservas" section is not turned into candidates

Given a pasted list that includes a trailing "Reservas" heading and names beneath it
When the Organizer submits the paste
Then the names under "Reservas" are not created as candidate entries and are not treated as
unresolved names requiring action — reserve/standby names are outside this system by the author's
decision (retracts Study's Q-04 variant).

#### UC-001-03-S4 — Named occasional guest in the candidate list (outline, corrected)

Given a line naming a person via a host annotation, such as "<guest> (<host>)", where `<guest>`
matches no existing player
When the Organizer resolves that line
Then it routes to UC-001-04 with `<host>` pre-filled as the introducing player, and once
registered, `<guest>` becomes an ordinary candidate for this game like anyone else. **Correction,
this phase:** the stored player is named `<guest>` alone — e.g. "Adri" — never the composite string
"Adri (David)"; the host is a separate pointer field (UC-001-04-S2), not baked into the name (author
decision: _"we are not going to store 'Adri (David)' in the database, we are going to store Adri
with a pointer to David as host"_).

| variant                                         | example line   | stored name                                              | stored host link              |
| ----------------------------------------------- | -------------- | -------------------------------------------------------- | ----------------------------- |
| named guest, first appearance                   | `Adri (David)` | `Adri`                                                   | David                         |
| named guest, already known from an earlier game | `Juan (David)` | — resolves via S1 like any known player, no special case | (already set at registration) |

#### UC-001-03-S5 — Anonymous plus-one guest is an ephemeral candidate (author decision)

Given a line naming a known player with an unnamed companion, such as "<player> +1" — recognized as
a syntax pattern, not an unresolved name needing manual matching
When the Organizer submits the paste
Then a candidate entry is created for the companion too: **ephemeral** (this game only, no
persistent player record, no name, fresh/zero points), attributed to the host for billing. An
anonymous guest is a real candidate the algorithm can select or cut (author decision: _"it may
happen that there are 13 regular and 2 anonymous or occasional players... the convocatoria will be
the 13 regular + 1 of the no-regular"_), not merely a billing add-on; its identity is throwaway, not
persistent (author decision: _"Ephemeral per-game slot only"_).

If this ephemeral candidate is cut by the algorithm (UC-001-05), nothing persists — there is no
player record to attach a point to, and none is owed; the candidacy simply lapses with the game.

#### UC-001-03-S6 — When regulars alone don't fill 14, guests compete by arrival order, not points (author decision, corrected)

Given the number of **regular** candidates (excluding named-occasional and ephemeral-anonymous
guests) for a game is 14 or fewer
When the Organizer commits the Convocatoria (UC-001-05)
Then the points-based algorithm does not run at all for this game — it isn't needed, since every
regular candidate fits. Instead: every regular candidate is called up automatically, and the
remaining slots (`14 − number of regulars`) go to guest candidates (named-occasional and/or
ephemeral-anonymous, in any mix) ordered by **arrival order** — the position they occupy in the
pasted candidate list, ascending — not by points. A guest whose position doesn't make the cut is
excluded; a named guest excluded this way still earns the ordinary exclusion point (they're an
ordinary player per UC-001-04-S2); an ephemeral guest excluded this way simply lapses (UC-001-03-S5).

This is the author's own worked example, verified against it directly: 11 regulars + 4 guests
(`Adri` #8, `Álvaro +1` #12, `Juan` #13, `Rubén` #14) → 3 open slots after the 11 regulars →
`Adri`, `Álvaro +1`, `Juan` (the three earliest-positioned guests) are called up, and `Rubén`
(latest-positioned) is excluded — exactly the outcome the author predicted before this correction
existed as a written rule.

If instead the number of regulars alone exceeds 14, the existing points-based algorithm
(`domain/convocatoria.ts`, unchanged) runs among regulars exactly as today, and no guest competes at
all — there is no room regardless of arrival order. **How this interacts with the commit step
(UC-001-05) is still open** — the author flagged UC-001-05 for separate comment next.

#### UC-001-03-S7 — Decorations are stripped before matching (outline)

Given a pasted line wrapping a known player's name in WhatsApp decoration — an emoji, extra
whitespace, a leading number/bullet variant, or similar noise around the name itself
When the Organizer submits the paste
Then the decoration is stripped before matching, and the line resolves against the canonical name
or alias underneath it exactly as if the decoration were absent — never surfaced as unresolved
merely because of formatting.

| variant                  | example line    | matches    |
| ------------------------ | --------------- | ---------- |
| trailing emoji           | `5 Álvaro R ⚽` | `Álvaro R` |
| bullet instead of number | `• Pablo`       | `Pablo`    |
| extra whitespace         | `  Facu   `     | `Facu`     |

#### UC-001-03-S8 — Alias/nickname matching (outline)

Given a player with one or more registered aliases (UC-001-09) that differ from their canonical name
When a pasted line uses any registered alias instead of the canonical name
Then it resolves to that player exactly as a canonical-name match would (UC-001-03-S1) — an alias is
a first-class match target, not a fallback tried only after canonical names fail.

| variant | canonical name    | alias pasted |
| ------- | ----------------- | ------------ |
| example | `Jorge Gutiérrez` | `Guti`       |
| example | `Jorge Gutiérrez` | `Gutito`     |
| example | `Jorge Gutiérrez` | `Jorge`      |

#### UC-001-03-S9 — Re-pasting a candidate list before the game replaces it

Given a game whose candidate list was already resolved from an earlier paste (e.g. Sunday), and
someone since joined or dropped before the Monday Convocatoria is run
When the Organizer pastes an updated candidate list for the same game
Then the new paste replaces the prior candidate set for that game (matched against it the same way
as a first paste — already-known candidates re-match instantly, new names go through resolution
again) — never appends to or merges silently with the old list. This is `inferred`: nothing in the
author's own description states this explicitly, but the Sunday-then-maybe-changes-before-Monday
workflow described in the original conversation implies it.

Graduation: hard requirement (S1–S9) — S6 and S8 no longer open; both settled by author decision
this phase.

### UC-001-04 — Register a new player inline during list resolution

Rests on the author's decision (interview, this phase): minimal registration, name only, with an
optional introducing-player link retained for later — _"link them to the people that brought them
in the first place... this is useful to claim the money because I don't really know them."_ Applies
to any **named** unresolved person — regular or occasional. An anonymous guest (UC-001-03-S5) never
reaches this use case; it has no name to register.

#### UC-001-04-S1 — Minimal registration

Given an unresolved name the Organizer confirms is a genuinely new player
When the Organizer registers them, providing only a name
Then a new player record is created, immediately usable as a candidate or a final-list participant,
with no other field required.

#### UC-001-04-S2 — Registration carries an introducing-player link

Given the new name came from a host-annotated line (UC-001-03-S4) or an equivalent annotation in a
final list (UC-001-06-S2)
When the Organizer registers the new player
Then the new player's record stores a link to the introducing player, kept for later reference (who
to ask about unpaid debt) — the new player is otherwise an ordinary player from then on, subject to
the same points and selection rules as anyone else (no permanent "occasional" flag or exemption).

#### UC-001-04-S3 — Registration without an introducing link

Given an unresolved name with no host annotation — a plain new regular joining the group
When the Organizer registers them
Then the player is created with no introducing-player link.

#### UC-001-04-S4 — A "new" name collides with an existing player (author decision)

Given an unresolved name the Organizer is about to register, which turns out to already match an
existing canonical name or alias
When the Organizer attempts to register it as new
Then the system involves the Organizer to resolve it — exactly the same resolution view used for
any unmatched or ambiguous name (UC-001-03-S2) — rather than silently creating a duplicate or
silently blocking the action. The author's decision this phase: _"when there are collisions you must
involve the user to solve it the same as unknowns or not clear names."_

#### UC-001-04-S5 — Registration doesn't restart the whole paste

Given a paste with several unresolved names
When the Organizer registers one of them as a new player
Then only that one name is resolved — the rest remain listed as unresolved, and the paste as a
whole still commits nothing until every name is resolved (UC-001-03-S2), so registering one doesn't
force the Organizer to redo the others.

Graduation: hard requirement (S1–S5).

### UC-001-09 — Maintain a player's nicknames/aliases

Rests on the author's correction this phase: _"one person can have many [nicknames], may be 'Jorge
Gutiérrez' may be 'Jorge Gutierrez', 'Jorge', 'Guti', 'Gutito' and emoticons all around. So we need
to keep in the database all those nicknames and be able to add more along the way."_ (`author
decision`) This is what UC-001-03-S8 and UC-001-06's equivalent matching rest on.

#### UC-001-09-S1 — A recognized nickname becomes a saved alias

Given a pasted name matches no canonical name or alias, and the Organizer recognizes it during
resolution (UC-001-03-S2) as an existing player under a nickname they haven't seen before — e.g.
"Guti" for Jorge Gutiérrez. This is, by the author's own account, the **typical** reason a name goes
unmatched in the first place — not an edge case — so this resolution path is the primary way
aliases accumulate, not a secondary one
When the Organizer links that name to the existing player
Then the exact string is saved as a new alias on that player, so a future paste using "Guti"
resolves automatically (UC-001-03-S8), without needing resolution again — this is the "add more
along the way" the author described, not a separate administration step.

#### UC-001-09-S2 — A player can carry any number of aliases

Given a player already has aliases (e.g. "Jorge Gutiérrez", "Jorge", "Guti")
When a further new nickname is linked to them (e.g. "Gutito")
Then it is added alongside the existing ones — there is no cap on how many aliases one player can
carry.

#### UC-001-09-S3 — Aliases are decoration-stripped exactly like canonical names

Given a registered alias
When it appears in a pasted line wrapped in the same kind of WhatsApp decoration UC-001-03-S7
strips for canonical names (emoji, stray whitespace, bullet/number variants)
Then it matches the same way — alias matching and canonical-name matching share the same
decoration-stripping step, not two separate implementations.

Graduation: hard requirement.

### UC-001-05 — Run the algorithmic Convocatoria over resolved candidates

Rests on [points-trigger.md](study/points-trigger.md) (Q-06). The selection algorithm itself
(`domain/convocatoria.ts`, `buildConvocatoria`) is unchanged and out of scope (`VISION.md` §3); this
use case is about what committing its result does and does not do to attendance.

#### UC-001-05-S1 — Committing still grants the exclusion point immediately

Given a game with more signed-up candidates than the season's slots
When the Organizer commits the Convocatoria
Then every candidate the algorithm excludes (kind `points` or `demoted`) is recorded with that
exclusion immediately, exactly as today (verified — source, `repo.ts` `commitConvocatoria`,
unchanged), so the "guaranteed point for being cut" rule holds without waiting for the game to be
played — unless later retracted by the final list (UC-001-06-S6).

#### UC-001-05-S2 — Committing no longer finalizes attendance

Given the same commit
When the algorithm marks a candidate as playing (`called_up` or `mercy`)
Then that candidate's final attendance (`participations.played`) is **not** set by this step — it
stays open until UC-001-06 resolves the game's actual outcome. This reverses today's behaviour
(verified — source, `repo.ts` `commitConvocatoria` currently calls `setParticipation(gameId,
e.playerId, { played: e.playing })` inside the same transaction) and is the fix for Study Q-02's
surprising finding.

#### UC-001-05-S3 — Ephemeral guest candidates are ranked, not specially exempted

Given the resolved candidate pool for an oversubscribed game includes one or more ephemeral
anonymous candidates (UC-001-03-S5) alongside regular and named-occasional candidates
When the Organizer commits the Convocatoria
Then the algorithm ranks and cuts/calls-up ephemeral candidates exactly as it does everyone else
(UC-001-03-S6); if one is cut, no exclusion row is written for it (there is no player id to write
one against) and nothing is owed to anyone for that non-selection.

#### UC-001-05-S4 — Fourteen or fewer candidates: nobody is cut

Given a game with 14 or fewer resolved candidates (not oversubscribed)
When the Organizer commits the Convocatoria
Then every candidate is called up, no exclusion rows are written (unchanged behaviour,
verified — source, `domain/convocatoria.ts` `oversubscribed` check), and — per S2 — attendance
still stays unset until the final list resolves the game.

#### UC-001-05-S5 — Re-running the Convocatoria replaces the prior commit

Given a game whose Convocatoria was already committed once, and its candidate list has since
changed (UC-001-03-S9)
When the Organizer commits the Convocatoria again for the same game
Then the previous commit's entries and exclusions are replaced by the new run, not accumulated
alongside it (unchanged behaviour, verified — source, `repo.ts` `commitConvocatoria`'s `DELETE FROM
convocatorias/exclusions WHERE game_id = ?` before inserting).

Graduation: hard requirement.

### UC-001-10 — Resolve which game a final-list paste targets, by default

Rests on the author's correction this phase to UC-001-07-S3: pasting the final list is normally an
everyday action, not a backfill — _"the typical case is that we include this information... Monday
late (23:00 onwards) or [in] the following days. So the default should be the last game without
final list, and the [cutoff] is 23:00 that very same day."_ (`author decision`) — refined once more
in the same phase: 23:00 is not itself a constant; it falls directly out of the configured kickoff
time (UC-001-08-S3), which the author gave as 22:00 for today's group: _"Monday night after 23:00,
should be expressed as a configurable day and time of the game plus +1... that parameter can be used
in UC-001-10."_ This mirrors UC-001-08's game-day auto-resolution, but for the final-list side of
the lifecycle.

#### UC-001-10-S1 — Default target is the most recent game still missing a final list

Given one or more games exist with a Convocatoria (or otherwise already played) but no final list
recorded yet
When the Organizer pastes a final list without explicitly selecting a game
Then it targets the most recent such game — no manual game-picking needed for the ordinary weekly
flow of pasting Monday night after 23:00, or in the days that follow.

#### UC-001-10-S2 — The same-day cutoff is derived from the configured kickoff time, plus one hour (author decision, revised)

Given the group's configured kickoff time is 22:00 (UC-001-08-S3), so the cutoff is 22:00 + 1h =
23:00 — not a hardcoded 23:00, but that same +1h-past-kickoff rule computed from whatever kickoff
time is actually configured, which changes if the kickoff time does
When the Organizer pastes a final list **before** that computed cutoff on game day
Then today's game is not yet treated as "awaiting a final list" — the match is presumed still
ongoing or not yet concluded from the system's perspective, so the default target (S1) resolves to
whatever earlier game was already missing one, if any. **From the cutoff onward that same day**,
today's game becomes eligible and is the default target going forward, until it itself gets a final
list. `assumed`: the offset itself ("+1h") is taken as a fixed constant past kickoff, not a further
configurable value — the author asked for the _kickoff time_ to be configurable, not necessarily the
offset; flagged in case the offset should be configurable too.

#### UC-001-10-S3 — Explicit selection overrides the default, for genuine backfill

Given the Organizer wants to record a game from further in the past than "the last game missing a
final list" — genuine historical backfill (UC-001-07), which the author expects to be rare: _"in
general we don't backfill matches of previous seasons, but I am ok with being able to do it as long
as the default UI is optimized for the typical use case"_
When the Organizer explicitly selects a different, specific past game instead of accepting the
default
Then the paste targets that explicitly selected game instead — the auto-resolution in S1/S2 is the
default path optimized for the common case, not the only path.

Graduation: hard requirement.

### UC-001-06 — Paste and resolve the final Claros/Oscuros list

Which game an ordinary (non-backfilled) final-list paste targets is resolved automatically per
UC-001-10 — the Organizer does not pick a game for the everyday Monday-night-or-later case.

Rests on [candidate-convocatoria-stages.md](study/candidate-convocatoria-stages.md) (Q-02) and
[points-trigger.md](study/points-trigger.md) (Q-06) — the central fix this work package delivers.
Which game a final-list paste targets is resolved the same way as a candidate paste (UC-001-08);
name matching and inline registration reuse UC-001-03/UC-001-04/UC-001-09 unchanged.

#### UC-001-06-S1 — Final list matches the Convocatoria exactly

Given a game whose committed Convocatoria named a set of players as playing
When the Organizer pastes a final list, split into two team headings, naming exactly that same set
Then every named player is recorded as played, billed at the season's configured price (S4), and
nothing about the earlier exclusion points changes.

#### UC-001-06-S2 — Final list diverges from the Convocatoria

Given a game whose Convocatoria named a player as playing, who the Organizer knows did not actually
attend
When the Organizer pastes a final list that omits that player and includes a replacement instead
(a previously-known player, or a new name handled via UC-001-04)
Then: the omitted player is recorded as not played (no attendance charge, no attendance point) even
though the algorithm had called them up; the replacement is recorded as played and billed normally;
and the exclusion point already granted to whoever the algorithm cut for points or demotion stands —
only who actually played and who actually pays is decided here, matching the author's original
description: candidates are provisional, only the algorithm's own cuts are guaranteed. (The one case
where an exclusion point does not stand — the excluded player shows up and plays after all — is
UC-001-06-S6.)

#### UC-001-06-S3 — Anonymous guest billing

Given a final-list line naming a known player with an unnamed companion — whether that companion was
already an ephemeral candidate from the Convocatoria (UC-001-03-S5) or appears for the first time
only in the final list
When the Organizer resolves the final list
Then no persistent player or participation record is created for the companion; the named player is
billed at the season's configured price multiplied by the number of people they're covering (self
plus each unnamed companion), and their own `played` status is set normally. The ephemeral candidacy
(if any) ends with this game either way — nothing about the companion carries to a future game.

#### UC-001-06-S4 — Game price stays a configurable season setting (author decision, scoped)

Given the pitch cost is not fixed forever — the author's decision this phase: _"the cost of the
games may change any time... the cost of a game must be configurable"_ — but narrowed in the same
conversation to today's actual need: _"today we only have one range, it hasn't changed for a long
time, so we can scope out... ranges — by now only that the price is configurable in settings"_
When payments are computed for any game
Then the per-person amount is derived from the season's configured price (verified — source,
`schema.sql` `seasons.price_cents` / `slots`, already configurable per season, unchanged), never a
hardcoded constant. A per-game price override and any date-ranged pricing are explicitly **out of
scope** for this work package — a future work package if the single current price ever needs to
vary mid-season.

#### UC-001-06-S5 — Never silently guess (outline)

Given a final-list paste containing a name that matches no canonical name, alias, or already-resolved
candidate from this game's Convocatoria
When the Organizer submits the paste
Then the system shows the partial match plus the unresolved name for resolution (link to an
existing player, or UC-001-04), exactly as UC-001-03-S2 does for the candidate list — the same
matching and resolution behaviour applies to both list types.

| variant                   | source list   |
| ------------------------- | ------------- |
| candidate list (pre-game) | UC-001-03-S2  |
| final list (post-game)    | this scenario |

#### UC-001-06-S6 — The final outcome retracts a provisional exclusion (author decision)

Given a candidate the algorithm excluded or demoted this game — already credited an exclusion point
(UC-001-05-S1)
When the final list names that candidate as having actually played after all
Then the previously granted exclusion is retracted (its `exclusions` row and the point it carried
are removed) and the player instead follows the ordinary played/paid path for this game, exactly as
if the algorithm had called them up in the first place — the author's decision this phase: _"yes,
everything is possible, this is a variable as l[ife]... If that happens the previously earned point
and status of 'demotee' is retracted and it follow[s] the regular path as anybody else."_ This
generalises S2: the final list is authoritative over the whole Convocatoria outcome for a given
player, not only over the `played` flag.

#### UC-001-06-S7 — A guest who never appeared on the candidate list at all (outline)

Given a final-list line naming someone with a host annotation who was never part of this game's
candidate list or Convocatoria at all — a last-minute replacement, exactly like the "Jesus" example
in the author's original description
When the Organizer resolves that line
Then it routes to UC-001-04 exactly as a candidate-list host annotation would (UC-001-03-S4) — there
is nothing to reconcile against a prior candidacy because none existed; the new player is registered,
linked to the host, and recorded as played and billed like anyone else.

#### UC-001-06-S8 — A regular player attends without ever having been a candidate (outline)

Given a final-list line naming a known regular player who never appeared on this game's candidate
list or Convocatoria — they simply weren't asked, or joined informally
When the Organizer resolves the final list
Then that player is recorded as played and billed normally; the final list does not require every
attendee to have first existed as a candidate — it is the sole source of truth for who actually
played (`inferred`, following directly from S2/S6's principle that the final list is authoritative).

#### UC-001-06-S9 — Team assignment (Claros/Oscuros) is recorded but has no scoring effect (author decision)

Given the final list is split into two team headings when pasted
When the Organizer submits it
Then which team a player was on is recorded purely as data — nothing in points, payment, or
selection for future games depends on it. The author's decision this phase: _"No scoring effect,
just a record — in the future we will include other data as the game result."_ This work package
records the team split as a fact about the game; it does not build anything that reads it. A future
work package may attach game-result data (score, or other match facts) to what's recorded here.

Graduation: hard requirement.

### UC-001-07 — Backfill a historical game from the final list alone

Rests on the author's decision (interview, this phase): _"no, just final list is ok"_ — historical
games skip the candidate/algorithm stage entirely.

#### UC-001-07-S1 — Direct final-outcome entry

Given a past date with no existing game record
When the Organizer creates the game and pastes only its final Claros/Oscuros list — no candidate
list, no Convocatoria run
Then attendance, teams, and payment are recorded directly from that paste exactly as UC-001-06
would finalize them, and no Convocatoria or exclusion rows are created for that game — nobody is
credited an algorithmic-exclusion point for a game the algorithm never actually ran, which matches
reality.

#### UC-001-07-S2 — Same name resolution as any final list

Given the pasted historical final list contains an unresolved or new name
When the Organizer resolves it
Then the same matching and inline-registration behaviour (UC-001-03, UC-001-04, UC-001-09) applies
unchanged — backfill differs only in skipping the candidate/algorithm stage, never in how names are
parsed or players are registered.

#### UC-001-07-S3 — Backfill means genuinely old games; the ordinary next-day case is not this (corrected)

Given the author's correction this phase: what first looked like "backfill" — pasting the final
list some time after the game — is actually the **ordinary, everyday** flow (Monday night after
23:00, or the following days), resolved automatically by UC-001-10, not by this use case. Real
backfill is narrower and rarer: _"in general we don't backfill matches of previous seasons"_
When the Organizer genuinely needs to record a game further back than UC-001-10's default reaches —
typically a past season entirely
Then the date is entered directly, via UC-001-10-S3's explicit-selection override, rather than
relying on the default "last game missing a final list" resolution — this use case (UC-001-07) is
now scoped specifically to that rarer, explicit case, not the everyday one.

#### UC-001-07-S4 — The game's season is still derived from its date, not picked manually (outline)

Given seasons run Sept 1–Aug 31 back-to-back with no gaps (UC-001-01-S5)
When the Organizer enters a historical date for a backfilled game
Then the season it belongs to is derived from that date against the existing seasons' ranges, the
same way any other game's season is determined — consistent with UC-001-01/UC-001-08, never a
separate manual "pick a season" step, and never today's _current_ season by default.

#### UC-001-07-S5 — Payment uses that season's price, not today's

Given a backfilled game belongs to a season from several years ago, whose configured price differs
from the current season's
When payment is computed for that backfilled game (UC-001-06-S4)
Then it uses the **backfilled game's own season's** configured price — never the currently active
season's price — exactly as UC-001-06-S4 already states in general, worth restating here because
backfill is the case where "today's season" and "the game's season" most obviously diverge.

#### UC-001-07-S6 — Seniority is still captured on first appearance, scoped to the historical season

Given a player appears for the first time in a given season via a backfilled game rather than a
live one
When that appearance is recorded
Then UC-001-02's seniority-capture prompt still applies, scoped to **that historical season**, not
to today's season — a backfilled first appearance is exactly as season-scoped as a live one.

Graduation: hard requirement.

## 3. Interface Examples

The concrete request/response shapes are Design's to fix; no code implementing them exists yet, so
nothing here is `verified — invocation`. What follows is the operation inventory Design must cover,
each tagged `not yet run`:

- `POST /api/seasons` — configures a season's rules (slots, mercy seats, price, etc.); no longer
  followed by any per-player enrollment call (UC-001-01), and carries no `is_active` field to set.
- `GET /api/seasons/current` — replaces today's `GET /api/seasons/active`; derives the answer from
  today's date against each season's Sept 1–Aug 31 range (UC-001-01-S5), not a stored flag.
- `GET`/`PUT /api/schedule` (or equivalent) — the global weekly game day + kickoff time, versioned by
  effective-from date (UC-001-08-S3); read by both UC-001-08 and UC-001-10's cutoff calculation.
- `POST /api/games/candidates:paste` (or equivalent) — body: raw pasted text; the target game is
  resolved automatically (UC-001-08), never supplied by the caller for the ordinary flow. Response:
  matched candidates (including ephemeral anonymous-guest entries, UC-001-03-S5) plus an
  `unresolved: [...]` list.
- A resolution endpoint per unresolved name — link to an existing player, register a new one
  (UC-001-04, including the introducing-player link and the collision-resolution path of S4), or
  save a recognized nickname as a new alias (UC-001-09) — shape TBD in Design.
- `POST /api/games/:gameId/convocatoria` — unchanged trigger, changed effect: branches server-side
  between the points-based algorithm (regulars alone > 14 slots) and the arrival-order rule for
  guest candidates (regulars ≤ 14, UC-001-03-S6); never writes `participations.played`
  (UC-001-05-S2).
- `POST /api/games/final:paste` (or equivalent) — body: raw pasted text with two team headings; the
  target game is resolved automatically (UC-001-10), unless the caller explicitly overrides it for
  genuine backfill (UC-001-10-S3, UC-001-07). Response: matched participants plus
  `unresolved: [...]`, computed amount owed per participant including any guest multiplier, and any
  provisional-exclusion retractions triggered (UC-001-06-S6).
- `POST /api/games` — still needed for genuine historical backfill only (UC-001-07); the ordinary
  weekly flow never calls it, since both UC-001-08 and UC-001-10 auto-create/target games as needed.

See `requirements/examples/` — none populated yet; Design supplies real examples once these
endpoints exist.

## 4. File Locations

Exact new file names are Design/Anatomy's to fix; based on the project's layered architecture
(AGENTS.md "Architecture"), this work package is expected to touch:

- `server/src/db/schema.sql`:
  - drop `season_players.active` (UC-001-01) and `seasons.is_active` (UC-001-01-S5);
  - add an introducing-player link on `players` (UC-001-04-S2);
  - add a player-aliases table (UC-001-09);
  - add a global weekly-schedule table (day, kickoff time, effective-from date — UC-001-08-S3,
    versioned, not a single static value, and not per-season);
  - `season_players.seasons` (or wherever Design places it) is redefined to mean complete _prior_
    seasons, not "which season number is this" (UC-001-02-S2);
  - `seasons.price_cents` stays as-is (already the configurable price, per-season, unchanged);
  - whatever staging structure Design chooses for candidate/final-list resolution, including
    representing ephemeral (non-persistent) anonymous-guest candidates (UC-001-03-S5).
- `server/src/domain/*.ts` (existing: `points.ts`, `seniority.ts`, `convocatoria.ts`, `types.ts`,
  unchanged in their own logic; new: a name/alias/decoration-matching module, a weekly-schedule
  resolution module for UC-001-08/UC-001-10, and the regulars-vs-guests arrival-order rule of
  UC-001-03-S6) — pure functions only, per the existing layering rule.
- `server/src/domain/*.test.ts` — new and extended test coverage for the above.
- `server/src/repo.ts` — season/player/game/participation/convocatoria query and use-case changes,
  including the exclusion-retraction logic of UC-001-06-S6.
- `server/src/routes/api.ts` — the endpoints listed in §3.
- `web/src/pages/GameDay.tsx`, `web/src/pages/Manage.tsx` — the paste UI and resolution view
  (UC-001-03, UC-001-04, UC-001-06, UC-001-09), and removal of the manual "activate season"/"add
  player to season" controls; `web/src/pages/Standings.tsx` — columns only, if a new participant
  kind needs representation there.
- `docs/domain-model/glossary.md`, `docs/domain-model/convocatoria.md` — updated per
  [doc-map.md](study/doc-map.md) (Q-07), plus new vocabulary for candidate vs. final convocatoria,
  ephemeral guests, and the regulars-vs-guests selection split.

## 5. Success Criteria

- UC-001-01: creating a season writes no per-player enrollment rows; a player last active seasons
  ago is still offered as a match when pasting a new candidate list; `GET /api/seasons/current`
  returns the season whose Sept 1–Aug 31 range contains today's date, with no manual activation
  call anywhere in the test suite.
- UC-001-02: a fixture player with a known prior-season seniority value produces the expected
  pre-filled suggestion (including across a gap season) on first appearance in a new season, a
  brand-new player defaults to 0, and no second prompt occurs on a later appearance the same season.
- UC-001-03 / UC-001-04 / UC-001-09: a fixture WhatsApp-format paste (the one from this work
  package's originating conversation) parses into the expected matched/unresolved split, including
  named-guest routing, ephemeral anonymous-guest entries, and alias resolution; no candidate entry
  is ever created for a name that was never resolved; a collision during registration surfaces the
  same resolution view as an unmatched name.
- UC-001-05: committing a Convocatoria for a fixture with regulars > 14 writes the expected
  exclusion rows via the points algorithm and leaves every candidate's `played` value unset; a
  fixture with regulars ≤ 14 and surplus guests (the author's own 11-regulars-plus-4-guests example)
  calls up all regulars plus the earliest-positioned guests up to 14, excluding the rest.
- UC-001-06: resolving a final list is the only code path, across the whole test suite, that sets
  `participations.played` — confirmed by an exhaustive grep over `setParticipation` call sites at
  review time; a fixture where the algorithm excluded someone who then appears in the final list
  ends with zero exclusion rows for that player and a normal played/paid record; changing the
  season's configured price between two fixture games produces different per-person amounts owed,
  with no per-game override field anywhere in the schema.
- UC-001-07: a backfilled game produces zero rows in whatever table records Convocatoria entries or
  exclusions, uses its own season's configured price (not the currently active season's), and its
  season is derived from its date rather than picked manually.
- UC-001-08 / UC-001-10: a fixture paste before the configured cutoff (kickoff time + 1h) targets
  the prior game still missing its stage; a fixture paste at or after the cutoff targets today's
  game; changing the weekly schedule mid-season leaves already-resolved games untouched and governs
  only occurrences computed after the change.

## 6. Constraints

Copied from `VISION.md` and the Study, and elaborated by decisions made in this phase, as they bind
this work package's solution:

- Never silently guess an unresolved or ambiguous name from pasted text, and never silently create a
  duplicate player on a name collision either — always involve the Organizer through the same
  resolution view (`VISION.md` §4; UC-001-04-S4).
- No hard technical limit otherwise — the application is not yet in production, so schema and data
  may be freely changed, undone, or redone (`VISION.md` §5).
- The input channel (a paste box today) must stay a thin layer over a shared domain/parsing core: a
  future Telegram bot must be addable without reworking that core. Concretely, every operation this
  work package introduces is exposed as a REST endpoint (§3) that the web UI consumes like any other
  client would — no logic lives only behind a UI event handler (`VISION.md` §3, author decision:
  _"for the bot support most likely we need to define a REST API... but now we only define the
  regular front and... REST API"_).
- The selection/mercy algorithm's own points-based logic (for the case where regulars alone exceed
  the slots) is out of scope and must not change (`domain/convocatoria.ts`, `domain/points.ts` —
  `VISION.md` §3). The regulars-≤-14 arrival-order rule (UC-001-03-S6) is new, additive behaviour
  this work package introduces for a case the existing algorithm never had to handle (guests
  competing for leftover slots), not a change to the existing algorithm's own logic.
- A reserve/standby list is explicitly **not** modeled by the system (author decision) — no table,
  field, or endpoint should represent it; it is the Organizer's own bookkeeping outside the app.
- An anonymous guest (no name given) never gets a **persistent** player record — at most an
  ephemeral, this-game-only candidate slot (author decision) — and always resolves to a billing
  multiplier on whoever brought them once the game is final.
- No new tie-break rule is introduced for guest candidates contesting a slot when regulars alone
  already exceed 14; they are ranked by the unchanged selection algorithm like anyone else
  (`inferred`, UC-001-03-S6). Below that threshold, arrival order (list position) decides, per the
  same scenario.
- Game price stays a single configurable season setting — no per-game override, no date-ranged
  pricing within a season (author decision, scoped down from an initial broader ask, UC-001-06-S4).
- The weekly game day and kickoff time are one global, versioned setting (effective-from date), never
  a per-season value and never a hardcoded constant (author decision, UC-001-08-S3); the cutoff used
  to resolve a final-list paste's default target is derived from that same kickoff time plus a fixed
  one-hour offset, never a separately hardcoded time (author decision, UC-001-10-S2).
- Team assignment (Claros/Oscuros) is recorded as data with no computational effect on points,
  payment, or future selection in this work package (author decision, UC-001-06-S9).
- Full calendar visualization or management (seeing every week's game, cancelling one in advance) is
  explicitly out of scope — raised only as context, not a requirement, for a possible future work
  package.

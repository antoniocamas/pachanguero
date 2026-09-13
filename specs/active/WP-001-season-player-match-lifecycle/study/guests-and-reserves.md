# Q-03 / Q-04 — Occasional/guest players and the reserve queue

**Guests (Q-03):** `participations.guests` (schema.sql) is a bare integer — "extra people [the
signed-up player] paid for" (schema comment). It's a headcount folded into one member's row, with
no name, no identity, and no way to track that guest across games. Nothing in `players`,
`season_players`, or any other table represents an occasional/guest player as an entity — there is
no "belongs to / brought by" relationship, and no way to exclude a guest from the mercy mechanism
because a guest is never a row the convocatoria algorithm's `Contender` list (`domain/types.ts`)
could even see. `buildConvocatoria` only ever operates on `Contender[]` built from `standings()`
(`repo.ts`), which is scoped to `season_players` — a guest with no `players`/`season_players` row
cannot appear there today by construction, correctly or not.

**Reserve queue (Q-04):** No table, column, or enum value represents "on standby, called in only if
someone drops." `exclusions.kind` is `CHECK (kind IN ('points','demoted','mercy'))` — a closed set
with no `reserve` value, and it's a per-game outcome record, not a queue with order. There is no
concept of a waiting list distinct from being excluded from a specific convocatoria.

Both gaps are structural, not superficial: `Contender`/`ConvocatoriaEntry` (`domain/types.ts`),
`participations`, and `exclusions` all assume every person on any list is an already-known
`players.id` row with season standing. Occasional players and reserves need to exist as people
(nameable, matchable in future pasted text, potentially promotable to a regular) without being
subject to seniority/mercy scoring.

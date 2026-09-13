# Q-02 — How today's participation fields map onto the real three-stage flow

`participations` (schema.sql) has three flags per (game, player): `signed_up`, `played`,
`paid_cents`. Mapped onto the author's real process:

- **Sunday candidate list** ≈ `signed_up = 1`. `previewConvocatoria` (`repo.ts`) reads exactly this
  set (`WHERE pa.signed_up = 1`) as the pool the algorithm ranks.
- **Monday algorithmic Convocatoria** is `buildConvocatoria` (`domain/convocatoria.ts`), persisted
  by `commitConvocatoria` (`repo.ts`) into `convocatorias`/`convocatoria_entries` (frozen ranking)
  and `exclusions` (one row per non-playing candidate, kind `points`/`demoted`/`mercy`).
  `commitConvocatoria` also writes `participations.played` for every entry (`setParticipation(...,
{ played: e.playing })`) — so today, **the algorithmic run itself sets `played`**, not a later
  post-game step.
- **Post-game actual attendance (Claros/Oscuros, who really showed up)** has **no separate
  representation**. `played` is set once, by the algorithm, and nothing in `repo.ts` or `api.ts`
  revisits it afterward except the generic `PUT /games/:gameId/players/:playerId` endpoint, which
  can overwrite `played`/`paid_cents` per player but has no concept of "this is the final,
  post-game correction pass" or "these are the two team lists."

This is the gap the author's message describes directly: today `played` conflates "the algorithm
provisionally put you in the XIV" with "you actually turned up." There is no field, table, or event
for last-minute drop-outs being backfilled by reserves/occasionals, and no record of team split
(Claros/Oscuros) at all — team is not modeled anywhere in the schema.

Consequence for points (see [points-trigger.md](points-trigger.md)): `computePoints`'s `attendance`
term counts `paid_cents > 0`, which today can only be set after `played` was set by the algorithm —
so an occasional replacement who was never in the algorithmic convocatoria has no `participations`
row to begin with unless someone calls `setParticipation` for them by hand.

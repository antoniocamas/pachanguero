# Q-08 — Frontend surface touching this domain

`web/src/pages/Manage.tsx` — season creation/activation/rule editing, and the only place
`api.addPlayer(season.id, name, seniority)` / `api.updatePlayer(season.id, playerId, { seasons })`
are called. This is where the "re-add players every season" friction is felt directly by the user.

`web/src/pages/GameDay.tsx` — per-game flow: loads game detail (`api.game(gameId)`), sets
participation (`api.setParticipation`), creates games (`api.createGame`), and runs
`api.preview`/`api.commit` for the convocatoria. This is the natural home for both new inputs: the
Sunday candidate paste and the post-game actual-attendance/Claros-Oscuros paste.

`web/src/pages/Standings.tsx` — read-only, calls `api.standings(season.id)`; will reflect whatever
the points model produces without needing structural change itself, though its columns may need
to grow if new participant kinds (occasional/guest) show up in it.

No paste/import UI exists anywhere in `web/src` today — confirms Q-05's finding that the WhatsApp
paste flow is wholly new, front and back.

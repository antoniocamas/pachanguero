# Q-01 — Season/player enrollment friction

`players` (schema.sql `CREATE TABLE players`) already holds the canonical roster with no season
column — a player is not owned by a season at the storage level.

The friction is one level up: `season_players` (schema.sql) is a join table, and nothing populates
it automatically when a season is created (`createSeason` in `repo.ts`, function `createSeason`,
only inserts into `seasons`). `listPlayers(seasonId)` (`repo.ts`) reads by joining
`season_players` to `players`, so a freshly created season legitimately has zero rows until
`addPlayer(seasonId, name)` is called once per player — which is the manual re-add the author is
describing. `addPlayer` (`repo.ts`) is idempotent on the `players` row (`INSERT OR IGNORE`) but
still requires an explicit per-season call to create the `season_players` row.

`web/src/pages/Manage.tsx` confirms this is the only path today: adding a player is always scoped
to `season.id` (`api.addPlayer(season.id, name, seniority)`), called from the season-management
page — there is no "create season, inherit active roster" action anywhere in `repo.ts`, `api.ts`,
or the frontend.

`season_players.seasons` is the per-season seniority counter (`docs/domain-model/glossary.md`
"Antigüedad"), not attendance — it's a second reason the row must exist per season: it's where that
season's seniority value lives, not just an activity flag.

# Design — WP-001-season-player-match-lifecycle

**Depth: deep.** This WP drops two schema columns read/written from several call sites
(`seasons.is_active`, `season_players.active`), redefines a third's meaning
(`season_players.seasons`), and moves _when_ a point is granted. Once real weekly data sits on the
new shape it is expensive to walk back, and feedback is slow — one operator, one game a week.

**Artifact types:** Database (table, column, migration), Code (module/function under
`server/src/domain/`, `server/src/repo.ts`, `server/src/routes/api.ts`), Frontend (component,
`web/src/pages/*.tsx`).

**Output budget:** long — schema, three new/changed domain modules, ~8 route changes, four
frontend areas. Agreed with the author alongside `design/agenda.md`.

This document is written increment by increment per `design/agenda.md`. Sections below hold
Increment 0's content; later increments extend the tables and, where an existing global section
needs a new global point, that section — not a duplicate.

## 1. Current State Analysis

**Schema** (`server/src/db/schema.sql`): `seasons.is_active` (line 11) is the sole flag today's
`activeSeason()` (`repo.ts:43`) reads and `activateSeason()` (`repo.ts:97`) writes; `web/src/App.tsx:21`
picks the active season from it client-side. `season_players.active` (`schema.sql:33`) is written by
`addPlayer` (`repo.ts:130-135`, always `active = 1` on conflict) and `updateSeasonPlayer`
(`repo.ts:156-160`, the only place it's ever set to 0); nothing currently reads it back — no `WHERE
active = 1` filter exists anywhere in `repo.ts` (`verified — source`, exhaustive grep over
`\.active\b` in `server/src`). `season_players.seasons` (`schema.sql:32`, `DEFAULT 1`) is written by
`addPlayer` (default argument `seasons = 1`, `repo.ts:124`) and read by `standings()`
(`repo.ts:402,407`) into `computePoints`'s `seasons` input (`points.ts:34`, `seniorityPoints`).

**Migration mechanism** (`verified — source`, `git log --follow -- server/src/db/schema.sql`: one
commit total, no `ALTER TABLE` anywhere in its history): `schema.sql` runs
`CREATE TABLE IF NOT EXISTS` idempotently on every boot (`db/index.ts:16-18`) — it has never had to
change an existing table's shape. `npm run seed -- --reset` (`scripts/import-season.ts:33,78-83`)
only deletes rows for one named season (cascading via `ON DELETE CASCADE`), not the schema itself,
so it cannot apply a column drop/redefinition on its own.

**Deployment** (`verified — document`, `README.md` §"Despliegue en la Raspberry"): a single Pi
process reading `data/pachanguero.db` (or `$PACHANGUERO_DB`), backed up by `sqlite3 .backup`. The
author confirmed (this phase) that neither that DB nor any local one holds real data beyond what
`npm run seed` reproduces from `data/seed/*.csv` — `author decision`, recorded because it changes
which migration mechanism is safe (see Approach).

**Name matching**: no prior art (`verified — source`, Study Q-05: no alias/nickname table, no
text-parsing/normalization code anywhere under `server/src` or `server/scripts`). `players.name`
(`schema.sql:24`) is the only matching key today, `TEXT NOT NULL UNIQUE`.

## 2. Approach

This increment lays the four schema changes every later increment reads (season/roster decoupling,
the introducing-player link, aliases, the weekly schedule) and the one piece of genuinely new domain
logic with no existing code to extend: decoration-stripping name/alias matching. Nothing here is
user-visible yet — no route or screen changes until Increment 1 onward — so it is verified purely at
the schema and domain-function level, by a real (temp-file) SQLite DB per the new
`docs/test-strategy.md` integration layer, and by hand-run/unit-tested examples for the matching
module.

The schema changes land as edited `CREATE TABLE` statements in `schema.sql` itself, not an `ALTER
TABLE` migration. Rejected alternative: an in-place `ALTER TABLE ... DROP COLUMN` / rebuild
migration, preserving whatever rows exist on disk. This is the reversible, low-risk choice in
general — but it entails writing and testing a one-off, never-reused migration path for a mechanism
(`schema.sql` idempotent boot) that has never needed one, purely to protect rows the author confirmed
don't exist. Given that confirmation (Current State Analysis, above), the wipe-and-reseed path is
strictly simpler with no offsetting risk, and matches the project's own stated freedom
(`VISION.md` §5: schema and data may be freely changed, undone, or redone). Operators clear
`data/pachanguero.db` and run `npm run seed` after this change ships (File Changes → Migrate).

The weekly-schedule table (F4) is append-only/versioned rather than a single mutable row with an
`effective_from` column edited in place. Rejected alternative: one row per config item, updated
when it changes. That can only ever answer "what is the setting now," but UC-001-08-S3 requires
answering "what was the setting in effect for a date in the past" (already-resolved games must not
be recomputed under a later change) and the author's own account of the setting changing more than
once in a season. A single mutable row cannot represent that history at all; append-only rows,
picked by `MAX(effective_from) WHERE effective_from <= :date`, can.

## 3. Interface Specification

No REST interface changes in this increment — `F1`–`F4` are storage only, consumed by later
increments' routes; `F5` is an internal domain function, not yet wired to any endpoint. See each
element's LLD below for function/table shapes.

## 4. Data Contract Verification

**F1** (`seasons`, `season_players`): stored shape after this increment —
`seasons` drops `is_active`; `season_players` drops `active`, keeps `(season_id, player_id, seasons)`
with `seasons DEFAULT 0`. No consumer of the dropped columns survives past Increment 1 (F6 replaces
`activeSeason()`'s reader, F7/F8 replace `addPlayer`'s writer) — traced in each element's own LLD
below, since the _removal_ of the last consumer is this increment's job but the _replacement_
behaviour is Increment 1's.

**F2** (`players.introduced_by`): nullable self-FK, written by Increment 3's registration endpoint
(F16), read by Increment 3/5's resolution views (F17/F24) to show "brought by." No writer or reader
exists yet in this increment — the column is added ahead of its consumers because F1 already touches
`schema.sql` in the same pass (Approach).

**F3** (`player_aliases`): written by Increment 3's alias-save flow (F16, UC-001-09-S1), read by F5's
matching function in every later increment that pastes text (F13, F16, F21). This increment defines
the shape and the uniqueness rule; Data Contract for its create/update/delete path is F16's, once
written — flagged forward here so it isn't lost (§12 Risks).

**F4** (`weekly_schedule`): written by Increment 2's schedule-config endpoint (F11), read by F12
(game-for-date resolution) and F20 (final-list cutoff). This increment defines the shape only.

**F5** (matching module): pure function, no storage of its own; consumes `players.name` and
`player_aliases.alias` (both `TEXT`), returns a match/no-match/ambiguous result over in-memory
arrays passed to it by its future callers (F13/F16/F21) — those callers own the DB read.

## 5. Impacted Units

| Unit               | Type        | Location                        | Action | Notes                                                  |
| ------------------ | ----------- | ------------------------------- | ------ | ------------------------------------------------------ |
| `seasons`          | table       | `server/src/db/schema.sql`      | Modify | drop `is_active`                                       |
| `season_players`   | table       | `server/src/db/schema.sql`      | Modify | drop `active`; `seasons` semantics change, `DEFAULT 0` |
| `players`          | table       | `server/src/db/schema.sql`      | Modify | add `introduced_by`                                    |
| `player_aliases`   | table       | `server/src/db/schema.sql`      | Create | new                                                    |
| `weekly_schedule`  | table       | `server/src/db/schema.sql`      | Create | new, append-only                                       |
| `stripDecorations` | function    | `server/src/domain/matching.ts` | Create | new                                                    |
| `matchName`        | function    | `server/src/domain/matching.ts` | Create | new                                                    |
| `matching.test.ts` | test module | `server/src/domain/`            | Create | new                                                    |

## 6. Refactors

Pure new functionality — no element in this increment changes structure without changing behaviour
or adding data.

## 7. Patterns and Conventions

Schema changes follow the project's existing convention exactly: additive/idempotent
`CREATE TABLE IF NOT EXISTS` in `schema.sql` (`AGENTS.md` "Architecture"), never a separate migration
file — this increment's wipe-and-reseed handling (§2) is the one-time exception the confirmed absence
of real data allows, not a new standing mechanism. `matching.ts` follows the existing
`server/src/domain/` convention: pure functions, no SQLite/HTTP import, colocated `.test.ts`
(`points.ts`, `seniority.ts`, `convocatoria.ts` are the precedent — `verified — source`,
`server/src/domain/` directory listing).

## 8. Unit Communication

Increment 0 has no runtime call flow of its own: `matching.ts`'s functions are called by no one yet
(Increment 3 wires them in). The schema tables are read/written starting Increment 1 (`seasons`,
`season_players`) and Increment 2–5 (`players.introduced_by`, `player_aliases`, `weekly_schedule`).

## 9. New Functionality

| #   | Feature                                                                               | Component       | Units                           | Scenarios                                | Status   | Verification                                                                                                                                   | Mandatory Reading                                              |
| --- | ------------------------------------------------------------------------------------- | --------------- | ------------------------------- | ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| F1  | Drop `seasons.is_active` + `season_players.active`; redefine `season_players.seasons` | Database        | `seasons`, `season_players`     | UC-001-01-S1,S2,S5; UC-001-02-S2         | terminal | integration test against a real temp-file SQLite DB (`docs/test-strategy.md` §Integration) asserting the columns are gone and the default is 0 | `AGENTS.md` §Architecture, §Domain invariants                  |
| F2  | `players.introduced_by`                                                               | Database        | `players`                       | UC-001-04-S2, UC-001-03-S4, UC-001-06-S7 | terminal | schema test: FK accepts a valid player id, `ON DELETE SET NULL` on the introducer's deletion                                                   | `AGENTS.md` §Architecture                                      |
| F3  | `player_aliases` table                                                                | Database        | `player_aliases`                | UC-001-09-S1,S2                          | terminal | schema test: two players cannot share one alias (case-insensitively); one player can hold N aliases                                            | `AGENTS.md` §Architecture                                      |
| F4  | `weekly_schedule` table                                                               | Database        | `weekly_schedule`               | UC-001-08-S3                             | terminal | schema test: querying "the setting in effect on date D" picks the row with the latest `effective_from <= D`                                    | `AGENTS.md` §Architecture                                      |
| F5  | Name/decoration-matching module                                                       | Matching domain | `stripDecorations`, `matchName` | UC-001-03-S7,S8; UC-001-09-S3            | terminal | Vitest unit tests, hand-run against §2's worked examples below                                                                                 | `AGENTS.md` §Architecture (`domain/` pure-function convention) |

#### F1 — Drop `seasons.is_active` + `season_players.active`; redefine `season_players.seasons`

**Interface Specification.** New `seasons` shape (all other columns unchanged from today):

```sql
CREATE TABLE IF NOT EXISTS seasons (
  id                   INTEGER PRIMARY KEY,
  name                 TEXT    NOT NULL UNIQUE,
  starts_on            TEXT,
  ends_on              TEXT,
  price_cents          INTEGER NOT NULL DEFAULT 5600,
  slots                INTEGER NOT NULL DEFAULT 14,
  mercy_seats          INTEGER NOT NULL DEFAULT 1,
  games_out_for_mercy  INTEGER NOT NULL DEFAULT 2,
  mercy_resets_counter INTEGER NOT NULL DEFAULT 0,
  demotion_direction   TEXT    NOT NULL DEFAULT 'bottom-up'
                         CHECK (demotion_direction IN ('bottom-up','top-down')),
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

New `season_players` shape:

```sql
-- seasons: complete prior seasons as of this season (0 = brand-new player). Row
-- is created lazily on a player's first appearance in this season (Increment 1),
-- never by an explicit "enrol" action.
CREATE TABLE IF NOT EXISTS season_players (
  season_id INTEGER NOT NULL REFERENCES seasons(id)  ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  seasons   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, player_id)
);
```

`starts_on`/`ends_on` are untouched by this element; UC-001-01-S5's derivation of "the current
season" from them is Increment 1's (F6), not this element's — this element only removes the
now-redundant flag it replaces.

**Test Methodology.** Fully automatable. Integration-level (`docs/test-strategy.md` §Integration):
open a temp-file SQLite DB against the new `schema.sql`, assert `PRAGMA table_info(seasons)` and
`PRAGMA table_info(season_players)` no longer list the dropped columns, and that an inserted
`season_players` row with no explicit `seasons` value reads back `0`.

#### F2 — `players.introduced_by`

**Interface Specification.**

```sql
CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL UNIQUE,
  introduced_by INTEGER REFERENCES players(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

Self-referential, nullable — most players have no introducer. `ON DELETE SET NULL` rather than
`CASCADE`: deleting the introducer must not delete the guest they brought (`inferred` from
UC-001-04-S2's "kept for later reference," which presumes the guest's own record outlives the
specific lookup need).

**Test Methodology.** Fully automatable. Integration-level: insert a player with `introduced_by`
pointing at another player's id; delete the introducer; assert the guest row survives with
`introduced_by NULL`.

#### F3 — `player_aliases`

**Interface Specification.**

```sql
-- One row per recognized nickname/decoration variant. `alias` is
-- case-insensitively unique across all players so a pasted name never
-- resolves ambiguously between two people's alias lists (matching, F5).
CREATE TABLE IF NOT EXISTS player_aliases (
  id        INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  alias     TEXT    NOT NULL COLLATE NOCASE,
  created_at TEXT   NOT NULL DEFAULT (datetime('now')),
  UNIQUE (alias)
);
CREATE INDEX IF NOT EXISTS idx_player_aliases_player ON player_aliases(player_id);
```

`UNIQUE (alias)` with `COLLATE NOCASE` stops two players from ever claiming the same nickname, but
cannot by itself stop an alias colliding with a _different_ player's canonical `players.name` (that
lives in another table). This cross-table check is deferred to whoever writes aliases —
**deferred — R1, resolved by F16's design** (Increment 3): F16 is the only place an alias is ever
created (UC-001-09-S1), and it cannot be decided here without knowing F16's own registration flow,
which does not exist yet.

**Test Methodology.** Fully automatable. Integration-level: inserting the same alias string (any
case) for a second player raises the DB's unique-constraint error; one player accumulates 3+ aliases
with no cap.

#### F4 — `weekly_schedule`

**Interface Specification.**

```sql
-- Global (not per-season), append-only: a change inserts a new row rather than
-- editing one in place, so "what was the setting on date D" stays answerable
-- for any D, past or future (UC-001-08-S3).
CREATE TABLE IF NOT EXISTS weekly_schedule (
  id             INTEGER PRIMARY KEY,
  weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sunday .. 6=Saturday (JS Date convention)
  kickoff_time   TEXT    NOT NULL,   -- 'HH:MM', 24h
  effective_from TEXT    NOT NULL,   -- date this setting starts applying, inclusive
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_weekly_schedule_effective ON weekly_schedule(effective_from);
```

The setting in effect for date `D` is the row with the greatest `effective_from <= D`
(`SELECT * FROM weekly_schedule WHERE effective_from <= @d ORDER BY effective_from DESC LIMIT 1`) —
this query is the resolution logic F12/F20 will call; not written yet, since no caller exists this
increment.

`assumed`: `weekday` as an integer 0–6 rather than a day name string. Nothing in the requirements
fixes the representation; 0–6 matches JavaScript's own `Date.getDay()`, which both `domain/` (pure
TS) and the frontend already use as their native date type — an integer avoids a
name/locale-mapping step at every read. Flagged to the author as an implementation convenience, not
a requirements-driven choice.

**Test Methodology.** Fully automatable. Integration-level: insert three rows with increasing
`effective_from`; the "setting in effect" query picks the middle one for a date between the second
and third `effective_from`, and the first one for a date before the second's.

#### F5 — Name/decoration-matching module

**Approach.** `stripDecorations(raw: string): string` removes, in order: a leading list marker
(bullet or number, with optional `.`/`)` and following whitespace), any emoji/pictographic
characters anywhere in the string, then collapses/trims whitespace. `matchName(text, players,
aliases): MatchResult` strips the input, then compares it case-insensitively against every player's
`name` and every `player_aliases.alias`, returning `{ status: 'matched', playerId }`,
`{ status: 'unresolved' }` (zero hits), or `{ status: 'ambiguous', playerIds }` (more than one hit —
defensive; F3's `UNIQUE(alias)` and `players.name`'s own `UNIQUE` make this unreachable for aliases
vs. aliases or names vs. names, but not yet for an alias colliding with a _different_ player's
canonical name, per F3's own open cross-check). Never guesses (`VISION.md` §4) — `ambiguous` and
`unresolved` both route to the same resolution view in later increments (F16/F17), never a fallback
pick.

**No runnable code in this phase** — worked by hand against UC-001-03-S7's own table:

| input           | after list-marker strip  | after emoji/whitespace strip | matches                   |
| --------------- | ------------------------ | ---------------------------- | ------------------------- |
| `5 Álvaro R ⚽` | `Álvaro R ⚽`            | `Álvaro R`                   | canonical name `Álvaro R` |
| `• Pablo`       | `Pablo`                  | `Pablo`                      | canonical name `Pablo`    |
| `  Facu   `     | `Facu` (trim; no marker) | `Facu`                       | canonical name `Facu`     |

`not yet run` — Increment 0's own Vitest suite (`matching.test.ts`) is where this is actually
executed; the hand trace above is what that suite must reproduce.

**Interface Specification.**

```ts
export interface PlayerRef {
  id: number;
  name: string;
}
export interface AliasRef {
  playerId: number;
  alias: string;
}

export function stripDecorations(raw: string): string;

export type MatchResult =
  | { status: 'matched'; playerId: number }
  | { status: 'unresolved' }
  | { status: 'ambiguous'; playerIds: number[] };

export function matchName(
  text: string,
  players: PlayerRef[],
  aliases: AliasRef[]
): MatchResult;
```

**Test Methodology.** Fully automatable. Unit-level (`docs/test-strategy.md` §Unit): the three
worked examples above, plus alias resolution (UC-001-03-S8's `Guti`/`Gutito`/`Jorge` →
`Jorge Gutiérrez` table), plus one unresolved case and one contrived ambiguous case
(`players`/`aliases` arrays constructed in-test to collide, since the DB itself won't produce one —
see F3).

## 10. Architecture

Components this WP introduces or touches, named here once so every later increment's element rows
cite the same vocabulary (Design Agenda, `Component` column):

- **Database** — `server/src/db/schema.sql`.
- **Season/Roster domain** — season lifecycle, roster availability, seniority capture (UC-001-01/02).
- **Schedule domain** — weekly game-day/kickoff config and date resolution (UC-001-08/10).
- **Matching domain** — `server/src/domain/matching.ts` (this increment, F5).
- **Candidate stage** — Sunday paste, resolution, registration, aliases (UC-001-03/04/09).
- **Convocatoria** — existing `domain/convocatoria.ts` plus the new arrival-order branch (UC-001-05).
- **Final stage** — post-game paste, resolution, billing, retraction (UC-001-06/10).
- **Backfill** — historical game entry (UC-001-07).
- **Frontend** — `web/src/pages/*.tsx`.

No change to the existing layering (`AGENTS.md` §Architecture: `domain/` → `db/`/`repo.ts` →
`routes/` → `web/`) — every new component slots into that same stack; none of this increment's
elements cross it (schema stays in `db/`, matching stays a pure `domain/` module).

## 11. File Changes

**Modify**

- `server/src/db/schema.sql` — F1 (drop columns, redefine default), F2 (`players.introduced_by`).

**Create**

- `server/src/db/schema.sql` — F3 (`player_aliases`), F4 (`weekly_schedule`) — same file, new tables.
- `server/src/domain/matching.ts` — F5.
- `server/src/domain/matching.test.ts` — F5.

**Delete:** none.

**Migrate:** delete `data/pachanguero.db` (and any developer's local copy) and run `npm run seed`
after this increment merges — `author decision`, confirmed safe this phase (§1, §2). Document this
as a one-time step in the PR/commit that lands it; no code-level migration script, per §2's rejected
alternative.

**Tests:** `server/src/domain/matching.test.ts` (new); a new integration spec exercising the schema
directly (temp-file DB, no route yet to hook it to) — file path decided when Increment 1 adds the
first route-level integration test alongside it, per `docs/test-strategy.md` §Integration
(`server/src/routes/*.test.ts`), so this increment's schema assertions can move there rather than
living in a standalone throwaway file. **Deferred — R3, resolved by Increment 1's first route test
file existing** — deciding the exact file now, before any route test exists to place it beside,
would be a guess with no benefit (cheap to place once Increment 1 exists, per R3).

**Docs:** none yet. `docs/domain-model/glossary.md` and `convocatoria.md` (`study/doc-map.md`, Q-07)
are updated once the vocabulary they need (candidate, final convocatoria, ephemeral guest) has
actually been built — Increment 3 onward, not this purely-structural increment.

## 12. Risks

- **Wiping the DB loses anything not in the CSV seed.** Handled: confirmed with the author this
  phase that no such data exists yet (§1); the migration step is documented explicitly in File
  Changes so it isn't missed by whoever deploys next.
- **`player_aliases.alias` can still collide with another player's canonical `players.name`,
  unprotected by any constraint written so far.** Handled: named explicitly in F3's own LLD and
  carried forward as a deferral (R1) onto F16 (Increment 3), rather than silently left for whoever
  writes that endpoint to rediscover.
- **`weekday` as an integer is an implementation guess, not a requirements citation.** Handled:
  flagged `assumed` in F4's LLD, owed to the author as a confirmation (see "Still owed," below).

## 13. Test Methodology

Per `docs/test-strategy.md`: this increment is entirely unit (F5, Vitest against pure functions) and
integration (F1–F4, Vitest against a real temp-file SQLite DB built from the actual `schema.sql` —
never a mocked DB, per the strategy doc's own rule). No E2E test applies — nothing here is reachable
through the browser yet (no route, no screen).

**Testability Assessment**

| #   | Element                 | Fully automatable? | Manual verification needed |
| --- | ----------------------- | ------------------ | -------------------------- |
| F1  | Drop/redefine columns   | Yes                | —                          |
| F2  | `players.introduced_by` | Yes                | —                          |
| F3  | `player_aliases`        | Yes                | —                          |
| F4  | `weekly_schedule`       | Yes                | —                          |
| F5  | Matching module         | Yes                | —                          |

## 14. Diagrams

One diagram: the schema delta this increment makes (before/after for the four touched tables),
under `design/diagrams/increment-0-schema.puml`, linked from §1/§9. Drawn via `skill: auctor-diagrams`
on completion of this increment.

## 15. Configuration

`weekly_schedule` (F4) is itself new, versioned configuration — see F4's LLD for its keys
(`weekday`, `kickoff_time`, `effective_from`) and the "no single current value" shape. No
environment-variable or `.env`-level configuration is introduced by this increment (`README.md`
§Configuración's existing `PORT`/`HOST`/`PACHANGUERO_DB` are untouched).

## 16. Deployment Design

No deployable-artifact change beyond the schema file already covered by the normal build/deploy
path (`README.md` §"Despliegue en la Raspberry": `npm ci && npm run build`, systemd restart). The
one operational step this increment adds is the DB wipe+reseed in File Changes → Migrate, to be run
manually as part of that deployment, once, when this increment lands — not a rollback-relevant
change (rollback would mean redeploying the prior `schema.sql`, which the wiped-and-reseeded DB
would no longer match either; out of scope to design for, since the author has already accepted
freely redoing the DB as needed at this stage, `VISION.md` §5).

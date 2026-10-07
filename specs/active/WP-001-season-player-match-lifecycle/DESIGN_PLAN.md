# Design Plan — WP-001-season-player-match-lifecycle

**Depth: deep.** This work package drops two schema columns (`seasons.is_active`,
`season_players.active`), redefines a third's meaning (`season_players.seasons`), and adds four
new tables spanning the whole backend layering (schema → domain → repo → routes) plus two frontend
pages. A wrong shape here is expensive to unwind once real season data sits on it, and is only
discovered once the paste-and-resolve flows are actually used — that combination of high
irreversibility and slow feedback puts it at the deep end.

Artifact types declared: **Database** (table, column), **Code** (class — `server/src/domain/`,
`server/src/repo/`, no free functions, no stateless `static` methods, per
`.agents/rules/coding-standard.md`), **Frontend** (component, per
`.agents/rules/frontend-coding-standard.md`).

## 1. Current Implementation

Read: `REQUIREMENTS.md` (this work package), `AGENTS.md`, `docs/domain-model/README.md`, and the
Study's doc map (`study/doc-map.md`, Q-07).

The backend is four layers (`AGENTS.md` "Architecture"): `server/src/db/schema.sql` (idempotent
`CREATE TABLE IF NOT EXISTS`, no migration system — additive edits are the stated mechanism),
`server/src/domain/` (four classes: `PointsCalculator`, `SeniorityCurve`, `ConvocatoriaBuilder`,
`ExclusionHistory` — `points.ts`, `seniority.ts`, `convocatoria.ts`, `exclusion-history.ts`), an
`Contender`/`ConvocatoriaResult`/`SeasonRules` type module (`domain/types.ts`), `server/src/repo/`
(one repository/service class per table cluster, composed in `repo/index.ts`), and
`server/src/routes/api.ts` (one Express router, the `route()` wrapper turning throws into 400s —
verified — source, `routes/api.ts:19-27`). The web app is React 18 + Vite with three pages
(`GameDay.tsx`, `Manage.tsx`, `Standings.tsx`) under one `App.tsx` (verified — source,
`web/src` listing).

Today's season/roster/game/convocatoria mechanics this work package changes:

- **Season activation is manual and exclusive.** `SeasonRepository.activate(id)` zeroes every
  season's `is_active` then sets one (verified — source, `season-repository.ts:100-107`);
  `active()` reads `WHERE is_active = 1` (verified — source, `season-repository.ts:56-60`). Nothing
  derives "current" from a date.
- **Roster enrollment is per-season and gated.** `PlayerRepository.add(seasonId, name, seasons)`
  both creates the `players` row (`INSERT OR IGNORE`) and enrolls it into `season_players` with
  `seasons` defaulting to `1` and `active` defaulting to `1` (verified — source,
  `player-repository.ts:25-49`, `schema.sql` `season_players.active INTEGER NOT NULL DEFAULT 1`).
  `PlayerRepository.list(seasonId)` only returns rows already enrolled in that season (verified —
  source, `player-repository.ts:13-22`) — a player absent this season is invisible to it, which is
  exactly what UC-001-01-S1/S2 remove.
- **Candidate signup and payment/attendance share one table with no ordering.**
  `participations(game_id, player_id, signed_up, played, paid_cents, paid_on, guests, note)` has no
  position column and no distinction between a regular and a guest (verified — source,
  `schema.sql`, `participations` table). `ConvocatoriaService.preview` reads `signed_up = 1` rows
  directly as the candidate pool with no resolution/staging step at all (verified — source,
  `convocatoria-service.ts:30-35`) — there is currently no paste-and-match step in the backend; the
  candidate list is however it got into `participations` today (manually, per the current UI).
- **Commit finalizes attendance in the same transaction as selection.**
  `ConvocatoriaService.commit` calls `this.participations.set(gameId, e.playerId, { played: e.playing })`
  for every entry it writes (verified — source, `convocatoria-service.ts:87`) — this is exactly the
  behaviour UC-001-05-S2 reverses.
- **No name matching, no aliases, no schedule, no introducing-player link, no team split exist at
  all.** Grep confirms no `alias`, `schedule`, or `introduced_by` symbol anywhere in
  `server/src` (verified — source, absence).
- **`ConvocatoriaBuilder.build` takes `Contender[]` keyed by a real `playerId: number`** (verified —
  source, `domain/types.ts:52-56`, `convocatoria.ts:31-47`) and is explicitly out of scope
  (`VISION.md` §3; `REQUIREMENTS.md` §6) — this work package must feed it real player ids only, or
  else run a different path entirely for the regulars-≤-slots case (UC-001-03-S6), never modify it.
- **The project has no migration system** (`AGENTS.md`: "additive edits to `schema.sql` are the
  mechanism") and no committed database fixture ships in the repo — `data/pachanguero.db` and the
  e2e database are both git-ignored (verified — source, `.gitignore`). Since this work package is
  not in production and the author has stated the data may be freely discarded (`VISION.md` §5),
  R1's column drops are edited directly into `schema.sql` with no migration step at all (§2.6 R1) —
  the local database file is recreated, not migrated.

LSP find-references was run (per this section's mandatory rule) on every symbol this design retires
or repurposes before committing to removing it:

- `seasons.is_active` / `SeasonRepository.activate` / `.active()`: consumers are
  `routes/api.ts` (`GET /seasons/active`, `POST /seasons/:id/activate`) and nothing in
  `domain/` or `web/src` beyond the page that calls those two routes (verified — source, grep for
  `is_active` and `\.active\(` across `server/src`, `web/src`).
- `season_players.active` / `PlayerRepository.updateSeasonPlayer`'s `active` patch: no reader
  anywhere — `PlayerRepository.list` selects it but no caller filters on it, and no route exposes a
  read of the raw flag (verified — source, grep for `\.active\b` in `player-repository.ts` and its
  callers).
- `season_players.seasons`: written by `PlayerRepository.add`/`updateSeasonPlayer`, read by
  `StandingsService.standings` (`p.seasons` → `PointsCalculator.compute({ seasons: p.seasons, … })`,
  verified — source, `standings-service.ts:89,94`). Redefining its meaning (UC-001-02-S2) changes
  this one read site's input, not its shape — `PointsCalculator.compute` is untouched.
- `participations.played` writers: today exactly one call site,
  `ConvocatoriaService.commit` (verified — source, grep for `\.participations\.set\(` and
  `played:` across `server/src`). UC-001-05-S2 removes it from there; UC-001-06's success
  criterion (`REQUIREMENTS.md` §5) requires this stay the _only_ writer once the final-list element
  lands — tracked as this design's own completeness check, not assumed.

## 2. High Level Design

### 2.1 Architecture

Five components, derived from the concrete units below (never the reverse):

| Component                   | Responsibility                               | Existing units                                                                                                                                        | New/changed units this WP adds                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database Schema**         | persisted shape                              | `seasons`, `season_players`, `players`, `games`, `participations`, `exclusions`, `convocatorias`, `convocatoria_entries`                              | drop `seasons.is_active`, `season_players.active`; redefine `season_players.seasons`; add `players.introduced_by`, `player_aliases`, `weekly_schedule`, `guest_candidates`, `participations.team`                                                                                                                                                                                  |
| **Domain**                  | pure rules, no I/O                           | `PointsCalculator`, `SeniorityCurve`, `ConvocatoriaBuilder`, `ExclusionHistory` (all unchanged)                                                       | `NameMatcher`, `ScheduleResolver`, `GuestSlotAllocator`, `SeasonCalendar`, `SeniorityAdvisor`, `CandidateLineParser`, `FinalListParser` (new classes; `SeasonCalendar`/`SeniorityAdvisor`/`CandidateLineParser` found while drafting F1/F2/F6's Low Level Design; `FinalListParser` found while drafting F9's)                                                                     |
| **Repositories & Services** | SQLite ↔ domain, composed in `repo/index.ts` | `SeasonRepository`, `PlayerRepository`, `GameRepository`, `ParticipationRepository`, `ExclusionRepository`, `StandingsService`, `ConvocatoriaService` | `AliasRepository`, `ScheduleRepository`, `GameDayResolutionService`, `FinalListTargetResolver`, `PlayerRegistrar`, `GuestCandidateRepository`, `CandidateResolutionService`, `FinalListResolutionService` (all found while drafting F3-F9's Low Level Design); `SeasonRepository`, `PlayerRepository`, `GameRepository`, `ParticipationRepository`, `ConvocatoriaService` modified |
| **API Routes**              | one Express router                           | `routes/api.ts`                                                                                                                                       | new endpoints (§2.4), removed `activate`/season-enrollment/manually-seasoned-game-creation endpoints                                                                                                                                                                                                                                                                               |
| **Web UI**                  | React pages                                  | `GameDay.tsx`, `Manage.tsx`, `Standings.tsx`                                                                                                          | `GameDay.tsx` gains the paste/resolution views; `Manage.tsx` gains schedule/alias settings, loses "activate season"/"add player to season" controls; `Standings.tsx` unchanged unless a column is needed for a new participant kind (none identified — guests never appear in standings, §2.9)                                                                                     |

Diagram: [architecture-components.puml](design/diagrams/architecture-components.puml).

### 2.2 Approach

The solution keeps the existing four-layer shape and adds three domain classes (`NameMatcher`,
`ScheduleResolver`, `GuestSlotAllocator`) plus four schema additions (`player_aliases`,
`weekly_schedule`, `guest_candidates`, `participations.team`) alongside two structural removals
(`seasons.is_active`, `season_players.active`). Nothing about the request/response shape becomes
stateful across requests: a candidate or final-list paste is resolved and re-submitted in the same
round trip the Organizer is already used to (re-paste replaces, UC-001-03-S9), so no new
"draft"/"pending resolution" table is introduced — resolution state lives in the client's own
component state until the Organizer confirms it, exactly like today's paste box already works,
just smarter.

This shape follows directly from three of the author's own decisions rather than being chosen
freely: seasons must stop gating the roster (UC-001-01), the algorithm itself must not change
(`VISION.md` §3), and the input channel must stay a thin REST layer so a future Telegram bot needs
no rework (`REQUIREMENTS.md` §6). Given those, the domain layer is the only place new _rules_ can
live (matching, schedule resolution, guest ordering), and the repo layer is the only place new
_state_ can live — which is why three new domain classes and four schema additions, rather than
folding the new logic into existing repository methods or routes.

**What is sacrificed:** guest candidacy is genuinely ephemeral (no persistent identity,
`VISION.md`/UC-001-03-S5) but still needs a stable ordering across one game's candidate-to-final
lifecycle; the tradeoff is one new table (`guest_candidates`) scoped to a single game rather than
reusing `participations` (which requires a real `player_id`) — a small schema footprint traded for
never inventing throwaway player rows that would otherwise leak into standings/points.

**Decision, author-confirmed:** `seasons.is_active` and `season_players.active` are dropped outright
by editing their `CREATE TABLE` statements directly in `schema.sql` — no `ALTER TABLE … DROP
COLUMN`, no guard, no migration helper in `db/index.ts`. `schema.sql`'s `CREATE TABLE IF NOT
EXISTS` only ever _creates_; it never alters a table that already exists, so an existing local
database file still carrying the old columns is not touched by this edit and must be discarded
(deleted, or reseeded via `npm run seed -- --reset`) for the new shape to take effect. The author's
own standing instruction governs here (`VISION.md` §5, restated this phase: not in production,
free to break and redo the data 100%) — so this is not treated as a migration problem at all, only
as a schema-definition edit plus an operational note to whoever next runs the app locally.

### 2.3 Impacted Units (Component level)

Filled in progressively as each element's Low Level Design subsection is drafted (not up front);
seeded here only with the units already named by the Architecture inventory above.

| Unit                                          | Type | Location | Action | Notes |
| --------------------------------------------- | ---- | -------- | ------ | ----- |
| _(populated per element during LLD drafting)_ |      |          |        |       |

### 2.4 Interface Specification

Endpoint shapes are `not yet run` (no code exists) and Design's to fix per `REQUIREMENTS.md` §3.
Concrete request/response bodies are specified per element in Low Level Design, not repeated here;
this table is the whole-solution inventory only.

| Endpoint                                     | Replaces                                     | Notes                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/seasons`                          | unchanged shape, drops any `is_active` field |                                                                                                                                                                                                                                                                                                                                   |
| `GET /api/seasons/current`                   | `GET /api/seasons/active`                    | derives from today's date, no stored flag                                                                                                                                                                                                                                                                                         |
| `GET`/`PUT /api/schedule`                    | (new)                                        | versioned by `effective_from`; returns the row effective for a given date via `?on=`                                                                                                                                                                                                                                              |
| `POST /api/games/:gameId/candidates:paste`   | (new)                                        | target game resolved automatically unless `gameId` given explicitly                                                                                                                                                                                                                                                               |
| `POST /api/games/:gameId/candidates/resolve` | (new)                                        | one unresolved name → link existing / register new / save alias                                                                                                                                                                                                                                                                   |
| `POST /api/games/:gameId/convocatoria`       | unchanged trigger                            | branches server-side (§2.6 F8); response shape unchanged (`ConvocatoriaResult`)                                                                                                                                                                                                                                                   |
| `POST /api/games/final:paste`                | (new)                                        | target game resolved automatically (UC-001-10) unless `gameId` explicit (backfill)                                                                                                                                                                                                                                                |
| `POST /api/games/:gameId/final/resolve`      | (new)                                        | mirrors the candidate resolver                                                                                                                                                                                                                                                                                                    |
| `POST /api/games`                            | `POST /api/seasons/:id/games`                | **amended, found while drafting F10**: the existing route required a manually-picked `seasonId` in the URL, which UC-001-07-S4 forbids; this is a genuinely new, season-less route (`{ played_on }` only, season derived via F1's `current(asOf)`), not the old route left unchanged — used only for genuine backfill (UC-001-07) |
| `POST /api/seasons/:id/players` (enrollment) | **removed**                                  | no per-season enrollment left                                                                                                                                                                                                                                                                                                     |
| `POST /api/seasons/:id/activate`             | **removed**                                  | superseded by `GET /api/seasons/current`                                                                                                                                                                                                                                                                                          |

### 2.5 Unit Communication

A paste request flows Web UI → Routes → the relevant resolution service (`CandidateResolutionService`
or `FinalListResolutionService`) → `NameMatcher` (per line) → `PlayerRepository`/`AliasRepository` for
matches and registrations → back to the route with `{ matched, unresolved }`. A commit/resolve
confirmation flows the same path in reverse for persistence: resolution service → `ParticipationRepository`
(regulars, named guests) and/or `GuestRepository` (ephemeral guests) → back with the persisted state.
`ConvocatoriaService.commit`/`preview` additionally consult `ScheduleResolver` only indirectly (the
game itself is already resolved by the time a candidate paste reaches it, per UC-001-08) and choose
between `ConvocatoriaBuilder` (regulars > slots) and the new `GuestSlotAllocator` (regulars ≤ slots) —
a **Strategy** choice made once per commit/preview call, never inside either class.

Sequence diagram: deferred to F6/F8's own Low Level Design subsections (§3), where the
candidate-paste and commit call flows are genuinely non-obvious; not drawn here since the
component-level flow above is a straight pipeline with no branching worth a diagram at this
altitude.

### 2.6 Refactors

| #   | Refactor                                                                               | Component                                | Units                                                | Scenarios                                | Status                                                                                                                                                                                             | Verification                                                 | Mandatory Reading       |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------- |
| R1  | Drop `seasons.is_active` and `season_players.active`; stop gating the roster by season | Database Schema, Repositories & Services | `schema.sql`, `SeasonRepository`, `PlayerRepository` | UC-001-01-S1, UC-001-01-S2, UC-001-01-S3 | terminal — author decision, this phase: edit `schema.sql`'s `CREATE TABLE` statements directly, no guard, no migration helper; the local DB file is discarded/reseeded rather than migrated (§2.2) | existing repo tests pass against a freshly recreated DB file | this HLD (by reference) |

### 2.7 New Functionality

| #   | Feature                                                                                            | Component                                                | Units                                                                                                                                                                                                                                                   | Scenarios                                    | Status                                                                                                                                                                                                                                                                                                         | Verification                                                                                                                                                        | Mandatory Reading |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| F1  | Current season derived from the calendar                                                           | Database Schema, Domain, Repositories & Services         | `SeasonCalendar` (new domain class — found during this element's Low Level Design, added to Architecture §2.1), `SeasonRepository` (`current()` replaces `active()`)                                                                                    | UC-001-01-S5                                 | terminal                                                                                                                                                                                                                                                                                                       | fixture seasons with adjoining Sept 1–Aug 31 ranges; a date in each range resolves to that season, no date resolves to none                                         | this HLD          |
| F2  | Seniority capture on first appearance (0-default, gap-carry, no re-prompt)                         | Domain, Repositories & Services                          | `SeniorityAdvisor` (new domain class, found during this element's Low Level Design), `PlayerRepository` (`hasAppeared`, `suggestSeniority`, `add`'s conflict clause fixed for S3)                                                                       | UC-001-02-S1..S5                             | terminal                                                                                                                                                                                                                                                                                                       | fixtures for returning/brand-new/gap-season players against `SeniorityAdvisor`/`SeniorityCurve` (the latter unchanged)                                              | this HLD          |
| F3  | Weekly schedule + game-day auto-resolution                                                         | Database Schema, Domain, Repositories & Services         | `weekly_schedule` table, `ScheduleResolver`, `ScheduleRepository`, `GameDayResolutionService` (new — found during this element's Low Level Design), `GameRepository`                                                                                    | UC-001-08-S1..S4                             | terminal                                                                                                                                                                                                                                                                                                       | fixture schedule rows across an effective-from change; pastes before/after a mid-season change resolve against the row effective at paste time, never retroactively | this HLD          |
| F4  | Final-list target auto-resolution (cutoff = kickoff + 1h)                                          | Domain, Repositories & Services                          | `ScheduleResolver` (shared with F3), `FinalListTargetResolver` (new — found during this element's Low Level Design; renamed from the HLD's placeholder `FinalListResolutionService`, which is F9's own, larger element, not this one), `GameRepository` | UC-001-10-S1..S3                             | terminal — author decision, this phase: the "+1h" offset is a fixed constant, not itself a configurable setting; only the kickoff time (UC-001-08-S3) is configurable                                                                                                                                          | fixture pastes just before/after the computed cutoff on game day                                                                                                    | this HLD          |
| F5  | Name/alias matching with decoration stripping                                                      | Database Schema, Domain, Repositories & Services         | `player_aliases` table, `NameMatcher`, `AliasRepository` (new — found during this element's Low Level Design), `PlayerRepository.listAll()`                                                                                                             | UC-001-03-S7, UC-001-03-S8, UC-001-09-S1..S3 | terminal                                                                                                                                                                                                                                                                                                       | the author's own WhatsApp-paste fixture (`REQUIREMENTS.md` §5) plus the decoration/alias tables in UC-001-03-S7/S8                                                  | this HLD          |
| F6  | Candidate list paste & resolution (named + ephemeral guests, arrival-order rule)                   | Database Schema, Domain, Repositories & Services, Web UI | `guest_candidates` table, `CandidateLineParser`, `GuestSlotAllocator`, `GuestCandidateRepository`, `CandidateResolutionService` (the latter three found/named during this element's Low Level Design), `GameDay.tsx`                                    | UC-001-03-S1..S6, UC-001-03-S9               | terminal                                                                                                                                                                                                                                                                                                       | the author's 11-regulars-plus-4-guests worked example (UC-001-03-S6), by hand (§"No runnable code")                                                                 | this HLD          |
| F7  | Inline new-player registration (introducing link, collision handling)                              | Database Schema, Repositories & Services                 | `players.introduced_by`, `PlayerRegistrar` (new — found during this element's Low Level Design), shared by `CandidateResolutionService` (F6) and `FinalListResolutionService` (F9)                                                                      | UC-001-04-S1..S5                             | terminal                                                                                                                                                                                                                                                                                                       | fixtures for plain/host-annotated/colliding registration                                                                                                            | this HLD          |
| F8  | Convocatoria commit decoupled from attendance, guest-aware                                         | Domain, Repositories & Services                          | `GuestSlotAllocator` (shared with F6), `ConvocatoriaService.commit`/`preview`                                                                                                                                                                           | UC-001-05-S1..S4                             | terminal — author decision, this phase: resolves the UC-001-03-S6/UC-001-05-S3 contradiction flagged in `REQUIREMENTS.md` — guests (named + ephemeral) are ranked in the same pool as regulars whenever regulars alone exceed `slots`, per UC-001-05-S3, superseding UC-001-03-S6's "no guest competes at all" | exhaustive grep for `participations.played` writers (`REQUIREMENTS.md` §5) stays at zero new ones from this element                                                 | this HLD          |
| F9  | Final list paste & resolution: attendance/payment/team-split source of truth, exclusion retraction | Database Schema, Repositories & Services, Web UI         | `participations.team`, `FinalListResolutionService`, `GameDay.tsx`                                                                                                                                                                                      | UC-001-06-S1..S9                             | terminal                                                                                                                                                                                                                                                                                                       | fixture where an algorithm-excluded player appears in the final list → zero exclusion rows remain for them (UC-001-06-S6)                                           | this HLD          |
| F10 | Historical backfill                                                                                | Repositories & Services                                  | `FinalListResolutionService` (reused, not duplicated), `GameRepository`                                                                                                                                                                                 | UC-001-07-S1..S6                             | terminal                                                                                                                                                                                                                                                                                                       | fixture backfilled game produces zero convocatoria/exclusion rows and prices at its own season's rate                                                               | this HLD          |

_Pure refactor plus new functionality_ — one structural removal (R1), the rest additive.

### 2.8 Documentation Impact

From the Study's doc map (`study/doc-map.md`, Q-07):

- **`docs/domain-model/glossary.md`** — gains entries for candidate, reserve (explicitly
  not-modeled), occasional/guest player, final convocatoria, Claros/Oscuros; corrects "Convocatoria"
  to distinguish the candidate stage from the final stage.
- **`docs/domain-model/convocatoria.md`** — stays accurate on the ranking/mercy algorithm itself
  (unchanged); gains a pointer to wherever candidate-vs-final is now documented, since `played` no
  longer means "final" the moment `ConvocatoriaService.commit` runs (F8).
- **`docs/domain-model/points.md`** — checked in full during F8's Low Level Design; likely needs a
  correction wherever it implies `played` is set once and final.
- **`docs/domain-model/README.md`, `data-quality.md`, `legacy-*.md`** — `None`: historical record of
  the legacy spreadsheet/script, asserts nothing about the current schema being final.

### 2.9 Risks

- **Destructive schema edit, no migration path for existing local data** (R1) — deliberate, not
  mitigated: the author's standing instruction (VISION.md §5) is that pre-production data may be
  freely discarded, so the local DB file is recreated rather than migrated; the only actual risk is
  someone forgetting to discard the old file and getting confusing `CREATE TABLE IF NOT EXISTS`
  no-ops against stale columns, called out as an operational note in R1's own Low Level Design.
- **Ephemeral guest identity leaking into standings/points** if a synthetic id scheme is implemented
  carelessly — mitigated by keeping `guest_candidates.player_id` genuinely `NULL` for ephemeral
  rows and never inventing a real `players` row for them; `GuestSlotAllocator` operates on a
  lightweight ranking type distinct from `Contender`, not on `ConvocatoriaBuilder`'s type.
  `ConvocatoriaBuilder` itself is never called with a fabricated id.
- **Guests never appearing in standings** must hold structurally, not by convention — a named guest
  _does_ appear in standings once registered (they're an ordinary player, UC-001-04-S2), so
  `Standings.tsx` needs no new column; only the ephemeral, no-record guest is excluded, and it has
  no `players` row to appear with in the first place.
- **Boundary at exactly regulars = slots** (UC-001-03-S6's ≤ 14 test) — must be covered explicitly
  by a fixture at F6/F8's Low Level Design, not left to the ≥/> distinction reading naturally from
  prose.
- **Mid-season schedule change retroactivity** — `ScheduleResolver` must resolve against the row
  effective _as of the paste's own date_, never today's date, or a schedule change made after a game
  was auto-created would silently reclassify it; F3's fixture explicitly covers this.
- **`participations.played` write-site drift** — F8's own verification (the exhaustive grep) is this
  design's guard against a future call site reintroducing a second writer; tracked as a review-time
  check, not a runtime assertion, matching `REQUIREMENTS.md` §5's stated success criterion.

### 2.10 Test Methodology

Per `docs/test-strategy.md` and `AGENTS.md`: domain classes get `vitest` unit tests
(`npm test --workspace=server` runs them, pre-commit-gated); repo/service classes get route/
integration tests against a real SQLite file; the paste-and-resolve flows (candidate list, final
list, resolution UI) get Playwright E2E specs (`npm run test:e2e`) against the real server + web dev
server per `e2e/tests/`, since they are genuinely cross-layer (parsing → matching → persistence →
UI feedback) and a unit test alone cannot show the Organizer sees the right thing.

Testability Assessment:

| #   | Element                               | Fully automatable?                      | Manual verification needed |
| --- | ------------------------------------- | --------------------------------------- | -------------------------- |
| R1  | Drop `is_active`/`active`             | Yes                                     | —                          |
| F1  | Current season from calendar          | Yes                                     | —                          |
| F2  | Seniority capture                     | Yes                                     | —                          |
| F3  | Weekly schedule + game-day resolution | Yes                                     | —                          |
| F4  | Final-list target resolution          | Yes                                     | —                          |
| F5  | Name/alias matching                   | Yes                                     | —                          |
| F6  | Candidate paste & resolution          | Yes (Playwright E2E covers the UI half) | —                          |
| F7  | Inline registration                   | Yes (Playwright E2E covers the UI half) | —                          |
| F8  | Convocatoria commit decoupling        | Yes                                     | —                          |
| F9  | Final list paste & resolution         | Yes (Playwright E2E covers the UI half) | —                          |
| F10 | Historical backfill                   | Yes                                     | —                          |

No element is classified `No` — every behaviour here is either pure domain logic (vitest), a
persisted state transition (repo/route tests against real SQLite), or a UI flow Playwright can
drive end to end against the real server, per the project's existing E2E infrastructure. This is a
result to re-check once each element's own Low Level Design is drafted, not assumed to hold for
detail not yet decided.

### 2.11 Patterns and Conventions

- **Repository pattern**, unchanged: one class per table cluster, composed in `repo/index.ts`
  (verified — source, `repo/index.ts`), constructor-injected with `Database.Database` — every new
  repository (`AliasRepository`, `ScheduleRepository`) follows this exactly.
- **Strategy pattern** (new, explicit): `ConvocatoriaService.commit`/`preview` choose between
  `ConvocatoriaBuilder` and `GuestSlotAllocator` based on `regulars.length > rules.slots` — two
  interchangeable selection strategies behind one call site, per `.agents/rules/coding-standard.md`'s
  OOP mandate (no free functions, no stateless statics).
- **No migration system beyond additive `schema.sql` edits** is the stated convention
  (`AGENTS.md`); R1's column drops are edited directly into the `CREATE TABLE` statements, same as
  every other change here — no migration helper is introduced anywhere. The cost of that
  simplicity is carried operationally (discard/recreate the local DB file), never in code.
- **Frontend**: function components + hooks only, per `.agents/rules/frontend-coding-standard.md`;
  the paste/resolution UI is new state inside `GameDay.tsx`, not a new page, since it is one more
  step in that page's existing per-game workflow.

## 3. Low Level Design

#### R1 — Drop `seasons.is_active`/`season_players.active`; stop gating the roster by season

##### Current Implementation

- `schema.sql`: `seasons.is_active INTEGER NOT NULL DEFAULT 0`; `season_players.active INTEGER NOT
NULL DEFAULT 1` (verified — source, `schema.sql`).
- `SeasonRepository.active()` — `SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC`
  (verified — source, `season-repository.ts:56-60`).
- `SeasonRepository.activate(id)` — zeroes every row's `is_active` then sets one, inside a
  transaction (verified — source, `season-repository.ts:100-107`).
- `PlayerRepository.add(seasonId, name, seasons)` — the `ON CONFLICT … DO UPDATE SET seasons =
excluded.seasons, active = 1` clause always forces `active` back to `1` on every call, even a
  no-op re-add (verified — source, `player-repository.ts:36-40`).
- `PlayerRepository.updateSeasonPlayer(seasonId, playerId, patch)` — the `patch.active` branch sets
  `season_players.active` directly (verified — source, `player-repository.ts:63-69`).
- Consumers, per §1's LSP find-references: `routes/api.ts` `GET /seasons/active` (line 42-45) and
  `POST /seasons/:id/activate` (line 60-66) are the only readers of `is_active`/`.activate()`/
  `.active()`; no reader anywhere reads `season_players.active` back out.

##### Approach

Two removals, both edited directly, with no migration code anywhere:

1. **Schema.** Delete `is_active INTEGER NOT NULL DEFAULT 0` from `seasons`'s `CREATE TABLE`
   statement and `active INTEGER NOT NULL DEFAULT 1` from `season_players`'s, in `schema.sql`
   itself. No `ALTER TABLE`, no guard, no check. `CREATE TABLE IF NOT EXISTS` only creates a table
   that doesn't yet exist, so this edit has no effect on a database file that already has the old
   columns — **the operational consequence is that the local `data/pachanguero.db` (or whatever
   `PACHANGUERO_DB` points at) must be deleted, or reseeded via `npm run seed -- --reset`, for the
   new shape to apply.** This is the author's explicit call: pre-production data is disposable, so
   the schema file states the current truth and the database file is thrown away and rebuilt
   rather than migrated in place.
2. **Code.** Delete `SeasonRepository.activate()`, `.active()`, and `is_active` from `SeasonRow`.
   Delete the `active` patch branch and field from `PlayerRepository.updateSeasonPlayer` and
   `PlayerRow`; drop `active = 1` from `add()`'s `ON CONFLICT` clause (the column no longer exists
   to set). Delete `GET /seasons/active` and `POST /seasons/:id/activate` from `routes/api.ts`
   outright — no replacement route is added by this element; F1 adds `GET
/seasons/current` as its own new endpoint, not a rename of this one, since the derivation logic
   is genuinely new, not a like-for-like swap.

**Sequencing note for the anatomy:** between R1 landing and F1 landing, there is no season-derivation
endpoint at all — `GET /seasons/active` is gone and `GET /seasons/current` doesn't exist yet. This
is fine within one design/implementation arc but worth the anatomy keeping R1 and F1 in the same
deliverable if a deployable gap matters; it is a sequencing choice for `auctor-tasks-creator`, not a
design ambiguity — the end state for each element is unambiguous.

##### Impacted Units

| Unit                        | Type        | Location                               | Action | Notes                                                                                                                                 |
| --------------------------- | ----------- | -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `seasons.is_active`         | column      | `server/src/db/schema.sql`             | Delete | edited out of the `CREATE TABLE` statement directly; existing DB files are not migrated, they are recreated                           |
| `season_players.active`     | column      | `server/src/db/schema.sql`             | Delete | same                                                                                                                                  |
| `SeasonRepository`          | class       | `server/src/repo/season-repository.ts` | Modify | remove `activate()`, `active()`; remove `is_active` from `SeasonRow`                                                                  |
| `PlayerRepository`          | class       | `server/src/repo/player-repository.ts` | Modify | remove `active` from `PlayerRow`; remove the `active` patch branch from `updateSeasonPlayer`; drop `active = 1` from `add()`'s upsert |
| `api` router                | module      | `server/src/routes/api.ts`             | Modify | delete `GET /seasons/active`, `POST /seasons/:id/activate`                                                                            |
| `season-repository.test.ts` | test module | `server/src/repo/`                     | Modify | remove tests asserting `activate`/`active()` behaviour                                                                                |
| `player-repository.test.ts` | test module | `server/src/repo/`                     | Modify | remove any assertion on `active`/`season_players.active`                                                                              |

##### Test Methodology

Per the HLD's Test Methodology (§2.10): `vitest` repo tests against a real SQLite file
(`npm test --workspace=server`), no manual verification (Testability Assessment: R1 = Yes). Every
repo test constructs its own database via `TestDatabase.create()` (verified — source,
`season-repository.test.ts:6,10`), and both `data/pachanguero.db` and the e2e database are
git-ignored (verified — source, `.gitignore` lines matching `*.db` / `e2e/.tmp/`) — so no committed
fixture anywhere carries the old columns into a test run. There is nothing to migrate in tests:
existing `season-repository.test.ts` assertions on `season.is_active` (line 20) and any
`player-repository.test.ts` assertion on `active` are simply removed, and no new "migration" test
is needed. The only place the old columns can still exist is a developer's or the Pi's own local,
git-ignored `data/pachanguero.db`, which is an operational concern (Approach, above), not a test.

##### Data Contract Verification

Stored shape before: `seasons.is_active INTEGER` (0/1), `season_players.active INTEGER` (0/1).
After: the columns do not exist; `SeasonRow`/`PlayerRow` drop the corresponding TypeScript fields,
so any stray reference fails at compile time rather than silently reading `undefined`. Full
consumption path, traced end to end:

- **Write:** `SeasonRepository.create`/`update` never wrote `is_active` directly (only `.activate()`
  did); `.activate()` is deleted, so no write path survives. `PlayerRepository.add`/
  `updateSeasonPlayer` are the only writers of `season_players.active`; both are edited to stop
  referencing it.
- **Read:** `SeasonRepository.active()` (deleted) was the only reader of `is_active`.
  `PlayerRepository.list` selected `sp.active` but no caller of `list()` destructures or filters on
  it (verified — source, grep for `\.active\b` across every `PlayerRow` consumer) — dropping the
  column changes `list()`'s returned shape but breaks nothing, since nothing read the field.
- **Consumer:** the two deleted routes were the only HTTP-level consumers (§1). No test file outside
  the two repo test files above references either column (verified — source, grep for `is_active`
  and `season_players.*active` across `server/src/**/*.test.ts`).
- User-editable data: neither column was ever exposed as an independently editable field beyond the
  activate action itself — deleting the action retires the whole CRUD surface for this data in one
  step; there is no dangling create/read/update path left pointing at gone data.

##### Patterns and Conventions

No new pattern is introduced: the column removal is an ordinary edit to `schema.sql`'s `CREATE
TABLE` statements, exactly like every additive edit elsewhere in this work package — the author's
explicit choice (this exchange) was that treating pre-production schema changes as a migration
problem at all is the wrong pattern here; the right one is "edit the file, throw away the data."

##### File Changes

- **Modify:** `server/src/db/schema.sql`, `server/src/repo/season-repository.ts`,
  `server/src/repo/player-repository.ts`, `server/src/routes/api.ts`.
- **Tests:** `server/src/repo/season-repository.test.ts`, `server/src/repo/player-repository.test.ts`.
- **Operational (not a file change, called out so it isn't lost):** delete the local
  `data/pachanguero.db` (or whatever `PACHANGUERO_DB` points at), or run `npm run seed -- --reset`,
  before starting the app against the edited schema.
- No Create, Delete, or Migrate entries — `db/index.ts` is untouched, and no migration system exists
  to add a migration file to (§2.11).

#### F1 — Current season derived from the calendar

##### Current Implementation

- `seasons.starts_on`/`ends_on` already exist as nullable `TEXT` columns (verified — source,
  `schema.sql`) but today hold the **actual first/last recorded game date** of the season, not a
  calendar boundary: `server/scripts/import-season.ts:105-109` sets them from
  `pagos.csv`'s first/last payment rows. The live database confirms this — season "2024/2025" has
  `starts_on = '2024-09-04'`, `ends_on = '2025-07-23'` (verified — invocation, `SELECT … FROM
seasons` against `data/pachanguero.db`), neither of which is Sept 1 / Aug 31. A second row,
  "2026/2027", has `starts_on`/`ends_on` both `NULL` and is today's manually `.activate()`-d season
  (verified — invocation, same query) — i.e. **no row in the live database currently satisfies the
  Sept 1–Aug 31 rule this element must derive "current" from.**
- `import-season.ts:87` already derives a `startYear` from the season's own `name`:
  `Number(SEASON.slice(0, 4))` — the "YYYY/YYYY+1" naming convention is already load-bearing
  elsewhere in the codebase, not a new assumption this element introduces.
- `SeasonRepository.active()`/`.activate()` are already deleted by R1; this element adds their
  replacement.

##### Approach

**Redefines `starts_on`/`ends_on`** from "actual game-date bounds" to "the season's Sept 1–Aug 31
calendar boundary" — a second, deliberate repurposing of existing columns in this work package
(alongside R1's drops), justified the same way: pre-production, data is disposable
(`VISION.md` §5), and the columns' only current use is precisely the thing UC-001-01-S5 wants to
express instead. A new domain class, `SeasonCalendar`, holds the one rule ("season starting in year
Y runs Y-09-01 through (Y+1)-08-31") as `boundsFor(startYear: number): { startsOn: string; endsOn:
string }` — pure, unit-testable, no I/O, per `AGENTS.md`'s "the rules live here."

`SeasonRepository.create(input)` derives `startYear` from `input.name.slice(0, 4)` (matching
`import-season.ts`'s existing convention exactly, so both paths agree), throws if that slice isn't
a 4-digit year, and calls `SeasonCalendar.boundsFor` for `starts_on`/`ends_on` — **the caller no
longer supplies these dates at all**; `NewSeasonInput.starts_on`/`.ends_on` are removed. `update()`
recomputes both together whenever `name` changes (since a renamed season with a different leading
year must move its boundary too), never independently.

`SeasonRepository.current(asOf = today): SeasonRow | undefined` replaces `active()`:
`SELECT * FROM seasons WHERE starts_on <= @on AND ends_on >= @on ORDER BY starts_on DESC LIMIT 1`.
Back-to-back-with-no-gap (UC-001-01-S5) is enforced structurally by `starts_on UNIQUE` (added to
schema): two seasons can never compute the same start date, so ranges from `SeasonCalendar` never
overlap. A genuine **gap** (no season row created for some year) is not prevented by the schema —
`current()` simply returns `undefined` for a date in that gap, exactly like `active()` returning
`undefined` today when nothing is activated; this is an operational expectation on the Organizer
(create each season before or as its year begins), not a runtime guarantee, and is called out as a
risk below rather than silently assumed solid.

`import-season.ts` is updated to stop passing `starts_on`/`ends_on` (now computed automatically);
its next run against `data/pachanguero.db` will (once reset) store the canonical `2024-09-01`/
`2025-08-31` for that season instead of the actual game-date bounds — a deliberate, disposable data
change, not a bug.

##### Impacted Units

| Unit                        | Type        | Location                               | Action | Notes                                                                                                                                  |
| --------------------------- | ----------- | -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `seasons.starts_on`         | column      | `server/src/db/schema.sql`             | Modify | `TEXT` → `TEXT NOT NULL UNIQUE`; meaning changes from "actual first game" to "calendar boundary"                                       |
| `seasons.ends_on`           | column      | `server/src/db/schema.sql`             | Modify | `TEXT` → `TEXT NOT NULL`; same meaning change                                                                                          |
| `SeasonCalendar`            | class       | `server/src/domain/season-calendar.ts` | Create | `boundsFor(startYear): { startsOn, endsOn }`                                                                                           |
| `SeasonRepository`          | class       | `server/src/repo/season-repository.ts` | Modify | add `current(asOf?)`; `create()`/`update()` derive/recompute bounds via `SeasonCalendar`; `NewSeasonInput` drops `starts_on`/`ends_on` |
| `import-season.ts`          | script      | `server/scripts/`                      | Modify | stop passing `starts_on`/`ends_on` to `seasons.create()`                                                                               |
| `api` router                | module      | `server/src/routes/api.ts`             | Modify | `GET /seasons/current` replaces `GET /seasons/active`                                                                                  |
| `season-repository.test.ts` | test module | `server/src/repo/`                     | Modify | replace activation tests with `current()` fixtures across adjoining/gap ranges                                                         |
| `season-calendar.test.ts`   | test module | `server/src/domain/`                   | Create | `boundsFor` fixtures                                                                                                                   |
| `api.test.ts`               | test module | `server/src/routes/`                   | Create | first route-integration test file in the project (`docs/test-strategy.md` "Integration tests"); covers `GET /seasons/current`          |

##### Test Methodology

Per HLD §2.10: `vitest` for `SeasonCalendar` (pure, unit-level), `vitest` route-integration test for
`GET /seasons/current` against a real SQLite file (first file at `server/src/routes/*.test.ts` —
the test-strategy doc's Integration layer existed as a category before this element, but no file
occupied it yet, verified — source, `find server -iname '*.test.ts'`). Fixtures: three
adjacent seasons (e.g. 2023, 2024, 2025 start years) — a date inside each resolves to that season; a
date in an intentionally-skipped year (no row created) resolves to `undefined`, covering the gap
risk explicitly rather than leaving it untested.

##### Data Contract Verification

Stored shape before: `starts_on`/`ends_on` nullable `TEXT`, meaning "actual game-date bounds",
written once by `import-season.ts` and never elsewhere (verified — source, grep for
`starts_on|ends_on` across `server/src`, only `season-repository.ts` and `import-season.ts` write
them; no route ever did). After: `NOT NULL`, meaning "calendar boundary", written by
`SeasonCalendar.boundsFor` via `SeasonRepository.create`/`update` only. Consumer: `current()` (new,
this element) is the sole reader of the range; `GameRepository`'s auto-creation (F3,
below) will read `current()`'s _result_, not these columns directly, so F3 has no independent
consumption path to reconcile — confirmed now so F3's own Low Level Design doesn't have to
re-derive it. No end-user CRUD on these fields directly (they're always derived from `name`), so no
create/read/update/delete surface exists for a user to misuse.

##### Patterns and Conventions

`SeasonCalendar` follows the existing domain-class shape (`SeniorityCurve`, `ExclusionHistory`):
one small class, one clear rule, no I/O, matching `.agents/rules/coding-standard.md`.

##### File Changes

- **Create:** `server/src/domain/season-calendar.ts`, `server/src/domain/season-calendar.test.ts`,
  `server/src/routes/api.test.ts`.
- **Modify:** `server/src/db/schema.sql`, `server/src/repo/season-repository.ts`,
  `server/scripts/import-season.ts`, `server/src/routes/api.ts`.
- **Tests:** `server/src/repo/season-repository.test.ts` (modify).
- **Operational:** same note as R1 — the local DB file must be recreated for the new
  `NOT NULL UNIQUE` columns and the redefined boundary meaning to take effect; a re-run of
  `npm run seed -- --reset` after this element lands will store the canonical Sept 1/Aug 31 dates.

#### F2 — Seniority capture on first appearance

##### Current Implementation

- `PlayerRepository.add(seasonId, name, seasons = 1)` — on conflict, `DO UPDATE SET seasons =
excluded.seasons, active = 1` (verified — source, `player-repository.ts:36-40`) — calling it a
  second time for the same `(seasonId, playerId)` **overwrites** the recorded `seasons` value, which
  is exactly what UC-001-02-S3 ("no re-prompt … recorded value stands unchanged") forbids if this
  method is ever called again after first capture.
- `StandingsService.standings` reads `p.seasons` straight into
  `PointsCalculator.compute({ seasons: p.seasons, … })` (verified — source,
  `standings-service.ts:89,94`) — the read site itself needs no change; only what gets written
  there changes meaning (complete prior seasons, not "which season number is this", per
  `REQUIREMENTS.md` UC-001-02-S2).
- No suggestion/prompt logic exists anywhere today (verified — source, absence of any symbol
  resembling "seniority" outside `seniority.ts`'s point-curve math and its one read site above).

##### Approach

A new domain class, `SeniorityAdvisor`, holds the one suggestion rule as `suggest(lastRecorded:
number | null): number { return lastRecorded === null ? 0 : lastRecorded + 1; }` — brand-new player
(no `lastRecorded`) suggests `0` (UC-001-02-S2's corrected default); a returning player suggests
their last recorded value **plus one**, regardless of how many seasons ago that was (UC-001-02-S5's
gap-carry), because "last recorded" is already whatever `SeasonRepository`'s query below finds —
gaps are invisible to this rule by construction, not handled as a special case.

Two new `PlayerRepository` methods:

- `hasAppeared(seasonId, playerId): boolean` — `SELECT 1 FROM season_players WHERE season_id = ?
AND player_id = ?` existence check. This is UC-001-02-S3's re-prompt gate: a future caller (F6/F9)
  checks this **before** asking for a suggestion at all; if `true`, no prompt, full stop.
- `suggestSeniority(seasonId, playerId): number` — joins the player's `season_players` rows to
  `seasons` (excluding the current `seasonId`), orders by `seasons.starts_on DESC` (using F1's now
  calendar-accurate boundary, so "most recent" is unambiguous even across a gap season), takes the
  first row's `seasons` value if any, and passes it (or `null`) to `SeniorityAdvisor.suggest`.

`add()`'s conflict clause changes to `ON CONFLICT (season_id, player_id) DO NOTHING` — dropping both
`seasons = excluded.seasons` and `active = 1` (the latter already gone with R1's column drop) — so
a second call for an existing enrollment is a genuine no-op, fixing S3 for every caller, not only
the new capture flow. `add()`'s `seasons` parameter loses its `= 1` default: every caller must now
pass an explicit, already-Organizer-confirmed value (the suggestion is computed and shown
separately; `add()` only ever persists a confirmed number, never assumes one).

Two thin routes expose this to any future caller (F6/F9, or a standalone "register player" flow in
`Manage.tsx`) without those elements duplicating the logic:

- `GET /api/seasons/:id/players/:playerId/seniority-suggestion` → `{ hasAppeared, suggested }`
  (`suggested` omitted when `hasAppeared` is `true` — nothing to suggest).
- `POST /api/seasons/:id/players/:playerId/seniority` → body `{ seasons: number }`, calls the
  now-idempotent `add()`; returns the resulting `season_players` row.

##### Impacted Units

| Unit                        | Type        | Location                                 | Action | Notes                                                                                                                          |
| --------------------------- | ----------- | ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `SeniorityAdvisor`          | class       | `server/src/domain/seniority-advisor.ts` | Create | `suggest(lastRecorded)`                                                                                                        |
| `PlayerRepository`          | class       | `server/src/repo/player-repository.ts`   | Modify | add `hasAppeared`, `suggestSeniority`; fix `add()`'s conflict clause to `DO NOTHING`; drop `seasons`'s default parameter value |
| `api` router                | module      | `server/src/routes/api.ts`               | Modify | add the two seniority-suggestion routes                                                                                        |
| `seniority-advisor.test.ts` | test module | `server/src/domain/`                     | Create | brand-new / returning / gap-season fixtures                                                                                    |
| `player-repository.test.ts` | test module | `server/src/repo/`                       | Modify | add `hasAppeared`/`suggestSeniority`/no-re-prompt-on-second-`add()` fixtures                                                   |
| `api.test.ts`               | test module | `server/src/routes/`                     | Modify | add the two new routes' integration coverage                                                                                   |

##### Test Methodology

Per HLD §2.10, `vitest` only (Testability Assessment: F2 = Yes). Fixtures, run by hand per this
phase's "no runnable code" rule and marked `not yet run`:

- Returning player, 3 seasons recorded 2 seasons ago (one gap season in between, no row for it) →
  `suggestSeniority` finds the row from 2 seasons ago (still the most recent by `starts_on DESC`,
  since no row exists for the gap year at all) → `SeniorityAdvisor.suggest(3)` → `4`. Matches
  UC-001-02-S5 exactly.
- Brand-new player, no `season_players` row anywhere → `suggestSeniority` finds nothing →
  `suggest(null)` → `0`. Matches UC-001-02-S2.
- Same player appears again later the same season → `hasAppeared` returns `true` before any
  suggestion is computed → no prompt. Matches UC-001-02-S3.
- Calling `POST …/seniority` twice for the same `(season, player)` with different values → the
  second call is a no-op (`DO NOTHING`); the first value stands. Matches UC-001-02-S3 at the write
  layer too, not just the route-gating layer, in case a future caller ever skips the `hasAppeared`
  check.

##### Data Contract Verification

Stored shape: `season_players.seasons INTEGER`, meaning redefined (this work package, UC-001-02-S2)
from "which season number is this" to "complete prior seasons" — the column's type and nullability
are unchanged; only what a given integer _means_ changes. Write path: `PlayerRepository.add`,
now `DO NOTHING` on conflict, so a row once written by this flow is never silently overwritten by
it. Read path: `StandingsService.standings` (`standings-service.ts:89`) → `PointsCalculator.compute`
(verified — source; `PointsCalculator`'s own arithmetic is unchanged, it just now receives a number
whose meaning shifted, which is exactly the "worth stating explicitly" callout `REQUIREMENTS.md`
UC-001-01-S3 already makes). No other reader exists (§1 LSP find-references). CRUD: create (first
`add()` call, `DO NOTHING`-guarded), read (`GET …/seniority-suggestion`, `StandingsService`), update
(only via the pre-existing `PATCH /seasons/:id/players/:playerId` → `updateSeasonPlayer`, an
explicit correction path, never this capture flow), delete (none — matches today, no delete path
existed for `season_players` rows before this element either).

##### Patterns and Conventions

`SeniorityAdvisor` follows the same shape as `SeasonCalendar`/`SeniorityCurve` — one rule, no I/O.
Kept deliberately separate from `SeniorityCurve` (point-contribution math) rather than added as a
method on it, since the two rules answer different questions (what to suggest vs. what a value is
worth) and have independent reasons to change.

##### File Changes

- **Create:** `server/src/domain/seniority-advisor.ts`, `server/src/domain/seniority-advisor.test.ts`.
- **Modify:** `server/src/repo/player-repository.ts`, `server/src/routes/api.ts`.
- **Tests:** `server/src/repo/player-repository.test.ts`, `server/src/routes/api.test.ts` (both
  modify — `api.test.ts` was created by F1, above).

#### F3 — Weekly schedule + game-day auto-resolution

##### Current Implementation

- No schedule concept exists anywhere (verified — source, absence of any `schedule`/`weekday`/
  `kickoff` symbol in `server/src`). Games are created only by `GameRepository.create`, always
  called explicitly today — no auto-creation path exists (verified — source, grep for
  `games.create(` across `server/src`, one call site: `routes/api.ts` `POST /seasons/:id/games`).
- `games` has `UNIQUE (season_id, played_on, label)` (verified — source, `schema.sql`) — a plain
  weekly game (`label IS NULL`) is already unique per `(season_id, played_on)` in practice, which
  is exactly the row auto-creation needs to find-or-create against.
- `GameRepository.update`'s `played_on` is already editable (verified — source,
  `game-repository.ts:12,42-51`) — UC-001-08-S4's "exceptional date" fallback needs no new code, as
  `REQUIREMENTS.md` itself already notes.

##### Approach

New table `weekly_schedule` (`id`, `weekday` 0-6 per JS `Date.getDay()` convention — `inferred` from
the runtime's own date API, Sunday=0 — `kickoff_time` `'HH:MM'`, `effective_from` date, `UNIQUE`),
versioned the same way F1's season boundaries are: a "change" is a new row with a later
`effective_from`, never an edit to an old one, so history stays intact (mirrors the project's
existing "frozen, not overwritten" pattern for `convocatorias`).

A new domain class, `ScheduleResolver(rows: WeeklyScheduleRow[])`, holds two pure rules:

- `effectiveRow(asOf: string)` (private) — the row with the greatest `effective_from <= asOf`.
- `nextOccurrenceOnOrAfter(asOf: string): string` — `effectiveRow(asOf)`'s weekday, the next date
  on or after `asOf` that falls on it (today itself if today already is that weekday — UC-001-08-S2;
  the following occurrence otherwise — UC-001-08-S1).
- `cutoffFor(gameDate: string): string` (used by F4, next) — `effectiveRow(gameDate)`'s
  `kickoff_time` plus one hour, as an ISO datetime on `gameDate`.

Both methods resolve against the row effective **as of the date being asked about**, not "today" —
this is what makes UC-001-08-S3's non-retroactivity hold: a schedule change added today only ever
becomes `effectiveRow` for a date on or after its own `effective_from`; a game date already computed
under the old row is never revisited, because nothing re-runs `nextOccurrenceOnOrAfter` for a game
that already exists.

`ScheduleRepository` is CRUD-lite: `list()` (all rows, any order — `ScheduleResolver` sorts), and
`create(row)` only — **no `update`/`delete`**, structurally enforcing the versioned-not-edited rule
above (an old row can never be mutated because no method exists to mutate it).

A new orchestrating class, `GameDayResolutionService(games: GameRepository, schedule:
ScheduleRepository, seasons: SeasonRepository)`, is what a future candidate-list paste (F6) will
call: `resolveTarget(pasteDate: string): GameRow` — builds a `ScheduleResolver` from
`schedule.list()`, computes the game date via `nextOccurrenceOnOrAfter(pasteDate)`, resolves the
owning season via `seasons.current(gameDate)` (F1), then finds-or-creates the game via a new
`GameRepository.findOrCreate(seasonId, playedOn)` (plain `SELECT` first, `create` only on miss —
idempotent, since a second paste for the same week must reuse the same game row, not duplicate it).

##### Impacted Units

| Unit                                  | Type        | Location                                         | Action | Notes                                                                  |
| ------------------------------------- | ----------- | ------------------------------------------------ | ------ | ---------------------------------------------------------------------- |
| `weekly_schedule`                     | table       | `server/src/db/schema.sql`                       | Create | `id`, `weekday`, `kickoff_time`, `effective_from UNIQUE`, `created_at` |
| `ScheduleResolver`                    | class       | `server/src/domain/schedule-resolver.ts`         | Create | `nextOccurrenceOnOrAfter`, `cutoffFor` (private `effectiveRow`)        |
| `ScheduleRepository`                  | class       | `server/src/repo/schedule-repository.ts`         | Create | `list()`, `create()` only                                              |
| `GameDayResolutionService`            | class       | `server/src/repo/game-day-resolution-service.ts` | Create | `resolveTarget(pasteDate)`                                             |
| `GameRepository`                      | class       | `server/src/repo/game-repository.ts`             | Modify | add `findOrCreate(seasonId, playedOn)`                                 |
| `api` router                          | module      | `server/src/routes/api.ts`                       | Modify | `GET`/`PUT /api/schedule`                                              |
| `schedule-resolver.test.ts`           | test module | `server/src/domain/`                             | Create | fixtures below                                                         |
| `schedule-repository.test.ts`         | test module | `server/src/repo/`                               | Create |                                                                        |
| `game-day-resolution-service.test.ts` | test module | `server/src/repo/`                               | Create |                                                                        |
| `game-repository.test.ts`             | test module | `server/src/repo/`                               | Modify | `findOrCreate` idempotency fixture                                     |
| `api.test.ts`                         | test module | `server/src/routes/`                             | Modify | `GET`/`PUT /api/schedule` coverage                                     |

##### Test Methodology

Per HLD §2.10, `vitest` only (Testability Assessment: F3 = Yes). Fixtures, by hand, `not yet run`:

- Schedule: Monday 22:00 effective from `2026-01-05`; paste on `2026-01-06` (Tuesday) →
  `nextOccurrenceOnOrAfter` → `2026-01-12` (next Monday). Paste on `2026-01-05` (Monday itself) →
  `2026-01-05` (UC-001-08-S2).
- Mid-season change: a second row, Wednesday 21:00 effective from `2026-03-02`. A paste on
  `2026-02-20` (before the change) still resolves against Monday 22:00; a paste on `2026-03-04`
  (after) resolves against Wednesday 21:00 — the row-selection rule itself proves the
  non-retroactivity, since a game already created under the Monday row is never asked again.
- `GameDayResolutionService.resolveTarget`, called twice for pastes landing on the same computed
  date, returns the same game row both times (`findOrCreate` idempotency) — no duplicate `games`
  row, matching the `UNIQUE (season_id, played_on, label)` constraint already in place.

##### Data Contract Verification

Stored shape: `weekly_schedule(weekday INTEGER, kickoff_time TEXT, effective_from TEXT UNIQUE)`.
Write path: `ScheduleRepository.create` only (no update/delete anywhere in this codebase after this
element lands). Read path: `ScheduleResolver`, constructed fresh from `schedule.list()` on every
call — no caching, so a row added mid-request-cycle is visible on the very next resolution, which
matters for UC-001-08-S3's "governs every future occurrence… from that point on." Consumer:
`GameDayResolutionService` (this element) and, later, F4's `FinalListTargetResolver`
(`cutoffFor`) — both construct their own `ScheduleResolver` from the same `list()` call, so neither
can drift from a separately cached copy. User-editable: create-only, by design (§ Approach) — no
update/delete UI is needed or provided, matching the versioned-history rule structurally, not by
convention alone.

##### Patterns and Conventions

`ScheduleResolver` follows the existing domain-class shape (pure, no I/O). `GameDayResolutionService`
follows the existing service-composition pattern (`ConvocatoriaService`'s own shape: constructor-
injected repositories, one orchestrating method) — consistent with `.agents/rules/coding-standard.md`.

##### File Changes

- **Create:** `server/src/domain/schedule-resolver.ts`, `server/src/domain/schedule-resolver.test.ts`,
  `server/src/repo/schedule-repository.ts`, `server/src/repo/schedule-repository.test.ts`,
  `server/src/repo/game-day-resolution-service.ts`,
  `server/src/repo/game-day-resolution-service.test.ts`.
- **Modify:** `server/src/db/schema.sql`, `server/src/repo/game-repository.ts`,
  `server/src/routes/api.ts`.
- **Tests:** `server/src/repo/game-repository.test.ts`, `server/src/routes/api.test.ts`.

#### F4 — Final-list target auto-resolution (cutoff = kickoff + 1h)

##### Current Implementation

- `games.status` (`'scheduled' | 'played' | 'cancelled'`) exists but **nothing in the codebase ever
  sets it to `'played'`** (verified — source, grep for `'played'`/`"played"` assigned to `status`
  across `server/src`, zero writers; it is only reachable today via a manual `PATCH
/games/:gameId` body, never set automatically). This element repurposes it as the authoritative
  "has this game's final list been resolved" flag — **F9 is what will actually set it**
  to `'played'` when a final list resolves a game; until F9 lands, every game stays `'scheduled'`
  indefinitely, which is the correct, unremarkable intermediate state while F9 is still undrafted
  (there is simply nothing to target yet, since no final list can be pasted before F9 exists
  either).
- No query for "the most recent game missing a final list" exists (verified — source, absence).

##### Approach

`GameRepository.unresolvedOnOrBefore(asOf: string): GameRow[]` — `SELECT * FROM games WHERE status
NOT IN ('played','cancelled') AND played_on <= @asOf ORDER BY played_on DESC`. A new class,
`FinalListTargetResolver(games: GameRepository, schedule: ScheduleRepository)`, holds
UC-001-10's own rule on top of that query:

```
resolve(now = new Date()): GameRow | undefined {
  const today = isoDate(now)
  const [first, ...rest] = games.unresolvedOnOrBefore(today)
  if (!first) return undefined
  if (first.played_on === today) {
    const cutoff = new ScheduleResolver(schedule.list()).cutoffFor(today)
    if (now < cutoff) return rest[0]   // today not yet eligible — fall back to the earlier one (S2)
  }
  return first                          // today is eligible, or the top candidate isn't today at all (S1)
}
```

This is the one place F3's `ScheduleResolver` is reused rather than re-implemented, per the HLD's
Unit Communication (§2.5) — `cutoffFor` is called with the _candidate game's own date_, not "now",
so the cutoff always matches the schedule row that was effective when that game's date was itself
resolved (F3), never a later row a mid-season change might have introduced since.

`resolve()`'s result is what a future `POST /api/games/final:paste` (F9) uses as its default target
when the caller supplies no explicit `gameId` — this element does not add that route itself (there
is nothing to paste into yet); it exposes the primitive as `GET /api/games/final-list-target` →
`{ game: GameRow | null }`, usable standalone (a UI indicator of "what would a paste target right
now") and by F9 internally once it exists.

##### Impacted Units

| Unit                                 | Type        | Location                                        | Action | Notes                                       |
| ------------------------------------ | ----------- | ----------------------------------------------- | ------ | ------------------------------------------- |
| `GameRepository`                     | class       | `server/src/repo/game-repository.ts`            | Modify | add `unresolvedOnOrBefore(asOf)`            |
| `FinalListTargetResolver`            | class       | `server/src/repo/final-list-target-resolver.ts` | Create | `resolve(now?)`                             |
| `api` router                         | module      | `server/src/routes/api.ts`                      | Modify | `GET /api/games/final-list-target`          |
| `game-repository.test.ts`            | test module | `server/src/repo/`                              | Modify | `unresolvedOnOrBefore` fixtures             |
| `final-list-target-resolver.test.ts` | test module | `server/src/repo/`                              | Create | cutoff-boundary fixtures below              |
| `api.test.ts`                        | test module | `server/src/routes/`                            | Modify | `GET /api/games/final-list-target` coverage |

##### Test Methodology

Per HLD §2.10, `vitest` only (Testability Assessment: F4 = Yes). Fixtures, by hand, `not yet run`,
using the F3 fixture's Monday-22:00 schedule (cutoff 23:00):

- Two unresolved games, `2026-01-05` (today) and `2025-12-29` (older, still unresolved). `now =
2026-01-05T22:30` (before cutoff) → `resolve()` returns the `2025-12-29` game (S2's fallback).
  `now = 2026-01-05T23:15` (after cutoff) → returns the `2026-01-05` game (S1/S2's "eligible from
  cutoff onward").
- Only one unresolved game, and it's older than today (no game exists for today at all yet) →
  `resolve()` returns it regardless of the time of day — there is no "today" candidate to gate on.
- No unresolved games at all → `resolve()` returns `undefined`; the route returns `{ game: null }`.

##### Data Contract Verification

Stored shape read: `games.status`, `games.played_on` — unchanged types, `status`'s `'played'` value
repurposed to mean "final list resolved" (write side lands in F9). Read path: this element's own
`unresolvedOnOrBefore` and `FinalListTargetResolver.resolve`; no other reader is affected since
nothing else queries by `status` today (verified — source, grep for `\.status\b` across
`server/src`, only `game-repository.ts`'s own `UPDATABLE_COLUMNS` and this new query). Because the
write side (F9) doesn't exist yet, this element is verified against **fixture rows inserted
directly** (not through a not-yet-existing paste flow) — explicit here so the gap is a known,
temporary state of the design, not an oversight.

##### Patterns and Conventions

`FinalListTargetResolver` follows `GameDayResolutionService`'s shape (F3): constructor-injected
repositories, one orchestrating method, domain class called for the one pure rule it needs.

##### File Changes

- **Create:** `server/src/repo/final-list-target-resolver.ts`,
  `server/src/repo/final-list-target-resolver.test.ts`.
- **Modify:** `server/src/repo/game-repository.ts`, `server/src/routes/api.ts`.
- **Tests:** `server/src/repo/game-repository.test.ts`, `server/src/routes/api.test.ts`.

#### F5 — Name/alias matching with decoration stripping

##### Current Implementation

- No matching, alias, or decoration-stripping logic exists anywhere (verified — source, absence of
  any `alias`/`match`/`strip` symbol in `server/src`).
- `players.name TEXT NOT NULL UNIQUE` (verified — source, `schema.sql`) — canonical names are
  already unique but stored as whatever the Organizer typed; nothing today compares a pasted string
  against them at all, since there is no paste-ingestion code yet (F6/F9 are still ahead).
- `PlayerRepository.list(seasonId)` is season-scoped — joins `season_players`, so a player never
  enrolled in the given season is invisible to it (verified — source, `player-repository.ts:13-22`).
  Matching must **not** be season-scoped (UC-001-01-S2: a player absent for seasons is still a valid
  match target) — no existing method returns the full, ungated player list.

##### Approach

New table `player_aliases (player_id, alias, PRIMARY KEY (player_id, alias))` — deliberately **no**
global `UNIQUE(alias)` constraint: two different players legitimately ending up with the same
nickname is possible (rare, but real), and the correct behaviour for that case is the same
"never silently guess" ambiguity path UC-001-04-S4 already uses for canonical-name collisions, not
a database error blocking the second alias from ever being saved.

A new domain class, `NameMatcher(players: {id, name}[], aliases: {playerId, alias}[])`, holds two
pure rules, no I/O:

- `strip(raw: string): string` — three ordered passes: (1) drop a leading list-marker
  (`/^\s*(?:\d+[.)]?|[•\-*])\s*/` — a leading number with optional `.`/`)`, or a bullet character);
  (2) drop emoji anywhere in the string, via a Unicode-block regex
  (`/[\u{1F300}-\u{1FAFF}\u{2600}-➿\u{FE0F}]/gu` — `inferred` from Unicode's published emoji
  block ranges, not exhaustively tested against every emoji; a missed one is a one-line regex fix,
  not a shape change, so not tracked as a deferral); (3) collapse internal whitespace runs to a
  single space and trim the ends. Order matters: the list-marker pass must run before whitespace
  collapsing, or `"5   Álvaro"` would collapse the marker's own trailing spaces into the name first.
- `match(raw: string)` — strips `raw`, then compares (locale-aware, case-insensitive:
  `a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0`, matching the project's existing `'es'`
  sort convention) against every canonical name and every alias. Returns `{ outcome: 'matched',
playerId }` on exactly one hit, `{ outcome: 'ambiguous', playerIds }` on more than one (two
  players sharing an alias, or an alias colliding with a different player's canonical name), or
  `{ outcome: 'unresolved' }` on zero — the three outcomes UC-001-03-S1/S2 and UC-001-04-S4 need,
  named explicitly rather than left for a caller to infer from an empty/multi-element array.

A new repository method, `PlayerRepository.listAll(): { id, name }[]` — the ungated equivalent of
`list(seasonId)`, used only for building a `NameMatcher`'s candidate pool, never for anything
season-scoped. A new `AliasRepository`: `listAll(): { playerId, alias }[]` (bulk fetch, so a future
caller builds one `NameMatcher` per paste rather than querying per line) and
`add(playerId, alias): void` (`INSERT OR IGNORE`, since a duplicate `(playerId, alias)` pair is
harmless, not an error).

`POST /api/players/:playerId/aliases` — body `{ alias: string }` — the endpoint UC-001-09-S1's "link
that name to the existing player" saves through; usable now even though the paste flow that
typically triggers it (F6/F9) doesn't exist yet, since UC-001-09 is its own use case with its own
graduation criterion, not merely a side effect of resolution.

**No wrapper/factory class is added around "build a `NameMatcher` from the repositories"** — future
callers (F6, F9) construct one directly from `players.listAll()` and `aliases.listAll()`; a
class whose only job would be gluing two method calls together adds a layer without a
responsibility of its own.

##### Impacted Units

| Unit                        | Type        | Location                               | Action | Notes                                                                                |
| --------------------------- | ----------- | -------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `player_aliases`            | table       | `server/src/db/schema.sql`             | Create | `(player_id, alias)` PK, no global unique on `alias` alone                           |
| `NameMatcher`               | class       | `server/src/domain/name-matcher.ts`    | Create | `strip(raw)`, `match(raw)`                                                           |
| `PlayerRepository`          | class       | `server/src/repo/player-repository.ts` | Modify | add `listAll()`                                                                      |
| `AliasRepository`           | class       | `server/src/repo/alias-repository.ts`  | Create | `listAll()`, `add(playerId, alias)`                                                  |
| `api` router                | module      | `server/src/routes/api.ts`             | Modify | `POST /api/players/:playerId/aliases`                                                |
| `name-matcher.test.ts`      | test module | `server/src/domain/`                   | Create | the author's WhatsApp fixture, plus the decoration/alias tables from UC-001-03-S7/S8 |
| `alias-repository.test.ts`  | test module | `server/src/repo/`                     | Create |                                                                                      |
| `player-repository.test.ts` | test module | `server/src/repo/`                     | Modify | `listAll()` fixture (includes a player absent from the given season)                 |
| `api.test.ts`               | test module | `server/src/routes/`                   | Modify | `POST /api/players/:playerId/aliases` coverage                                       |

##### Test Methodology

Per HLD §2.10, `vitest` only (Testability Assessment: F5 = Yes). Fixtures, by hand, `not yet run` —
directly from `REQUIREMENTS.md`'s own tables:

- Decoration stripping (UC-001-03-S7): `"5 Álvaro R ⚽"` → `strip` → `"Álvaro R"`; `"• Pablo"` →
  `"Pablo"`; `"  Facu   "` → `"Facu"`.
- Alias matching (UC-001-03-S8): canonical `"Jorge Gutiérrez"` with aliases `"Guti"`, `"Gutito"`,
  `"Jorge"` — `match("Guti")`, `match("Gutito")`, `match("Jorge")` each → `{ matched, playerId:
<Jorge's id> }`.
- Combined: `"5 Guti ⚽"` → `strip` → `"Guti"` → `match` → matched — decoration-stripping and alias
  matching compose, not two independent paths that happen to both work.
- Ambiguity: two players, one with canonical name `"Juanito"`, the other with alias `"Juanito"` on a
  different canonical name → `match("Juanito")` → `{ ambiguous, playerIds: [both ids] }`, never a
  silent pick of either.
- Unresolved: a name matching neither a canonical name nor any alias → `{ unresolved }`.
- The author's own full WhatsApp-paste fixture (`REQUIREMENTS.md` §5) run line-by-line through
  `strip` + `match` against a fixture roster, confirming the matched/unresolved split it names.

##### Data Contract Verification

Stored shape: `player_aliases(player_id INTEGER, alias TEXT)`, both required, no default. Write
path: `AliasRepository.add` only. Read path: `AliasRepository.listAll()`, consumed exclusively by a
freshly-constructed `NameMatcher` — no cached copy anywhere, so an alias added mid-session is
visible to the very next `match()` call, mirroring F3's same no-caching guarantee for schedule rows.
User-editable: create only (`POST /api/players/:playerId/aliases`) — no update (an alias is either
right or it isn't; correcting a typo means adding the right one, not editing the wrong one in place)
and no delete is specified by any use case here, so none is added — a future work package can add
one if a stale alias ever needs removing; not speculatively built now.

##### Patterns and Conventions

`NameMatcher` follows the existing domain-class shape: pure, no I/O, one clear responsibility split
into two named outcomes rather than a boolean/nullable return, so a caller can't mistake "ambiguous"
for "unresolved" by accident — a deliberate choice given `VISION.md` §4's "never silently guess"
applies differently to each (ambiguous needs the Organizer to pick one; unresolved needs a
new-or-link decision, UC-001-04).

##### File Changes

- **Create:** `server/src/domain/name-matcher.ts`, `server/src/domain/name-matcher.test.ts`,
  `server/src/repo/alias-repository.ts`, `server/src/repo/alias-repository.test.ts`.
- **Modify:** `server/src/db/schema.sql`, `server/src/repo/player-repository.ts`,
  `server/src/routes/api.ts`.
- **Tests:** `server/src/repo/player-repository.test.ts`, `server/src/routes/api.test.ts`.

#### F7 — Inline new-player registration (introducing link, collision handling)

Drafted before F6 (out of the agenda's own element-number order, but F6 and F7 are drafted together
since F6's own resolve flow calls directly into this one) because F6's
Approach needs to cite a settled `PlayerRegistrar` rather than describe it twice.

##### Current Implementation

- `players` has no introducing-player link (verified — source, `schema.sql`, no `introduced_by`
  column). LSP find-references on `players` (per this section's mandatory rule) across
  `server/src`: writers are `PlayerRepository.add`'s `INSERT OR IGNORE INTO players (name)`
  (`player-repository.ts:27-29`) and nothing else; readers are `PlayerRepository.list`/`listAll`
  (F5) and the various `JOIN players p ON p.id = …` joins in `participation-repository.ts`,
  `standings-service.ts`, `convocatoria-service.ts`/`exclusion-repository.ts` — all select `p.name`
  only, none select `p.*` or destructure a fixed column set that a new nullable column could break
  (verified — source, grep for `JOIN players p` across `server/src`, every join projects `p.name`
  explicitly, never `p.*`).
- No standalone "register a player" method exists — `PlayerRepository.add` conflates "create the
  player if new" with "enroll them in a season," which this work package's whole premise (R1/F1)
  already separates: a player can now exist with no season enrollment at all.
- No collision-detection path exists (verified — source, absence); today `add()`'s
  `INSERT OR IGNORE` silently no-ops on a `players.name` exact-string collision, which is not what
  UC-001-04-S4 wants (a **case/alias**-aware collision must surface to the Organizer, not just an
  exact-string one silently ignored).

##### Approach

`players.introduced_by INTEGER REFERENCES players(id)` — edited directly into `schema.sql`, no
guard, same as every other schema change in this work package (§2.2/R1's now-established
convention for this pre-production app).

A new `PlayerRepository.register(name, introducedBy?): PlayerRow` — inserts into `players` only
(no `season_players` row — registration and season-enrollment are separate moments now, per
R1/F1/F2's own premise: enrollment happens implicitly the first time the new player appears on a
season's candidate/final list, via F2's `hasAppeared`/seniority-capture flow, never at registration
time).

A new class, `PlayerRegistrar(players: PlayerRepository, aliases: AliasRepository)`, is the one
place collision-checking and registration are wired together, shared by F6's resolve endpoint now
and F9's later (so neither duplicates the check):

```
register(name, introducedBy?):
  | { outcome: 'registered', player: PlayerRow }
  | { outcome: 'collision', match: NameMatcher.match(name) }   // outcome is 'matched' or 'ambiguous'

  1. build a NameMatcher from players.listAll() + aliases.listAll()
  2. const found = matcher.match(name)
  3. if found.outcome !== 'unresolved' → return { outcome: 'collision', match: found }
  4. otherwise → players.register(name, introducedBy) → { outcome: 'registered', player }
```

This is UC-001-04-S4's rule exactly: attempting to register a name that turns out to match (exactly,
case-insensitively, or via an alias) surfaces the same `matched`/`ambiguous` shape F5 already
defines for a pasted line, rather than a distinct "duplicate" error — so the client can route a
collision through the identical link-or-resolve view it already has for an unmatched paste line,
per UC-001-04-S4's own wording ("the same resolution view").

##### Impacted Units

| Unit                        | Type        | Location                               | Action | Notes                                                |
| --------------------------- | ----------- | -------------------------------------- | ------ | ---------------------------------------------------- |
| `players.introduced_by`     | column      | `server/src/db/schema.sql`             | Create | `INTEGER REFERENCES players(id)`, nullable           |
| `PlayerRepository`          | class       | `server/src/repo/player-repository.ts` | Modify | add `register(name, introducedBy?)`                  |
| `PlayerRegistrar`           | class       | `server/src/repo/player-registrar.ts`  | Create | `register(name, introducedBy?)` with collision guard |
| `player-repository.test.ts` | test module | `server/src/repo/`                     | Modify | `register()` fixture, `introduced_by` round-trip     |
| `player-registrar.test.ts`  | test module | `server/src/repo/`                     | Create | collision fixtures below                             |

##### Test Methodology

Per HLD §2.10, `vitest` only (Testability Assessment: F7 = Yes; Manual Test Plan guideline below is
carried for F6's UI half, not this element's own backend logic). Fixtures, by hand, `not yet run`:

- Plain registration, no host: `register('Nuevo')` → `{ registered, player: { name: 'Nuevo',
introducedBy: null } }` (UC-001-04-S1/S3).
- Host-linked registration: `register('Adri', introducedBy: <David's id>)` → `player.introducedBy
=== <David's id>` (UC-001-04-S2).
- Collision, exact case: an existing player named `'Pablo'`; `register('Pablo')` → `{ collision,
match: { outcome: 'matched', playerId: <Pablo's id> } }`, no new row created (verified by
  re-listing `players` and asserting the count is unchanged).
- Collision, via alias: an existing player with alias `'Guti'`; `register('Guti')` → `{ collision,
match: { outcome: 'matched', … } }` (UC-001-04-S4 applies identically whether the collision is
  with a canonical name or an alias — the rule doesn't distinguish, and neither does this fixture).
- Registering one of several unresolved names in a paste doesn't touch the others (UC-001-04-S5) —
  this is a property of the _caller_ (F6's resolve endpoint only ever registers the one line it was
  given), verified in F6's own fixtures, not re-tested here in isolation from a caller.

##### Data Contract Verification

Stored shape: `players.introduced_by INTEGER NULL`, self-referencing `players.id`. Write path:
`PlayerRepository.register` only. Read path: none added by this element (no use case reads
`introduced_by` back yet — `REQUIREMENTS.md` UC-001-04-S2 says it is "kept for later reference,"
not surfaced anywhere in this work package's own scope); confirmed by re-checking `REQUIREMENTS.md`
§3/§4 for any endpoint or UI column naming it — none. Recording this explicitly so a future reader
doesn't assume a missing UI column is an oversight: it is out of scope by the requirement's own
words, not forgotten. CRUD: create only; no update/delete path exists or is asked for.

##### Patterns and Conventions

`PlayerRegistrar` composes `PlayerRepository` and `AliasRepository` behind one method, the same
constructor-injected-repositories shape as `GameDayResolutionService`/`FinalListTargetResolver` —
consistent service-composition pattern across this whole work package's new repo-layer classes.

##### File Changes

- **Create:** `server/src/repo/player-registrar.ts`, `server/src/repo/player-registrar.test.ts`.
- **Modify:** `server/src/db/schema.sql`, `server/src/repo/player-repository.ts`.
- **Tests:** `server/src/repo/player-repository.test.ts`.
- **Operational:** same note as R1/F1 — recreate the local DB file for the new column to exist.

#### F6 — Candidate list paste & resolution (named + ephemeral guests, arrival-order rule)

##### Current Implementation

- No paste-ingestion code exists anywhere (verified — source, absence of any `paste`/`parse`
  symbol handling free text in `server/src`). Today's candidate list is however it got into
  `participations.signed_up` (manually, per the current, pre-this-work-package UI) —
  `ConvocatoriaService.preview` reads `signed_up = 1` rows directly with no resolution step
  (verified — source, `convocatoria-service.ts:30-35`, already cited in R1's Current
  Implementation).
- `ConvocatoriaBuilder.build` takes `Contender[]` keyed by a real `playerId` and is out of scope
  (§1, already cited) — this element must never feed it a fabricated id; the arrival-order path for
  ephemeral guests is a **separate** allocator, never a patch to `ConvocatoriaBuilder`.
- F3 already provides `GameDayResolutionService.resolveTarget(pasteDate)`; F5 already provides
  `NameMatcher`/`AliasRepository`; F7 (drafted first, above) already provides `PlayerRegistrar`.
  This element is the first to compose all three.

##### Approach

New table:

```sql
CREATE TABLE guest_candidates (
  game_id        INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  position       INTEGER NOT NULL,   -- 1-based position among the pasted list's candidate lines
  player_id      INTEGER REFERENCES players(id) ON DELETE CASCADE,  -- NULL = ephemeral anonymous guest
  host_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, position)
);
```

**The discriminator between "regular" and "guest" is row existence here, not a flag anywhere
else**: a candidate with no `guest_candidates` row for this game is a regular, ranked by points
only; one with a row is a guest, ranked by arrival order only when regulars alone don't fill the
slots (UC-001-03-S6) — regardless of whether that same player was a guest in some earlier game or a
regular in this one's own final list. This is per-game and per-line, matching UC-001-04-S2's "no
permanent occasional flag."

A named guest additionally gets an ordinary `participations.signed_up = 1` row (they're a real
player from the moment they're registered, UC-001-04-S2) — both rows exist together. An ephemeral
guest gets **only** the `guest_candidates` row (`player_id NULL`) — never a `participations` row,
since there is no player to attach one to.

**Parsing**, a new pure domain class `CandidateLineParser`:

```
parse(rawLine, position):
  | { position, kind: 'plain',        name }
  | { position, kind: 'hostAnnotated', name, hostName }   // "<name> (<hostName>)"
  | { position, kind: 'plusOne',      hostName }           // "<hostName> +1", no name at all
```

Runs `NameMatcher.strip` on the whole line first (removing list-marker/emoji/whitespace noise
around it), then checks, in order: a trailing `/\+\s*1\s*$/` (plusOne — checked first since it has
no parenthetical to conflict with a name that happens to contain one), then a trailing
`/\(([^)]+)\)\s*$/` (hostAnnotated, capturing the host name), else `plain`. Each extracted
`name`/`hostName` is re-passed through `NameMatcher.strip` individually (idempotent, but the
isolated substring may still carry a stray space the whole-line pass didn't reach).

Before any line is parsed, the raw pasted text is split on newlines and scanned for the first line
whose stripped content matches `/^reservas\b/i` (UC-001-03-S3); that line and every line after it
are dropped entirely — never surfaced as unresolved, never numbered. Blank lines among the
remainder are skipped without consuming a position number.

A new orchestrating class, `CandidateResolutionService(gameDay: GameDayResolutionService, players:
PlayerRepository, aliases: AliasRepository, participations: ParticipationRepository, guests: new
`GuestCandidateRepository`, parser: CandidateLineParser)`:

- `paste(text, gameId?)`: resolves the target game (explicit `gameId`, or
  `gameDay.resolveTarget(today)` — F3); builds one `NameMatcher` from `players.listAll()` +
  `aliases.listAll()`; drops the Reservas section; parses every remaining line; for each:
  - `plain`/`hostAnnotated` — matches `name` via the matcher. `matched` → resolved to that
    `playerId`; for `hostAnnotated`, additionally matches `hostName` (if that also fails to resolve,
    the whole line is unresolved — this element does not chain-resolve an unknown host, an
    intentionally narrow scope: see Risks). `unresolved`/`ambiguous` → added to the response's
    `unresolved` list, carrying the parsed shape so the resolve endpoint (below) can act on it
    without re-parsing.
  - `plusOne` — matches `hostName` only (there is no name to resolve for the companion itself).
    `unresolved`/`ambiguous` on the host → the whole line is unresolved (can't attribute a
    companion to an unknown host).
  - Every resolved `plain`/already-known-`hostAnnotated` line → `participations.signed_up = 1` for
    that game/player, **no** `guest_candidates` row (it's a regular, or an already-known player
    whose host annotation is a no-op per UC-001-03-S4's own table).
  - Every resolved genuinely-new-`hostAnnotated` line → `participations.signed_up = 1` **and** a
    `guest_candidates` row (`player_id`, `host_player_id`, `position`).
  - Every resolved `plusOne` line → `participations.signed_up = 1` for the host (if not already
    set) **and** a `guest_candidates` row with `player_id = NULL`, `host_player_id = <host>`.
  - **Replace semantics (UC-001-03-S9):** before inserting, every existing `participations` row for
    this `game_id` has `signed_up` set to `0` (not deleted — `played`/`paid_cents` from an unrelated
    earlier step, if any, must survive), and every existing `guest_candidates` row for this
    `game_id` is deleted outright (pure staging data, safe to fully replace, same pattern
    `ConvocatoriaService.commit` already uses for its own tables).
  - Returns `{ game, matched: [...], unresolved: [...] }`.
- `resolve(gameId, line, action)`: `line` is the same parsed shape the paste response returned for
  one unresolved entry (position/kind/name/hostName — the client resends it, since nothing is
  persisted server-side for an unresolved line per the HLD's stateless-resolution decision, §2.2).
  `action` is `{ type: 'link', playerId }`, `{ type: 'linkAsAlias', playerId }` (also calls
  `aliases.add(playerId, strip(name))` — UC-001-09-S1), or `{ type: 'register', name, introducedBy?
}` (calls `PlayerRegistrar.register`; a `collision` outcome is returned to the client unresolved
  again, now carrying the collision's match info, rather than silently linking — UC-001-04-S4).
  Once a `playerId` is settled, persistence follows the same rules as `paste()`'s resolved branch
  above, for this one line only — never re-running replace-semantics for the rest of the game's
  already-persisted candidates (UC-001-04-S5: resolving one doesn't touch the others).

`GuestSlotAllocator` (new domain class, pure, no I/O) implements UC-001-03-S6's own rule, consumed
by F8, below, inside `ConvocatoriaService`, but designed and unit-tested here since it is
this element's own contribution to the Refactors/New-Functionality inventory:

```
allocate(regularsCount: number, guests: { position: number }[], slots: number):
  { calledUp: typeof guests; excluded: typeof guests }

  openSlots = slots - regularsCount   // caller (F8) only invokes this when regularsCount <= slots
  sorted = guests sorted by position ascending
  return { calledUp: sorted.slice(0, openSlots), excluded: sorted.slice(openSlots) }
```

Verified by hand against the author's own worked example (§ Test Methodology, below) — this phase's
"no runnable code" rule.

**Risk, recorded rather than silently narrowed:** an unresolved host name on a `hostAnnotated` or
`plusOne` line makes the **whole line** unresolved (no chained "resolve the host first, then the
guest" flow). This is a deliberate scope line, not an oversight — the author's own examples always
name an already-known host; an unknown host is far more likely a typo the Organizer fixes by
re-pasting than a second genuinely-new person needing its own registration flow mid-line.

##### Impacted Units

| Unit                                   | Type        | Location                                          | Action | Notes                                                                                                                                  |
| -------------------------------------- | ----------- | ------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `guest_candidates`                     | table       | `server/src/db/schema.sql`                        | Create | PK `(game_id, position)`, `player_id` nullable                                                                                         |
| `CandidateLineParser`                  | class       | `server/src/domain/candidate-line-parser.ts`      | Create | `parse(rawLine, position)`                                                                                                             |
| `GuestSlotAllocator`                   | class       | `server/src/domain/guest-slot-allocator.ts`       | Create | `allocate(regularsCount, guests, slots)`                                                                                               |
| `GuestCandidateRepository`             | class       | `server/src/repo/guest-candidate-repository.ts`   | Create | `list(gameId)`, `replaceAll(gameId, rows)`                                                                                             |
| `CandidateResolutionService`           | class       | `server/src/repo/candidate-resolution-service.ts` | Create | `paste(text, gameId?)`, `resolve(gameId, line, action)`                                                                                |
| `ParticipationRepository`              | class       | `server/src/repo/participation-repository.ts`     | Modify | add a `clearSignups(gameId)` helper (sets `signed_up = 0` for every row, called before a re-paste)                                     |
| `api` router                           | module      | `server/src/routes/api.ts`                        | Modify | `POST /api/games/candidates:paste`, `POST /api/games/:gameId/candidates/resolve`                                                       |
| `GameDay.tsx`                          | component   | `web/src/pages/`                                  | Modify | paste textarea, matched/unresolved summary, per-line resolve controls (link / link+alias / register, with an introducing-player field) |
| `candidate-line-parser.test.ts`        | test module | `server/src/domain/`                              | Create |                                                                                                                                        |
| `guest-slot-allocator.test.ts`         | test module | `server/src/domain/`                              | Create | the author's worked example                                                                                                            |
| `candidate-resolution-service.test.ts` | test module | `server/src/repo/`                                | Create |                                                                                                                                        |
| `api.test.ts`                          | test module | `server/src/routes/`                              | Modify |                                                                                                                                        |

##### Test Methodology

Per HLD §2.10: `vitest` for `CandidateLineParser`/`GuestSlotAllocator` (pure) and
`CandidateResolutionService`/routes (real SQLite); Playwright E2E for the `GameDay.tsx` paste flow
(Testability Assessment: F6 = Yes, E2E covers the UI half). Fixtures, by hand, `not yet run`:

- **The author's own worked example (UC-001-03-S6), run exactly**: 11 regulars, 4 guests at
  positions 8 (`Adri`), 12 (`Álvaro +1`), 13 (`Juan`), 14 (`Rubén`), `slots = 14`. `regularsCount =
11 <= 14` → guest path runs. `GuestSlotAllocator.allocate(11, [8,12,13,14], 14)` → `openSlots = 3`
  → `calledUp = [8, 12, 13]` (`Adri`, `Álvaro +1`'s companion, `Juan`), `excluded = [14]` (`Rubén`)
  — matches the author's predicted outcome exactly.
- Clean paste, everyone matched (UC-001-03-S1): every line resolves; response's `unresolved` is
  empty; every name has a `participations.signed_up = 1` row.
- Ambiguous/unmatched name (UC-001-03-S2): one line unresolved; no `participations` row is written
  for it until `resolve()` is called.
- Reservas trailer (UC-001-03-S3): a paste with a trailing `"Reservas"` heading and names beneath —
  none of those names appear in `matched` or `unresolved`.
- Named guest, first appearance (UC-001-03-S4): `"Adri (David)"`, `Adri` unresolved → `resolve(...,
{ type: 'register', name: 'Adri', introducedBy: <David's id> })` → `participations` row for Adri
  **and** a `guest_candidates` row with `host_player_id = David`.
- Named guest, already known (UC-001-03-S4's table, second row): `"Juan (David)"` where `Juan`
  already exists → resolves via the plain match path; **no** `guest_candidates` row is written (the
  host annotation is a no-op once the guest is already a known player).
- Anonymous plus-one (UC-001-03-S5): `"Álvaro +1"` → `participations` row for Álvaro (if not
  already signed up) plus a `guest_candidates` row, `player_id = NULL`, `host_player_id = Álvaro`.
- Re-paste replaces (UC-001-03-S9): paste, then paste again with one name dropped and one added —
  the dropped name's `participations.signed_up` becomes `0`; the added name's becomes `1`; no
  duplicate `guest_candidates` rows survive from the first paste.

Manual Test Plan guideline (for the `GameDay.tsx` half, not fully automatable by `vitest` alone,
though Playwright E2E is expected to cover it end to end per the Testability Assessment): after
submitting a paste with one ambiguous name, observe that the matched candidates render immediately
while the ambiguous one shows both candidate players with a pick-one control, and that picking one
and confirming removes it from the unresolved list without re-submitting the whole paste.

##### Data Contract Verification

Stored shapes: `guest_candidates(game_id, position, player_id NULL, host_player_id NOT NULL)`;
`participations.signed_up` (existing column, write path gains a second writer —
`CandidateResolutionService`, alongside whatever wrote it before this element, which was nothing
automated, per Current Implementation). Write path: `CandidateResolutionService.paste`/`resolve`
via `GuestCandidateRepository.replaceAll`/`ParticipationRepository.set`/`clearSignups`. Read path:
`GuestCandidateRepository.list(gameId)`, consumed by F8's `GuestSlotAllocator` invocation (below)
and nothing else yet — confirmed by design, not left implicit, since F8 hasn't been
drafted: this element's own Low Level Design is what commits to the shape F8 will read, and F8's
own drafting, next, must not silently redefine it. Foreign-key/NOT NULL check (this element's own
flagged checkpoint, HLD §2.6): `guest_candidates.player_id` is nullable, `host_player_id` is
`NOT NULL` — an ephemeral guest row (`player_id NULL`) is valid against the schema as written;
verified by constructing the `CREATE TABLE` statement above against SQLite's own nullable-FK
semantics (a `NULL` foreign key is never checked against the referenced table, standard SQL
behaviour, not specific to this schema). CRUD: create (paste/resolve), read (F8), update (none —
a guest candidate is replaced wholesale, never edited in place), delete (`replaceAll` on re-paste).

**Amendment, found while drafting F8's Low Level Design, next:** `paste()`/`resolve()`
persist `participations.signed_up = 1` immediately on every resolved candidate, but do **not**
block on F2's seniority capture (`hasAppeared`) — a first-time candidate can be signed up before
the Organizer answers the seniority prompt. This means a signed-up candidate can, for a time, have
no `season_players` row at all, and therefore no points in `StandingsService.standings()` (which is
scoped to players already enrolled via a `season_players` row). F8 closes this gap with a
precondition check in `ConvocatoriaService`, not here — this element's own persistence behaviour is
unchanged by that finding, only cross-referenced.

##### Patterns and Conventions

`CandidateLineParser`/`GuestSlotAllocator` follow the existing pure-domain-class shape.
`CandidateResolutionService` follows the existing service-composition shape
(`ConvocatoriaService`'s own: constructor-injected repositories/domain classes, orchestrating
methods, `DELETE`-then-`INSERT` for wholesale-replaceable staging data — the same pattern
`ConvocatoriaService.commit` already uses for `convocatorias`/`convocatoria_entries`, now applied to
`guest_candidates`).

##### File Changes

- **Create:** `server/src/domain/candidate-line-parser.ts`,
  `server/src/domain/candidate-line-parser.test.ts`, `server/src/domain/guest-slot-allocator.ts`,
  `server/src/domain/guest-slot-allocator.test.ts`, `server/src/repo/guest-candidate-repository.ts`,
  `server/src/repo/candidate-resolution-service.ts`,
  `server/src/repo/candidate-resolution-service.test.ts`.
- **Modify:** `server/src/db/schema.sql`, `server/src/repo/participation-repository.ts`,
  `server/src/routes/api.ts`, `web/src/pages/GameDay.tsx`.
- **Tests:** `server/src/routes/api.test.ts`.
- **E2E:** a new `e2e/tests/` spec covering the candidate-paste-and-resolve flow end to end.

#### F8 — Convocatoria commit decoupled from attendance, guest-aware

##### Current Implementation

- `ConvocatoriaService.preview` builds `contenders` by intersecting `standings(seasonId, gameId)`
  with `signed_up = 1` player ids (verified — source, `convocatoria-service.ts:30-40`, already
  cited in §1) — every signed-up id is fed to `ConvocatoriaBuilder.build` today, with no regulars/
  guest distinction, because that distinction didn't exist before F6.
- `commit` writes `convocatorias`/`convocatoria_entries` (replace-on-rerun, `DELETE` then insert)
  and calls `this.participations.set(gameId, e.playerId, { played: e.playing })` for **every**
  entry (verified — source, `convocatoria-service.ts:52-89`) — the one line UC-001-05-S2 removes.
- **Resolved ambiguity, author-confirmed this exchange:** `REQUIREMENTS.md` UC-001-03-S6 states
  that when regulars alone exceed `slots`, "no guest competes at all," and explicitly flags "how
  this interacts with the commit step … is still open." UC-001-05-S3, written after that flag,
  states ephemeral guests "are ranked … exactly as it does everyone else" when oversubscribed — a
  guest-inclusive rule S3's own clarifying detail ("no exclusion row is written for a cut ephemeral
  guest") only makes sense under. The author confirmed **UC-001-05-S3 governs**: when regulars alone
  exceed `slots`, every candidate — regulars, named guests, and ephemeral guests as zero-point
  synthetic contenders — is ranked in one `ConvocatoriaBuilder` pool; a named guest cut this way
  earns the ordinary exclusion point like anyone else; an ephemeral guest cut this way has nothing
  persisted, per S3's own text. UC-001-03-S6's "no guest competes at all" is superseded by this.

##### Approach

Two branches, chosen by `regularsCount` vs `rules.slots` (UC-001-03-S6's own threshold, resolved
per the ambiguity above for the `>` branch):

**`regularsCount = signedUp.length − namedGuestPlayerIds.length`**, where `namedGuestPlayerIds` are
the `player_id`s present in F6's `guest_candidates` for this game (the discriminator F6 already
established — a candidate with a `guest_candidates` row is a guest, full stop).

- **`regularsCount <= rules.slots`** (UC-001-03-S6, first case): no `ConvocatoriaBuilder` at all.
  Every regular is `called_up`. `GuestSlotAllocator.allocate(regularsCount, guestRows, rules.slots)`
  (F6) splits the guests into called-up/excluded by arrival order. Persisted: a `convocatoria_entries`
  row for every entry **with a real `player_id`** (every regular, every named guest, called-up or
  excluded); an `exclusions` row (`kind: 'points'`) for every excluded **named** guest
  (UC-001-03-S6: "still earns the ordinary exclusion point"); **nothing** for ephemeral guests,
  called-up or excluded (no `player_id` to write against, mirroring UC-001-05-S3's own rule for the
  other branch, applied symmetrically here). No mercy/swap logic runs in this branch at all — mercy
  only matters under contention, and every regular already gets in.
- **`regularsCount > rules.slots`** (UC-001-03-S6, second case, per the resolved ambiguity above):
  build one `Contender[]` pool — regulars and named guests as real `{playerId, name, points}` from
  `standings()` (a named guest is an ordinary player there, nothing special), ephemeral guests as
  synthetic `{playerId: -position, name: 'Invitado de <host>', points: 0}` (negative, so it can
  never collide with a real `INTEGER PRIMARY KEY`, which SQLite `rowid`-backed tables always keep
  ≥ 1 — `verified — invocation`, SQLite's own rowid semantics). Run `ConvocatoriaBuilder.build`
  unchanged. Post-process: any entry with a **negative** `playerId` (ephemeral) is never written to
  `convocatoria_entries` or `exclusions`, regardless of outcome — it exists only in the in-memory
  `ConvocatoriaResult` returned to the caller, for display, never persisted. Every entry with a real
  `playerId` (regular or named guest) persists exactly as today: `convocatoria_entries` always,
  `exclusions` on `excluded`/`demoted`.

**Both branches, and `preview`, stop calling `participations.set(…, { played })` entirely** —
attendance is not touched by this service at all any more (UC-001-05-S2); it becomes F9's sole
concern.

**New precondition** (closes the gap F6's amendment above flagged): before building the
`regularsCount > rules.slots` branch's pool, `ConvocatoriaService` checks that every real-`playerId`
candidate (regular or named guest) already has a `season_players` row for this season
(`StandingsService`'s own `players.list(seasonId)` — if a signed-up candidate is missing from it,
they have no captured seniority yet, hence no points, hence no fair ranking). If any are missing,
`preview`/`commit` throw, naming them, rather than silently dropping them from the pool — the
Organizer resolves this by answering the pending seniority prompt(s) (F2) before committing. **The
`regularsCount <= rules.slots` branch needs no such check** — nobody is ranked by points there, so a
missing `season_players` row doesn't affect who plays.

##### Impacted Units

| Unit                           | Type        | Location                                  | Action | Notes                                                                                                                                                        |
| ------------------------------ | ----------- | ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ConvocatoriaService`          | class       | `server/src/repo/convocatoria-service.ts` | Modify | branch on `regularsCount`; drop the `participations.set(…, played)` call; add the seniority precondition check; constructor gains `GuestCandidateRepository` |
| `convocatoria-service.test.ts` | test module | `server/src/repo/`                        | Modify | fixtures below, including the exhaustive-grep success criterion                                                                                              |

No new classes — this element wires together `GuestSlotAllocator` (F6) and the existing
`ConvocatoriaBuilder`/`StandingsService`/`ExclusionRepository`, per the HLD's own Strategy-pattern
description (§2.5/§2.11); it adds behaviour to one existing class, not a new one.

##### Test Methodology

Per HLD §2.10, `vitest` only (Testability Assessment: F8 = Yes). Fixtures, by hand, `not yet run`:

- **The exhaustive-grep success criterion** (`REQUIREMENTS.md` §5, UC-001-06): after this element,
  `grep -rn 'participations.*\.set(' server/src | grep played` (or the TypeScript-aware equivalent)
  must find **zero** call sites — checked at review time, tracked here as this element's own
  completion gate, not a runtime assertion.
- **Boundary, `regularsCount === rules.slots` exactly** (§2.9 Risks, explicitly not left to a
  natural ≤/> reading): 14 regulars, `slots = 14`, one guest → `regularsCount (14) <= slots (14)` →
  arrival-order branch runs; `GuestSlotAllocator.allocate(14, [guest], 14)` → `openSlots = 0` → the
  one guest is excluded, no regular is touched.
- **The author's worked example, end to end this time** (not just `GuestSlotAllocator` in
  isolation, F6's own fixture): 11 regulars + 4 guests, `slots = 14` →
  `convocatoria_entries` holds 11 regulars + 3 called-up guests, all `called_up`; `exclusions` holds
  one row (`Rubén`, `kind: 'points'`) if `Rubén` is a named guest, or zero rows if `Rubén` is the
  ephemeral one — the fixture is written with a named `Rubén` specifically to exercise the
  exclusion-point path, per UC-001-03-S6's own wording ("a named guest excluded this way still earns
  the ordinary exclusion point").
- **Guest-inclusive ranking, `regularsCount > rules.slots`**: 15 regulars + 1 named guest with high
  standings points + 1 ephemeral guest, `slots = 14` → the named guest's points place them ahead of
  the lowest-points regular → the pool's cut lands on that regular instead, not the guest —
  confirming guests are genuinely ranked, not silently floored to the bottom. The ephemeral guest,
  wherever it lands in the ranking, produces zero `convocatoria_entries`/`exclusions` rows either way.
- **`participations.played` stays unset**: after `commit()`, every entry's `participations.played`
  is whatever it was before the call (`0` for a first-time candidate) — never set to match `playing`.
- **Seniority precondition**: a signed-up candidate with no `season_players` row for this season →
  `preview()`/`commit()` throw, naming that player, when `regularsCount > rules.slots`; the same
  fixture with `regularsCount <= rules.slots` succeeds despite the missing row.

##### Data Contract Verification

Consumption path for the one behaviour this element removes: `participations.played`, written
before this element by exactly one call site (`convocatoria-service.ts:87`, per §1's LSP
find-references), read by `StandingsService.standings` (`games_played` aggregate) and
`ParticipationRepository.list` (display). After this element, nothing writes it — both readers keep
working against whatever value a _previous_ game's commit (pre-this-work-package data) or, once F9
lands, F9's final-list resolution left there; no reader assumes it was just set by a
convocatoria commit, since neither read site is scoped to "the most recent commit," only to
whatever the column currently holds. New read added by this element:
`GuestCandidateRepository.list(gameId)` (F6, already verified there) and `StandingsService.players`
(the precondition check) — both already-existing, unchanged shapes; this element adds a consumer,
not a new writer.

##### Patterns and Conventions

This is the concrete instance of the Strategy pattern the HLD already named (§2.5/§2.11):
`ConvocatoriaService.commit`/`preview` choose between `ConvocatoriaBuilder` and `GuestSlotAllocator`
based on `regularsCount > rules.slots`, once, at the top of each method — never a decision either
domain class makes about itself.

##### File Changes

- **Modify:** `server/src/repo/convocatoria-service.ts`.
- **Tests:** `server/src/repo/convocatoria-service.test.ts`.

#### F9 — Final list paste & resolution: attendance/payment/team-split source of truth, exclusion retraction

> **Retracted by WP-003 (F12).** `FinalListResolutionService` and its routes are deleted; `GameLifecycleService`, `PlayedDerivation`, `PaymentService` and `TeamPasteService` replace it.

##### Current Implementation

- No final-list ingestion code exists anywhere (verified — source, absence of any `final`/`team`/
  `claros`/`oscuros` symbol in `server/src`). `participations` has no team column (verified —
  source, `schema.sql`, `participations` `CREATE TABLE`).
- `games.status` is repurposed by F4 as "has this game's final list been resolved";
  F4 explicitly deferred setting it to `'played'` to this element (§ F4 Current Implementation,
  above) — this is that write path landing.
- LSP find-references on `participations.played` and `exclusions` (per this section's mandatory
  rule, re-run now that F8 has landed): `participations.played`'s one automated writer
  (`convocatoria-service.ts:87`) is deleted by F8 (this element's own prerequisite); the only
  surviving writer is the pre-existing manual route `PUT /games/:gameId/players/:playerId` →
  `participations.set` (verified — source, `routes/api.ts:157-167`) — an existing, general-purpose
  correction endpoint this work package does not touch or remove; it stays as the Organizer's manual
  escape hatch for a mistake this element's own resolution flow doesn't cover, not a second
  call site this element must reconcile against. `exclusions.set`'s only writer is
  `ConvocatoriaService.commit` (F8) — this element is the second and last.
- `ParticipationRepository.set`/`ExclusionRepository.set` (existing methods, unchanged interfaces)
  are sufficient for everything this element writes — confirmed against their signatures
  (`participation-repository.ts:41`, `exclusion-repository.ts:8`) before adding anything new.
- **Author-supplied worked example, this exchange** (no example existed in `REQUIREMENTS.md` for
  this shape, unlike the candidate list's WhatsApp fixture — `author decision`, filling that gap
  directly): a real paste looks like

  ```
  Claros
  -------
  player 1
  ...
  player 7

  Oscuros
  -------
  Player 8
  ..
  Player 14
  ```

  with two caveats the author gave explicitly: **the two team headings can appear in either
  order**, and **the separator line under each heading varies by whoever is typing it** ("could be
  other, it depends on the person that writes it") — so a dash run is one example, not the rule.

##### Approach

**New column**, edited directly into `schema.sql` (same convention as every other addition in this
work package, §2.2): `participations.team TEXT CHECK (team IN ('claros','oscuros'))` — nullable, so
a row created by the candidate/convocatoria stages (before a final list ever resolves the game)
has no team yet, and a backfilled game with no candidate stage at all needs no placeholder.

**Team-section splitting**, a new pure domain class, `FinalListParser`:

```
splitByTeam(rawText: string): Array<{ team: 'claros' | 'oscuros'; line: string; position: number }>
```

Splits `rawText` on newlines; runs `NameMatcher.strip` on each line (reusing F5's decoration
stripping — a pasted final-list line carries the same list-marker/emoji noise a candidate line
does); classifies each stripped line, in order:

1. **Heading** — the stripped line, case-insensitively, equals exactly `claros` or `oscuros`
   (`localeCompare(…, 'es', { sensitivity: 'base' })`, matching F5's own comparison convention).
   Sets "the team every following content line belongs to" until the next heading. Headings may
   appear in either order (`author decision`, above) — the splitter tracks "current team," it never
   assumes which heading comes first.
2. **Separator/blank** — a stripped line containing no letter at all (`/^[^a-zA-Zà-ÿÀ-Ÿ]*$/` —
   `inferred` from the author's own "-------" example generalised to any decorative run, since the
   author said the character varies) is dropped without consuming a position number, exactly like
   F6's blank-line handling.
3. **Content** — everything else. Assigned the next position in one running counter shared across
   both teams, in the order lines appear in the raw paste (mirrors F6's "1-based position among
   the pasted list's candidate lines" convention, reused here only as a stable identifier for
   round-tripping an unresolved line back through `resolve()` — this element assigns no
   arrival-order meaning to it, unlike F6's guest ordering).

A paste with content before the first heading is a malformed paste (`throw`, naming the offending
line) rather than a silent guess at which team it belongs to — no requirement or example describes
what such a line would mean, so nothing is inferred for it (Grounding — a guess here is
indistinguishable from a decision).

**Per-line shape parsing is not reimplemented.** Each `content` line, once tagged with a team, is
handed to F6's existing `CandidateLineParser.parse(line, position)` unchanged — its three outcomes
(`plain`, `hostAnnotated`, `plusOne`) are exactly the three shapes `REQUIREMENTS.md` describes for
a final-list line too (UC-001-06-S3's unnamed companion is `plusOne`; UC-001-06-S7's "Jesus"
example is `hostAnnotated`; an ordinary attendee is `plain`) — confirmed against every UC-001-06
scenario before deciding this, rather than assumed by analogy alone. No new parser class is
written for the per-line shape; only the team-section split above is new.

A new orchestrating class, `FinalListResolutionService(games: GameRepository, schedule:
ScheduleRepository, players: PlayerRepository, aliases: AliasRepository, participations:
ParticipationRepository, exclusions: ExclusionRepository, seasons: SeasonRepository, parser:
FinalListParser)`:

- `paste(text, gameId?)`: resolves the target game — explicit `gameId` (UC-001-10-S3/UC-001-07's
  override), or `new FinalListTargetResolver(games, schedule).resolve()` (F4) for the ordinary flow.
  Builds one `NameMatcher` from `players.listAll()` + `aliases.listAll()` (F5). Runs
  `parser.splitByTeam(text)`, then `CandidateLineParser.parse` per line. For each parsed line:
  - `plain`/`hostAnnotated` — matches `name` (and, for `hostAnnotated`, `hostName` — only for the
    `introduced_by` link on a genuinely new registration, UC-001-06-S7; the host is **not** billed
    for a named guest, per UC-001-06-S3's own wording restricting the billing multiplier to
    _unnamed_ companions). `unresolved`/`ambiguous` → added to the response's `unresolved` list,
    carrying the parsed shape and team, same round-trip contract as F6.
  - `plusOne` — matches `hostName` only; on resolution, increments that host's companion count for
    this paste (a host can carry more than one `plusOne` line; the count accumulates, not
    replaces).
  - Every resolved line writes, for its own real `playerId` only:
    `participations.set(gameId, playerId, { signed_up: true, played: true, team })` — `signed_up`
    is set `true` unconditionally here too (UC-001-06-S8: a regular who was never a candidate still
    ends up signed-up-and-played once the final list names them, since nothing upstream ever set it
    for them). A `plusOne` line's anonymous companion gets no row of its own, ever — only the
    host's own row gains a companion.
  - Once every line is resolved, one pass computes payment: for every real-`playerId` participant
    written this paste, `paid_cents = perHead * (1 + companionCount)`, where
    `perHead = Math.round(season.price_cents / season.slots)` — the exact expression
    `import-season.ts:142` already uses for the identical multiplier rule reading legacy data
    (verified — source), and `companionCount` is that player's own accumulated `plusOne` count from
    this paste (`0` for everyone else). `paid_on` stamps today's date, matching
    `ParticipationRepository.set`'s own existing "stamp when money first appears" behaviour
    (`participation-repository.ts:61-69`) — this element does not invent a second payment-timing
    rule.
  - **Exclusion reconciliation (UC-001-06-S6), recomputed from the frozen record every time, never a
    one-shot retraction**: read this game's `convocatoria_entries` (F8; empty for a backfilled
    game, F10). For every entry whose frozen `outcome` is `excluded` or `demoted`:
    `exclusions.set(gameId, playerId, thisPasteMarksThemPlaying ? null : entry.outcome)`. This is
    what `AGENTS.md`'s "convocatorias are frozen" invariant is _for_: the frozen
    `convocatoria_entries` row is never rewritten (the algorithm's own decision stays auditable),
    while `exclusions` — the table `StandingsService` actually scores from — is always derived
    fresh from (frozen outcome) × (this paste's played set). A re-paste that changes who actually
    played therefore reconciles correctly with no separate "undo" logic: paste once, the excluded
    player's point stands; re-paste with them now included, it's gone; re-paste again without them,
    it's back — the same one rule handles all three, not a one-way flag.
  - **Replace semantics**, matching F6/F8's own "safe to fully replace" pattern: before writing the
    new paste's resolved set, every existing `participations` row for this `game_id` has
    `played`/`team`/`paid_cents`/`paid_on`/`guests` reset to their defaults
    (`0`/`NULL`/`0`/`NULL`/`0`) via a new `ParticipationRepository.clearFinalOutcome(gameId)` —
    `signed_up` is untouched (candidate-stage data belongs to F6, never this element) and
    `guest_candidates` rows are left alone (F6's own note, § F6 Data Contract Verification: "the
    ephemeral candidacy... ends with this game either way" — nothing reads them again once this
    game resolves, so nothing here needs to delete them either).
  - Sets `games.status = 'played'` (F4's repurposed flag — the one write path F4 deferred here) once
    every line resolves without error.
  - **Seniority-capture surfacing (F2), not gated but flagged**: for every real-`playerId`
    participant this paste writes, if `players.hasAppeared(game.season_id, playerId)` is `false`,
    the response's `matched` entry for them carries `{ seniorityPrompt: true, suggested:
players.suggestSeniority(game.season_id, playerId) }` (F2's own two methods, reused unchanged)
    — UC-001-07-S6's "still applies, scoped to that historical season" holds automatically here,
    since this check always reads `game.season_id`, the _game's own_ season, never "today's."
    Confirming the prompt persists through F2's existing `POST
/seasons/:id/players/:playerId/seniority` route — this element adds no new persistence path for
    it, only the trigger.
  - Returns `{ game, matched: [...], unresolved: [...] }`.
- `resolve(gameId, line, action)`: identical contract to F6's `resolve` (`line` is the client's
  round-tripped parsed shape plus `team`; `action` is `link`/`linkAsAlias`/`register`, the latter
  via `PlayerRegistrar` — F7, shared, not duplicated), persisting through the same rules as
  `paste()`'s resolved branch for this one line only, never re-running replace-semantics for the
  rest of the game's already-persisted final list (mirrors F6's UC-001-04-S5 guarantee).

**Team assignment has no downstream reader** (UC-001-06-S9, author-confirmed): `team` is written
and returned in the game's own detail response; nothing in `StandingsService`, `PointsCalculator`,
or `ConvocatoriaBuilder` reads it — confirmed by grep for `\.team\b` finding only this element's own
write/read pair once it lands.

##### Impacted Units

| Unit                                    | Type        | Location                                           | Action | Notes                                                                                            |
| --------------------------------------- | ----------- | -------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `participations.team`                   | column      | `server/src/db/schema.sql`                         | Create | nullable, `CHECK (team IN ('claros','oscuros'))`                                                 |
| `FinalListParser`                       | class       | `server/src/domain/final-list-parser.ts`           | Create | `splitByTeam(rawText)`                                                                           |
| `FinalListResolutionService`            | class       | `server/src/repo/final-list-resolution-service.ts` | Create | `paste(text, gameId?)`, `resolve(gameId, line, action)`                                          |
| `ParticipationRepository`               | class       | `server/src/repo/participation-repository.ts`      | Modify | add `clearFinalOutcome(gameId)`                                                                  |
| `api` router                            | module      | `server/src/routes/api.ts`                         | Modify | `POST /api/games/final:paste`, `POST /api/games/:gameId/final/resolve`                           |
| `GameDay.tsx`                           | component   | `web/src/pages/`                                   | Modify | final-list paste textarea, matched/unresolved summary with seniority-prompt inline, team display |
| `final-list-parser.test.ts`             | test module | `server/src/domain/`                               | Create | fixtures below                                                                                   |
| `final-list-resolution-service.test.ts` | test module | `server/src/repo/`                                 | Create | fixtures below, including the exclusion-retraction and re-paste traces                           |
| `participation-repository.test.ts`      | test module | `server/src/repo/`                                 | Modify | `clearFinalOutcome` fixture                                                                      |
| `api.test.ts`                           | test module | `server/src/routes/`                               | Modify | the two new routes' coverage                                                                     |

##### Test Methodology

Per HLD §2.10: `vitest` for `FinalListParser` (pure) and `FinalListResolutionService`/routes (real
SQLite); Playwright E2E for the `GameDay.tsx` final-list flow (Testability Assessment: F9 = Yes,
E2E covers the UI half). Fixtures, by hand, `not yet run`:

- **The author's own worked example, exactly as given** (§ Current Implementation): headings in
  either order, an arbitrary separator line under each — `splitByTeam` assigns all seven `Claros`
  lines `team: 'claros'` and all seven `Oscuros` lines `team: 'oscuros'` regardless of which heading
  came first or what the separator characters were.
- **UC-001-06-S1**, final list matches the Convocatoria exactly: every called-up player's line
  resolves; all are billed `perHead`, `played = 1`; no `exclusions` row changes (none of them were
  `excluded`/`demoted` to begin with).
- **UC-001-06-S2**, divergence: a called-up player omitted from the paste keeps `played = 0` (its
  untouched default); a replacement named instead gets `played = 1`, billed normally; the exclusion
  point already granted to a _different_, actually-excluded candidate is untouched (the
  reconciliation only ever looks at whether _that specific_ excluded/demoted player appears playing,
  never at anyone else's presence or absence).
- **UC-001-06-S3**, anonymous guest billing: `"Fer +1"` under `Claros`, `slots`-price
  `perHead = 400` (matching `import-season.ts`'s own worked value, cited above) →
  `paid_cents = 400 * (1 + 1) = 800` for Fer; no participation row for the companion.
- **UC-001-06-S6**, retraction: a player with a frozen `convocatoria_entries.outcome = 'excluded'`
  and a live `exclusions` row appears playing in the final list → after `paste()`, the `exclusions`
  row for `(gameId, playerId)` is gone; `convocatoria_entries.outcome` still reads `'excluded'`
  unchanged (frozen). **Re-paste, same game, this time omitting them again** → the `exclusions` row
  is re-created with `kind: 'excluded'` — the reconciliation rule proven to run both directions, not
  only forward.
- **UC-001-06-S7**, brand-new guest via host annotation, never a candidate: `"Jesus (Pablo)"`,
  `Jesus` unresolved → `resolve(..., { type: 'register', name: 'Jesus', introducedBy: <Pablo's id>
})` → a `participations` row for Jesus, `played = 1`, billed at `perHead` (his own price, not
  folded into Pablo's), `introduced_by = Pablo`.
- **UC-001-06-S8**, known regular attends with no prior candidacy: a player with no `participations`
  row at all for this game, named plainly in the final list → resolves via the ordinary
  match-and-write path; no special case triggers, confirming S8's "no candidacy required" holds by
  construction (the write path never checks for a pre-existing row before creating one).
- **UC-001-06-S9**: after any of the above, `participations.team` holds the correct value for every
  written row; grep for `\.team\b` outside this element's own files finds nothing (no reader
  exists).
- **Seniority surfacing (F2 reuse)**: a resolved player with no `season_players` row for
  `game.season_id` → the response's `matched` entry for them carries `seniorityPrompt: true` and a
  `suggested` value equal to `SeniorityAdvisor.suggest(...)`'s own fixture result (F2, unchanged).
- **Malformed paste**: text with a content line before any heading → `paste()` throws, naming the
  line; no `participations` row is written for any line in that same paste (all-or-nothing, not a
  partial write followed by an error).

Manual Test Plan guideline (`GameDay.tsx` half, Playwright E2E expected to cover it end to end):
after pasting a final list where one previously-excluded player now appears as having played,
observe that their standings row updates (exclusion count drops by one, points recompute) without a
page reload, and that the team split renders as two labelled groups matching the pasted headings'
own order.

##### Data Contract Verification

Stored shapes: `participations.team` (new, nullable enum-by-`CHECK`); `participations.played`,
`.paid_cents`, `.paid_on`, `.guests` (existing columns, this element becomes their sole automated
writer now that F8 has removed `ConvocatoriaService`'s — confirmed by the re-run LSP
find-references above); `exclusions` (existing table, reconciled, never newly shaped);
`games.status` (existing column, this element is F4's deferred writer, per that element's own
Data Contract Verification note). Write path: `FinalListResolutionService.paste`/`resolve` via
`ParticipationRepository.set`/`clearFinalOutcome` and `ExclusionRepository.set`. Read path:
`StandingsService.standings` (unchanged shape, already reads `played`/`paid_cents`/`guests`/
`exclusions` — this element changes _when_ and _how_ those get set, never what a reader does with
them, so `StandingsService` itself needs no code change, only new data flowing into the same
queries it already runs); `GameRow.status` read by F4's `unresolvedOnOrBefore` (this element is
what finally exercises that read against real writes, closing the gap F4 flagged as temporary).
User-editable: create/update only, through `paste`/`resolve` — no independent delete of a final
list's outcome is asked for by any use case; a correction is made by re-pasting (replace semantics,
above), matching F6's own choice not to build a separate delete path.

##### Patterns and Conventions

`FinalListParser` follows the existing pure-domain-class shape. `FinalListResolutionService`
follows the same service-composition shape as `CandidateResolutionService` (F6) — deliberately
mirrored, not merely similar, since both are "parse pasted text → match/resolve names → persist a
replaceable stage" pipelines differing only in what gets persisted at the end (candidate signup vs.
final attendance/payment/team). Reuses `CandidateLineParser`, `NameMatcher`, `PlayerRegistrar`
unchanged — the Strategy/composition pattern this whole work package follows (§2.11): a new
orchestrating class wires existing pure/repo pieces together rather than each element re-deriving
its own parsing or matching logic.

##### File Changes

- **Create:** `server/src/domain/final-list-parser.ts`, `server/src/domain/final-list-parser.test.ts`,
  `server/src/repo/final-list-resolution-service.ts`,
  `server/src/repo/final-list-resolution-service.test.ts`.
- **Modify:** `server/src/db/schema.sql`, `server/src/repo/participation-repository.ts`,
  `server/src/routes/api.ts`, `web/src/pages/GameDay.tsx`.
- **Tests:** `server/src/repo/participation-repository.test.ts`, `server/src/routes/api.test.ts`.
- **E2E:** a new `e2e/tests/` spec covering the final-list-paste-and-resolve flow end to end,
  including the exclusion-retraction case.

#### F10 — Historical backfill

> **Retracted by WP-003 (F12).** Backfill by final list is gone; `ConvocatoriaHistoryConverter` and the normal lifecycle replace it.

##### Current Implementation

- `POST /seasons/:id/games` (existing) requires a `seasonId` in the URL — a manual pick
  (verified — source, `routes/api.ts:112-127`), which UC-001-07-S4 explicitly forbids for this
  element ("never a separate manual 'pick a season' step"). This is the one gap F1
  left unfilled: F1 gave `SeasonRepository.current(asOf)`, but no route derives a game's season
  from an arbitrary past date the way it derives "today's" season.
- `FinalListResolutionService.paste(text, gameId?)` (F9, drafted just above)
  already accepts an explicit `gameId`, bypassing `FinalListTargetResolver` entirely — this is
  UC-001-10-S3's override, already built; this element is its consumer, not a reason to add a
  second override mechanism.

##### Approach

One new route: `POST /api/games` — body `{ played_on: string }`, no `seasonId`. Derives the
owning season via `seasons.current(played_on)` (F1's `SeasonRepository.current`, called with the
_backfilled date_, not today — the same method, a different argument, per UC-001-07-S4's own
"consistent with UC-001-01/UC-001-08" wording); throws (naming the date) if no season covers it —
F1's own documented gap risk (a season row was never created for that year) surfacing here as an
ordinary validation error, not a new failure mode this element invents. On success, calls the
existing `GameRepository.create(seasonId, played_on)` unchanged.

**`POST /seasons/:id/games` (the existing, manually-seasoned route) is deleted, not left
alongside.** Leaving both would mean two ways to create a game exist, one of them a manual
season-pick UC-001-07-S4 exists specifically to forbid — the invariant only holds if the forbidden
path is actually gone, not merely unused. LSP find-references on `games.create` (per this section's
mandatory rule) before removing the old route: its only caller is that one handler
(`routes/api.ts:112-127`) — no other route, script, or test constructs a game through it with an
explicit season id outside this one route, so nothing else breaks.

**Nothing else is new.** The Organizer's actual workflow is: `POST /api/games` (this element) to
create the historical row, then `POST /api/games/final:paste` with that game's id explicit (F9,
already built) to record its outcome — never `POST /api/games/candidates:paste` or `POST
/games/:gameId/convocatoria` for that game, which is simply a UI/workflow choice (the backfill form
never offers those actions), not a guard this element's backend needs to enforce: nothing about
F9's `paste`/`resolve` requires a prior Convocatoria to exist (confirmed against F9's own Approach,
above — it reads `convocatoria_entries` for reconciliation, tolerating zero rows found, never
requiring at least one).

- **UC-001-07-S1** (no Convocatoria/exclusion rows for a backfilled game) holds structurally: this
  element never calls `ConvocatoriaService.commit`, and F9's reconciliation step is a no-op against
  zero `convocatoria_entries` rows — nothing to retract, nothing written.
- **UC-001-07-S5** (the backfilled game's own season's price, never today's) holds because F9's
  `perHead` computation already reads `this.seasons.get(game.season_id)` (the game's own season),
  never `seasons.current()` — confirmed by re-reading F9's Approach rather than assumed by
  restating S5's wording alone.
- **UC-001-07-S6** (seniority scoped to the historical season) holds for the identical reason: F9's
  seniority-surfacing check already reads `game.season_id`, so a first appearance recorded through
  a backfilled game is captured against that game's own season, not today's — same mechanism, no
  special case for "this game is old."

##### Impacted Units

| Unit                          | Type        | Location                   | Action | Notes                                                                                                               |
| ----------------------------- | ----------- | -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `api` router                  | module      | `server/src/routes/api.ts` | Modify | add `POST /api/games` (derives `seasonId` from `played_on` via `seasons.current`); delete `POST /seasons/:id/games` |
| `api.test.ts`                 | test module | `server/src/routes/`       | Modify | fixtures below                                                                                                      |
| `GameDay.tsx` or `Manage.tsx` | component   | `web/src/pages/`           | Modify | an explicit "record a past game" form: date, then hands off to F9's final-list paste with that game's id            |

##### Test Methodology

Per HLD §2.10, `vitest` route-integration test against real SQLite (Testability Assessment: F10 =
Yes — the Manual Test Plan guideline below is carried for the UI form, not this backend logic).
Fixtures, by hand, `not yet run`:

- Three seasons on record (2023, 2024, 2025 start years, F1's own boundary convention), a date
  inside the 2024 season's range → `POST /api/games` creates a game with `season_id` = the 2024
  season's id, never whatever season is `current()` _today_.
- A date in an intentionally-skipped year (no season row at all) → `POST /api/games` throws, naming
  the date — the same gap F1 already documented as an operational expectation, not silently
  defaulted to the nearest season.
- End-to-end: `POST /api/games` for a 2024 date, priced at that season's `price_cents`
  (different from the current season's, by fixture construction), then `POST
/api/games/final:paste` with that game's id explicit → the computed `paid_cents` uses the 2024
  season's `perHead`, not the current season's.
- A first-appearing player in that same backfilled paste → the response's `seniorityPrompt` fires
  scoped to the 2024 season id, confirmed by checking `hasAppeared(2024SeasonId, playerId)` was
  what was actually queried (not the current season's id) — the same fixture shape F2 already
  uses, applied against a non-current season this time.

Manual Test Plan guideline (the "record a past game" form, not fully automatable by `vitest` alone):
after entering a date from a prior season and submitting a final list against it, observe that the
game appears under that historical season's own games list (not the currently active season's),
and that no Convocatoria section renders for it at all (there is nothing to show).

##### Data Contract Verification

No new stored shape — this element only adds a new _way to reach_ `GameRepository.create` (an
existing write, unchanged signature) and reads `SeasonRepository.current` (F1, unchanged signature)
with a caller-supplied date instead of "today." Consumption path is entirely F1's and F9's own,
already traced in their respective sections; this element introduces no new column, table, or
reader, so there is nothing further to verify here beyond confirming (above) that both reused paths
take the _backfilled_ date/season, never today's — which is this element's whole point, not
incidental to it.

##### Patterns and Conventions

No new pattern — a thin route composing two already-designed pieces (`SeasonRepository.current`,
`GameRepository.create`), consistent with this work package's own preference (§2.2/F4) for adding a
route over inventing a wrapper class when gluing two existing calls together is the entire job.

##### File Changes

- **Modify:** `server/src/routes/api.ts`.
- **Tests:** `server/src/routes/api.test.ts`.
- **Frontend:** a small addition to `GameDay.tsx` or `Manage.tsx` (Anatomy's call, not Design's —
  either page can host a one-field "backfill a past game" form; nothing about its shape is
  use-case-sensitive enough to fix here).

## 4. Documentation Impact

Per the Study's doc map (`study/doc-map.md`, Q-07), one subsection per document this design makes
untrue.

#### `docs/domain-model/glossary.md`

**Stops being true:** the `## Convocatoria` entry (`glossary.md:15-18`, verified — document) reads
"La lista de quién juega esta semana" as a single, undifferentiated concept — this work package
splits that into two stages with different authority (the algorithmic Convocatoria, provisional
except for its exclusion point per UC-001-05-S1/S3; the final list, authoritative over everything
else per UC-001-06-S2/S6/S8). **Replaces it with:** the entry gains a line distinguishing
"Convocatoria" (the algorithm's pre-game call-up, F8) from "lista final" (the post-game outcome,
F9) — pointing at whichever document ends up holding the fuller candidate/final-stage explanation
(`candidate-convocatoria-stages.md`, per the HLD's own §2.8 reference). New terms this work package
introduces with no existing entry at all: candidate, reserva (explicitly not modeled as a distinct
concept — a name past the "Reservas" trailer is simply dropped, F6), invitado ocasional/nombrado
(named guest) vs. invitado anónimo (ephemeral guest), Claros/Oscuros (the team split, F9) — each
needs its own short entry, same style as the existing `## Mercy seat` entry.

#### `docs/domain-model/convocatoria.md`

**Stops being true:** nothing about the algorithm itself (`## Pasos`, steps 1-6,
`convocatoria.md:20-86`) — `ConvocatoriaBuilder.build` is unchanged and out of scope (§1, already
cited). What stops being true is the _implicit_ assumption that committing this list is the same
moment as attendance being decided — the document never states this explicitly, but F8/F9 together
retire it as a fact about the system regardless. **Replaces it with:** a short pointer, near the top
of `## Pasos` step 1 ("Reunir a los apuntados"), noting that "apuntados" now means F6's resolved
candidate pool (regulars + named/ephemeral guests), not a raw `signed_up` read, and that this
document describes selection only — what actually happened on the pitch is F9's own record, not
this algorithm's output.

#### `docs/domain-model/points.md`

**Stops being true:** `## 1. Asistencia` (`points.md:10-25`, verified — document) explains
attendance points via the legacy sheet's `*`/`4` cell semantics, and nowhere states _when_ a
`played`/paid cell is set relative to the Convocatoria — because under the legacy script (and the
current, pre-this-work-package code) they were the same moment. Once F8/F9 land, `played` is set
strictly later, by the final list, never by the commit — a fact this document currently has no
occasion to state because it was never previously false. **Replaces it with:** one added paragraph
after `## 1. Asistencia`'s existing text, stating explicitly that a paid game requires a resolved
final list (F9), not merely a Convocatoria commit — otherwise a future reader could reasonably
infer from this document alone (as the current code's behaviour would have confirmed, before this
work package) that committing the Convocatoria is what grants the attendance point.

#### `docs/domain-model/README.md`, `data-quality.md`, `legacy-*.md`

`None` — historical record of the legacy spreadsheet/script; asserts nothing about the current
schema or algorithm being final, so nothing in this work package's scope makes any of it untrue
(already stated at HLD altitude, §2.8; restated here since the top-level section is exempt from no
document by omission).

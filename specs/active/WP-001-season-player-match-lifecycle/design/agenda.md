# Design Agenda — WP-001-season-player-match-lifecycle

Status: approved

## Depth

**Deep.** This WP drops two schema columns that other code reads today (`seasons.is_active`,
`season_players.active`), redefines what a third column means (`season_players.seasons`: "which
season number" → "complete prior seasons"), and moves _when_ a point is granted
(`commitConvocatoria` currently sets `participations.played`; UC-001-05-S2 says it must not). Every
one of those is read or written from several call sites (`repo.ts`, `web/src/pages/*.tsx`) and,
once real weekly data is recorded against the new shape, is expensive to walk back. Feedback is
also slow: this is an app one operator runs once a week, so a wrong shape surfaces a week at a
time, not on the next request. Reversibility is low and feedback is slow — deep design.

## Output budget

A full HLD covering schema, three new/changed domain modules, ~8 route changes, and four frontend
areas, each with LLD subsections where the element has element-specific content. Expect the
finished `DESIGN_PLAN.md` to run long — this is not a one-page design — but each section still
states only what the next phase needs to cut tasks from, not a restatement of REQUIREMENTS.md.

## Artifact types

Database (table, column, migration), Code (module, function — `server/src/domain/`, `server/src/repo.ts`,
`server/src/routes/api.ts`), Frontend (component, `web/src/pages/*.tsx`).

## Grouping

Increment 0 is a shared-prerequisite pass: every later increment reads the schema and the
name-matching module it produces, and no single UC owns it. Increments 1–6 each follow one
coverage row's use-case cluster from `REQUIREMENTS.md` §1, in the dependency order the lifecycle
itself imposes (roster/season → schedule → candidate stage → algorithmic stage → final stage →
backfill).

| #   | Element                                                                                                                 | Realizes                                    | Enables       | Checkpoint-worthy                      | Increment | Status   |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------- | -------------------------------------- | --------- | -------- |
| F1  | Schema: drop `seasons.is_active` + `season_players.active`; redefine `season_players.seasons` as complete-prior-seasons | UC-001-01-S1,S2,S5; UC-001-02-S2            | 0 (all)       | yes — current column readers           | 0         | settled  |
| F2  | Schema + domain: `players.introduced_by` host link                                                                      | UC-001-04-S2, UC-001-03-S4, UC-001-06-S7    | F16, F21      | yes — FK shape                         | 0         | settled  |
| F3  | Schema + domain: `player_aliases` table                                                                                 | UC-001-09-S1,S2                             | F5, F16       | yes — uniqueness rule                  | 0         | settled  |
| F4  | Schema + domain: `weekly_schedule` table (day, kickoff_time, effective_from)                                            | UC-001-08-S3                                | F11, F12, F20 | yes — versioning shape                 | 0         | settled  |
| F5  | Domain: name/decoration-matching module                                                                                 | UC-001-03-S7,S8; UC-001-09-S3               | F13, F16, F21 | yes — no prior art (Q-05)              | 0         | settled  |
| F6  | Repo/route: `GET /api/seasons/current`; remove `/activate`                                                              | UC-001-01-S5                                | —             | yes — `repo.ts activateSeason` callers | 1         | proposed |
| F7  | Repo: roster access no longer scoped by per-season enrollment                                                           | UC-001-01-S1,S2                             | F8, F9        | yes — `listPlayers` callers            | 1         | proposed |
| F8  | Repo: seniority-capture flow (first-appearance detection, suggested value, record)                                      | UC-001-02-S1–S5                             | F10           | yes — "first appearance" definition    | 1         | proposed |
| F9  | Frontend (Manage.tsx): drop enrollment/activation controls                                                              | UC-001-01-S1, S4                            | —             | —                                      | 1         | proposed |
| F10 | Frontend: seniority prompt UI                                                                                           | UC-001-02-S1,S2,S4                          | —             | —                                      | 1         | proposed |
| F11 | Route: `GET`/`PUT /api/schedule`                                                                                        | UC-001-08-S3                                | F12, F20      | —                                      | 2         | proposed |
| F12 | Domain: game-for-date resolution, auto-create                                                                           | UC-001-08-S1,S2,S4                          | F15           | yes — `updateGame` exception path      | 2         | proposed |
| F13 | Domain: candidate-list parser                                                                                           | UC-001-03-S1,S3,S4,S5,S6(detect),S7         | F15           | yes — worked example (author's paste)  | 3         | proposed |
| F14 | Schema: candidate staging incl. ephemeral guest slots                                                                   | UC-001-03-S5                                | F13, F15, F18 | yes — no persistent row for ephemeral  | 3         | proposed |
| F15 | Route: `POST /api/games/candidates:paste`                                                                               | UC-001-03-S1,S2,S9                          | F17           | —                                      | 3         | proposed |
| F16 | Route: resolution endpoint(s) — link / register / alias / collision                                                     | UC-001-03-S2; UC-001-04-S1–S5; UC-001-09-S1 | F17           | —                                      | 3         | proposed |
| F17 | Frontend (GameDay.tsx): candidate paste + resolution view                                                               | UC-001-03-S2; Vision §4                     | —             | —                                      | 3         | proposed |
| F18 | Domain: regulars-vs-guests arrival-order rule                                                                           | UC-001-03-S6                                | F19           | yes — author's worked example          | 4         | proposed |
| F19 | Repo: `commitConvocatoria` stops setting `played`; branches to F18                                                      | UC-001-05-S1–S5                             | —             | yes — current `setParticipation` call  | 4         | proposed |
| F20 | Domain: final-list target resolution (default + cutoff)                                                                 | UC-001-10-S1–S3                             | F23           | yes — cutoff derivation                | 5         | proposed |
| F21 | Domain: final-list parser (two teams, host annotation, +1)                                                              | UC-001-06-S1–S3,S5,S7–S9                    | F22           | —                                      | 5         | proposed |
| F22 | Repo: final-list resolution — played/paid, exclusion retraction, billing multiplier, team record                        | UC-001-06-S1,S2,S3,S6,S9                    | —             | yes — retraction of `exclusions` row   | 5         | proposed |
| F23 | Route: `POST /api/games/final:paste`                                                                                    | UC-001-06 family                            | F24           | —                                      | 5         | proposed |
| F24 | Frontend (GameDay.tsx): final-list paste + resolution + team display                                                    | UC-001-06                                   | —             | —                                      | 5         | proposed |
| F25 | Route/repo: explicit backfill path (`POST /api/games` + final-list-only resolution)                                     | UC-001-07-S1,S4,S5,S6                       | —             | yes — no Convocatoria rows created     | 6         | proposed |
| F26 | Frontend: explicit past-game selection override                                                                         | UC-001-07, UC-001-10-S3                     | —             | —                                      | 6         | proposed |

Docs (`glossary.md`, `convocatoria.md`, per `study/doc-map.md`) are covered in `DESIGN_PLAN.md`'s
own File Changes → Docs section once every increment above is settled — they realize no scenario
of their own, so they carry no element row.

# Requirements — WP-002-backend-oop-solid-refactor

## 1. Use Case Audit

Boundary: `server/src/domain/points.ts`, `seniority.ts`, `convocatoria.ts`, `types.ts` + tests,
`server/src/repo.ts`, and the `routes/api.ts`/`scripts/import-season.ts` call sites that use them —
a behavior-preserving rewrite into classes conforming to `.agents/rules/coding-standard.md`. Study
was skipped (author decision); `VISION.md` is the whole input.

### Coverage

| Need                                                                                   | Use Case(s) |
| -------------------------------------------------------------------------------------- | ----------- |
| Rewrite the points formula into a class, same outcomes                                 | UC-002-01   |
| Rewrite the seniority curve into a class, same outcomes                                | UC-002-02   |
| Rewrite the convocatoria selection/mercy/demotion logic into classes, same outcomes    | UC-002-03   |
| Rewrite `repo.ts` into repository classes behind interfaces, same persistence behavior | UC-002-04   |
| `routes/api.ts` continues to serve working endpoints via the new classes               | UC-002-05   |
| Result actually conforms to `.agents/rules/coding-standard.md`                         | UC-002-06   |
| Docs asserting the old free-function architecture are corrected                        | UC-002-07   |

Use case diagram: [`requirements/diagrams/use-cases.puml`](requirements/diagrams/use-cases.puml).

## 2. Use Cases

Actor throughout: **Developer** — the codebase's maintainer (today, the author); this WP has no
end-user-facing actor (`VISION.md` §2).

### UC-002-01 — `PointsCalculator` preserves the points formula

Rests on `server/src/domain/points.ts` (`computePoints`, `exclusionScores`) and its existing test
fixtures in `domain.test.ts`.

#### UC-002-01-S1 — Same inputs produce the same breakdown (outline)

Given the fixture inputs `domain.test.ts` already exercises today's `computePoints` with
When a `PointsCalculator` instance computes the breakdown from the same inputs
Then it returns the same `attendance`/`exclusions`/`seniority`/`total` values as today's function —
identical to the digit, not merely close (`verified — source`, `domain.test.ts` rows: `Antonio C`
30/0/13→37.308813655; `Fer` 30/1/2→32.79248125).

| variant   | paidGames | exclusions | seasons | total        |
| --------- | --------- | ---------- | ------- | ------------ |
| Antonio C | 30        | 0          | 13      | 37.308813655 |
| Fer       | 30        | 1          | 2       | 32.79248125  |
| Nacho     | 19        | 3          | 1       | 23           |
| Emma      | 24        | 4          | 2       | 29.79248125  |

#### UC-002-01-S2 — Only `points`/`demoted` exclusions score

Given an exclusion of kind `mercy`
When the class checks whether it contributes to the exclusion count
Then it does not — only `points` and `demoted` do (unchanged from today's `exclusionScores`,
`verified — source`, `points.ts`).

#### UC-002-01-S3 — Negative inputs clamp to zero

Given a negative `paidGames` or `exclusions` value (should never occur, but the current function
guards it anyway)
When the class computes the breakdown
Then both are clamped to zero before summing, exactly as today's `Math.max(0, ...)` guards
(`verified — source`, `points.ts`).

Graduation: hard requirement.

### UC-002-02 — `SeniorityCurve` preserves the seniority curve

Rests on `server/src/domain/seniority.ts` (`seasonContribution`, `seniorityPoints`) and its Aux-tab
fixture table in `domain.test.ts`.

#### UC-002-02-S1 — Matches the legacy Aux table exactly (outline)

Given a season count from the Aux-tab fixture table already in `domain.test.ts`
When a `SeniorityCurve` instance computes the total for that count
Then it matches the table to 8 decimal places, exactly as today's `seniorityPoints`
(`verified — source`, `domain.test.ts` `describe('seniority')`).

| seasons | expected    |
| ------- | ----------- |
| 1       | 1           |
| 2       | 1.79248125  |
| 13      | 7.308813655 |

#### UC-002-02-S2 — Below one season is zero

Given a season count of 0 or negative
When computed
Then the result is 0 (unchanged, `verified — source`, `seniority.ts`).

#### UC-002-02-S3 — Extends past the legacy table with diminishing returns

Given a season count beyond 13 (e.g. 20)
When computed
Then the result exceeds `seniorityPoints(13)` but each additional season contributes less than the
one before (unchanged, `verified — source`, `seniority.ts` doc comment and `domain.test.ts`
"has diminishing returns").

Graduation: hard requirement.

### UC-002-03 — `ConvocatoriaBuilder` preserves selection/mercy/demotion logic

Rests on `server/src/domain/convocatoria.ts` (`buildConvocatoria`, `selectPromotees`,
`selectDemotees`) and its existing test cases.

#### UC-002-03-S1 — Oversubscribed case, same entries and swaps (outline)

Given the same signups/history/rules as one of today's oversubscribed test cases
When a `ConvocatoriaBuilder` instance builds the convocatoria
Then it returns the same `entries`/`swaps`/`oversubscribed` result as today's `buildConvocatoria`
(`verified — source`, `convocatoria.ts`, moved test cases).

#### UC-002-03-S2 — Not oversubscribed: everyone plays, no swaps

Given a signup count at or below `rules.slots`
When built
Then `oversubscribed` is false, every entry has `playing: true`, and `swaps` is empty (unchanged).

#### UC-002-03-S3 — Mercy tie-break order is preserved

Given more than one player eligible for a mercy seat (waited ≥ `gamesOutForMercy`)
When promotees are selected
Then the ordering is longest wait first, then fewest prior mercy seats, then highest points —
exactly today's `selectPromotees` comparator (`verified — source`, `convocatoria.ts`); the demotee
side preserves its own comparator (fewest prior demotions, then the configured
`demotionDirection`).

Graduation: hard requirement.

### UC-002-04 — Repository classes preserve persistence behavior

Rests on `server/src/repo.ts` (all exports) and its callers: `routes/api.ts` and
`scripts/import-season.ts`. Target shape: one repository class per aggregate —
`SeasonRepository`, `PlayerRepository`, `GameRepository`, `ParticipationRepository`,
`ExclusionRepository` — plus a `ConvocatoriaService` (replacing `previewConvocatoria`/
`commitConvocatoria`, composed from `GameRepository`, `ExclusionRepository`, `ConvocatoriaBuilder`)
and a `StandingsService` (replacing the standalone `standings()`, composed from the above plus
`PointsCalculator`). Each repository is constructed with the open `better-sqlite3` database handle
(`server/src/db/index.ts`'s `db()`), preserving today's singleton-connection pattern.

#### UC-002-04-S1 — Same call, same row (outline)

Given the same arguments today's `repo.ts` export accepts
When the corresponding repository class method is called
Then it performs the identical SQL and returns/writes the identical shape — verified against a
real temp-file SQLite DB built from the actual `schema.sql`, per `docs/test-strategy.md`
§Integration, never a mocked DB.

| today's export                                                                               | new home                  |
| -------------------------------------------------------------------------------------------- | ------------------------- |
| `createSeason`, `updateSeason`, `activateSeason`, `listSeasons`, `getSeason`, `activeSeason` | `SeasonRepository`        |
| `addPlayer`, `listPlayers`, `updateSeasonPlayer`                                             | `PlayerRepository`        |
| `createGame`, `updateGame`, `deleteGame`, `listGames`, `getGame`                             | `GameRepository`          |
| `setParticipation`, `removeParticipation`, `listParticipations`                              | `ParticipationRepository` |
| `setExclusion`, `historyFor`                                                                 | `ExclusionRepository`     |
| `previewConvocatoria`, `commitConvocatoria`, `savedConvocatoria`                             | `ConvocatoriaService`     |
| `standings`, `rulesOf`                                                                       | `StandingsService`        |

#### UC-002-04-S2 — Commit still runs one transaction

Given a game ready for its convocatoria to be committed
When `ConvocatoriaService.commit(gameId)` runs (replacing `commitConvocatoria`)
Then it performs the identical delete-then-insert sequence, in one transaction, against
`convocatorias`/`convocatoria_entries`/`exclusions`/`participations` as today (`verified — source`,
`repo.ts` `commitConvocatoria`).

#### UC-002-04-S3 — The seed script still reproduces the season

Given `scripts/import-season.ts`'s calls to `repo.listSeasons`, `repo.createSeason`,
`repo.addPlayer`, `repo.createGame` (`verified — source`, `scripts/import-season.ts`)
When the script is updated to the new repository classes' call shapes
Then `npm run seed -- --reset` reproduces the 2024/2025 season with the same rows as before this
refactor (checked against the existing seed script's own internal consistency checks — game
counts, weekly totals — which are unaffected by this WP).

Graduation: hard requirement.

### UC-002-05 — `routes/api.ts` continues to serve working endpoints

Rests on `server/src/routes/api.ts`'s existing handlers, each currently calling one `repo.*` free
function.

#### UC-002-05-S1 — Ordinary flow unaffected (outline)

Given an existing route handler calling a `repo.*` free function today
When it's updated to construct/call the corresponding repository class or service instead
Then the endpoint's observable behavior for the ordinary case is unchanged — checked by the
existing E2E path (`e2e/tests/season-and-player.spec.ts`: create the first season, add a player,
see it in the roster) passing unmodified.

#### UC-002-05-S2 — Full suites pass unmodified in assertion

Given the full test suite (`npm test`, Vitest) and the E2E suite (`npm run test:e2e`, Playwright)
When run after this refactor lands
Then both pass, with only call-shape adaptations (`new Foo().method(...)` instead of `foo(...)`) —
no assertion loosened or removed to make a test pass (`VISION.md` §4).

Graduation: hard requirement.

### UC-002-06 — The result conforms to the coding standard

Rests on `.agents/rules/coding-standard.md`.

#### UC-002-06-S1 — No top-level free function remains

Given the finished `server/src/domain/` and `server/src/repo.ts` (now split into repository/service
classes)
When grepped for an exported top-level `function` declaration or `const ... = (...) => ...` outside
a class
Then none are found (`not yet run` — this is the review-time check, per `coding-standard.md`
§Enforcement: no lint rule exists yet, so this is a manual/code-review check, not an automated
gate).

#### UC-002-06-S2 — No stateless `static` method remains

Given every class this WP introduces
When inspected for `static` methods
Then each either reads/writes class-level state or is a named constructor/factory producing an
instance — no `static` method whose output depends only on its parameters remains
(`coding-standard.md` §2).

Graduation: document — an architectural invariant checked at code-review time, not a runtime
behavior.

### UC-002-07 — Docs no longer assert the old architecture

Rests on `README.md` and `AGENTS.md`, both of which currently describe `server/src/domain/` as
free functions.

#### UC-002-07-S1 — `README.md` describes the class-based reality

Given `README.md`'s line _"La carpeta `domain/` no sabe nada de SQLite ni de HTTP: son funciones
puras con sus tests."_ (`verified — document`, `README.md` "Estructura")
When this WP concludes
Then that line is corrected to describe classes instead of free functions — the underlying
invariant it protects (no SQLite/HTTP coupling in the domain layer) still holds and is restated,
only "funciones puras" changes.

#### UC-002-07-S2 — `AGENTS.md` describes the class-based reality

Given `AGENTS.md` §Architecture's description of `server/src/domain/` as "pure functions" and its
§Coding standard's line "It supersedes the free-function style `server/src/domain/` and `repo.ts`
are written in today" (`verified — document`, `AGENTS.md`, this session)
When this WP concludes
Then both are corrected: the Architecture line describes classes, and the Coding standard line
drops "today" since the rewrite will have already happened.

Graduation: document.

## 3. Interface Examples

No code exists yet, so every shape below is `not yet run` — worked by hand from the current
free-function signatures. Design fixes the exact shapes; this is the inventory it must cover.

```ts
class PointsCalculator {
  compute(input: PointsInput): PointsBreakdown;
}
class SeniorityCurve {
  contribution(season: number): number;
  total(seasons: number): number;
}
class ConvocatoriaBuilder {
  build(
    signups: Contender[],
    history: History,
    rules: SeasonRules
  ): ConvocatoriaResult;
}
class SeasonRepository {
  create(input: NewSeasonInput): SeasonRow;
  update(id: number, patch: Partial<SeasonRow>): SeasonRow | undefined;
  // ...list/get/activate, one method per today's export
}
// PlayerRepository, GameRepository, ParticipationRepository, ExclusionRepository: same pattern —
// one method per today's corresponding free function, same arguments, same return shape.
class ConvocatoriaService {
  preview(gameId: number): ConvocatoriaResult & { game: GameRow };
  commit(gameId: number): ConvocatoriaResult & { game: GameRow };
}
class StandingsService {
  standings(seasonId: number, upToGameId?: number): Standing[];
}
```

## 4. File Locations

- `server/src/domain/points.ts`, `seniority.ts`, `convocatoria.ts`, `types.ts` — rewritten in
  place into classes.
- `server/src/domain/*.test.ts` — adapted to the new class call shapes, same assertions; may split
  from the single `domain.test.ts` into one file per class (Design's call).
- `server/src/repo.ts` — replaced by repository/service classes; may split into multiple files
  under `server/src/repo/` (Design's call) or stay one file — either way, no free function exported.
- `server/src/routes/api.ts` — every handler's `repo.*` call updated to the new class instances.
- `server/scripts/import-season.ts` — updated to the new repository classes' call shapes.
- `README.md`, `AGENTS.md` — corrected per UC-002-07.

## 5. Success Criteria

- UC-002-01/02/03: the existing `domain.test.ts` fixture values (points, seniority, convocatoria
  cases) reproduce to the same precision through the new classes, with no assertion changed beyond
  call syntax.
- UC-002-04: an integration test against a real temp-file SQLite DB confirms each repository
  method's SQL effect matches today's; `npm run seed -- --reset` still reproduces the 2024/2025
  season.
- UC-002-05: `npm test` and `npm run test:e2e` both pass unmodified in assertion after the
  refactor.
- UC-002-06: a review-time grep finds zero top-level exported functions/arrow-consts outside a
  class in `server/src`, and zero stateless `static` methods.
- UC-002-07: `README.md` and `AGENTS.md` no longer describe `server/src/domain/`/`repo.ts` as free
  functions.

## 6. Constraints

Copied from `VISION.md`, as they bind this work package's solution:

- No behavior/rule change to the selection algorithm, points formula, or seniority curve — same
  outcomes, different shape holding them (`VISION.md` §3).
- `web/src/**` is out of scope, governed by `.agents/rules/frontend-coding-standard.md` instead
  (`VISION.md` §3).
- The HTTP contract does not need to stay byte-for-byte identical; minor shape adjustments are
  acceptable where the class design genuinely calls for them (`VISION.md` §4, author decision).
- No hard technical wall on new dependencies; a lightweight addition (DI container, query builder)
  is allowed if a specific design genuinely benefits, but plain constructor injection is expected
  to be sufficient, and `better-sqlite3` stays the persistence library regardless (`VISION.md` §5).

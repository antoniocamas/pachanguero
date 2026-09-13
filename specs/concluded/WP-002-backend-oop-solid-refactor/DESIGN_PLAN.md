# Design — WP-002-backend-oop-solid-refactor

**Depth: medium.** A wrong class shape is caught by `npm test` in seconds (full existing behavioral
coverage), and nothing outside this codebase depends on the new shapes yet — reversibility is high,
feedback is fast. But every backend file is touched, so this isn't a one-pager either.

**Artifact types:** Code (class, module) — `server/src/domain/`, `server/src/repo/` (new),
`server/src/routes/api.ts`. System documentation (section) — `README.md`, `AGENTS.md` (UC-002-07
only).

**Output budget:** one HLD; LLD only for the elements with a real shape decision left (agreed with
the author alongside `design/agenda.md`). Drafted in one pass, all three increments, per the
author's request this session.

## 1. Current State Analysis

**`server/src/domain/points.ts`**: `computePoints` (lines 31-41) sums attendance/exclusions/
seniority; `exclusionScores` (21-23) is a pure predicate; `waitCounter` (52-67), `mercyCount`
(70-72), `demotionCount` (75-77) all take a raw `ExclusionKind[]` history array plus (for
`waitCounter`) `rules`, and are imported into `convocatoria.ts`, not used by `computePoints`
itself.

**`server/src/domain/seniority.ts`**: `seasonContribution` (14-17), `seniorityPoints` (20-27) —
two free functions, no state.

**`server/src/domain/convocatoria.ts`**: `buildConvocatoria` (34-93) is the only export;
`selectPromotees` (96-110) and `selectDemotees` (117-127) are private free-function helpers it
calls, each taking the already-ranked array plus `rules`.

**`server/src/repo.ts`** (491 lines, all exports free functions over the shared `db()` singleton
from `server/src/db/index.ts`): season CRUD (`createSeason`/`updateSeason`/`activateSeason`/
`listSeasons`/`getSeason`/`activeSeason`, `rulesOf`), player/enrollment (`addPlayer`/`listPlayers`/
`updateSeasonPlayer`), game CRUD (`createGame`/`updateGame`/`deleteGame`/`listGames`/`getGame`),
participation (`setParticipation`/`removeParticipation`/`listParticipations`), exclusion
(`setExclusion`/`historyFor`), scoring (`standings`), convocatoria (`previewConvocatoria`/
`commitConvocatoria`/`savedConvocatoria`).

**`server/src/routes/api.ts`** (113 lines): every handler calls exactly one `repo.*` export
directly (e.g. line 25 `repo.listSeasons()`, line 104 `repo.commitConvocatoria(...)`) — no handler
touches more than one repo function's worth of logic itself, which is what keeps this element cheap
(§12 Risks).

**`server/scripts/import-season.ts`**: calls `repo.listSeasons`, `repo.createSeason`,
`repo.addPlayer`, `repo.createGame`, plus `db()`/`tx()` directly (lines 20-21 import).

**LSP find-references, exhaustively**: every export above is called from exactly the files named
here — `routes/api.ts`, `import-season.ts`, and each module's own `.test.ts`. No other consumer
exists (`verified — source`, grep over `repo\.\w+\(` and each domain export name across
`server/src`).

## 2. Approach

Every free-function module becomes a class: the three domain modules become small classes with no
persistence dependency (`PointsCalculator`, `SeniorityCurve`, `ConvocatoriaBuilder`, plus a new
`ExclusionHistory` that turns the raw `ExclusionKind[]` array `waitCounter`/`mercyCount`/
`demotionCount` operate on into real instance state); `repo.ts` splits into one repository class per
aggregate, each constructed with the shared `Database.Database` handle; two service classes
(`ConvocatoriaService`, `StandingsService`) compose repositories and domain classes via constructor
injection; a small composition-root module builds one instance of each and `routes/api.ts` imports
that instead of `repo.js`.

This shape satisfies the standard directly: SRP (one class per aggregate/concept, instead of one
491-line file), DIP (services and the composition root depend on constructor-injected instances, not
module-level singletons reached for by import), and it removes every free function and stateless
static in one pass rather than leaving some behind to migrate later. Repository classes are typed
by their own public shape rather than a separately declared `interface` duplicating each method
signature — introducing parallel interfaces for a single real implementation is indirection this
codebase's size doesn't need (`VISION.md` §5: plain constructor injection is expected to be
sufficient).

**Alternative considered, not recorded further**: constructing a fresh repository instance per
request inside each route handler, instead of a shared composition-root singleton. Rejected because
it's cheap to change later either way (a `new` call vs. an import) and today's `db()` is already a
process-lifetime singleton (`server/src/db/index.ts`) — matching that existing pattern is the
lower-risk default, not a decision worth alternatives text at this depth.

## 3. Interface Specification

```ts
// server/src/domain/points.ts
class PointsCalculator {
  compute(input: PointsInput): PointsBreakdown;
}

// server/src/domain/seniority.ts
class SeniorityCurve {
  contribution(season: number): number;
  total(seasons: number): number;
}

// server/src/domain/exclusion-history.ts (new file)
class ExclusionHistory {
  constructor(private readonly kinds: ExclusionKind[]) {}
  waitCounter(
    rules: Pick<SeasonRules, 'gamesOutForMercy' | 'mercyResetsCounter'>
  ): number;
  mercyCount(): number;
  demotionCount(): number;
}

// server/src/domain/convocatoria.ts
class ConvocatoriaBuilder {
  build(
    signups: Contender[],
    history: Map<number, ExclusionHistory>,
    rules: SeasonRules
  ): ConvocatoriaResult;
}
```

```ts
// server/src/repo/season-repository.ts
class SeasonRepository {
  constructor(private readonly conn: Database.Database) {}
  list(): SeasonRow[];
  get(id: number): SeasonRow | undefined;
  active(): SeasonRow | undefined; // kept only as today's "most-recently-activated" query — UC-002-04 does not remove it, WP-001 does (out of this WP's scope)
  create(input: NewSeasonInput): SeasonRow;
  update(id: number, patch: Record<string, unknown>): SeasonRow | undefined;
  activate(id: number): void;
  rulesOf(season: SeasonRow): SeasonRules;
}
// PlayerRepository, GameRepository, ParticipationRepository: one method per today's
// corresponding free function (list/get/create/update/delete named per its verb), same
// arguments and return shape as today — no table here since none has a shape decision beyond
// that direct mapping (REQUIREMENTS.md §3 already gives it).

// server/src/repo/exclusion-repository.ts
class ExclusionRepository {
  constructor(private readonly conn: Database.Database) {}
  set(gameId: number, playerId: number, kind: ExclusionKind | null): void;
  historyFor(
    seasonId: number,
    upToGameId?: number
  ): Map<number, ExclusionHistory>; // wraps each player's raw kinds
}

// server/src/repo/convocatoria-service.ts
class ConvocatoriaService {
  constructor(
    private readonly games: GameRepository,
    private readonly participations: ParticipationRepository,
    private readonly exclusions: ExclusionRepository,
    private readonly standings: StandingsService,
    private readonly builder: ConvocatoriaBuilder
  ) {}
  preview(gameId: number): ConvocatoriaResult & { game: GameRow };
  commit(gameId: number): ConvocatoriaResult & { game: GameRow };
}

// server/src/repo/standings-service.ts
class StandingsService {
  constructor(
    private readonly players: PlayerRepository,
    private readonly participations: ParticipationRepository,
    private readonly exclusions: ExclusionRepository,
    private readonly seasons: SeasonRepository,
    private readonly points: PointsCalculator
  ) {}
  standings(seasonId: number, upToGameId?: number): Standing[];
}

// server/src/repo/index.ts (composition root)
export const seasons = new SeasonRepository(db());
export const players = new PlayerRepository(db());
// ...one instance per repository, then the services built from them:
export const standingsService = new StandingsService(
  players,
  participations,
  exclusions,
  seasons,
  new PointsCalculator()
);
export const convocatoriaService = new ConvocatoriaService(
  games,
  participations,
  exclusions,
  standingsService,
  new ConvocatoriaBuilder()
);
```

## 4. Data Contract Verification

No change to what is stored — `schema.sql` is untouched by this WP (`VISION.md` §3: same
outcomes, different shape holding them). Only what code writes/reads it changes shape. Traced per
element: each repository method must issue the identical SQL string (or an equivalent producing
the identical result set) as its corresponding `repo.ts` export today — checked mechanically by
the integration tests in §13, not re-derived here per method.

## 5. Impacted Units

| Unit                                                                                       | Type        | Location                                      | Action                               | Notes                           |
| ------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------- | ------------------------------------ | ------------------------------- |
| `PointsCalculator`                                                                         | class       | `server/src/domain/points.ts`                 | Modify (rewrite)                     | E1                              |
| `SeniorityCurve`                                                                           | class       | `server/src/domain/seniority.ts`              | Modify (rewrite)                     | E2                              |
| `ExclusionHistory`                                                                         | class       | `server/src/domain/exclusion-history.ts`      | Create                               | E3                              |
| `ConvocatoriaBuilder`                                                                      | class       | `server/src/domain/convocatoria.ts`           | Modify (rewrite)                     | E4                              |
| `SeasonRepository`                                                                         | class       | `server/src/repo/season-repository.ts`        | Create                               | E5                              |
| `PlayerRepository`                                                                         | class       | `server/src/repo/player-repository.ts`        | Create                               | E6                              |
| `GameRepository`                                                                           | class       | `server/src/repo/game-repository.ts`          | Create                               | E7                              |
| `ParticipationRepository`                                                                  | class       | `server/src/repo/participation-repository.ts` | Create                               | E8                              |
| `ExclusionRepository`                                                                      | class       | `server/src/repo/exclusion-repository.ts`     | Create                               | E9                              |
| `ConvocatoriaService`                                                                      | class       | `server/src/repo/convocatoria-service.ts`     | Create                               | E10                             |
| `StandingsService`                                                                         | class       | `server/src/repo/standings-service.ts`        | Create                               | E11                             |
| `server/src/repo/index.ts`                                                                 | module      | `server/src/repo/`                            | Create                               | E12, composition root           |
| `server/src/routes/api.ts`                                                                 | module      | `server/src/routes/`                          | Modify                               | E12, call sites                 |
| `server/scripts/import-season.ts`                                                          | module      | `server/scripts/`                             | Modify                               | E13                             |
| `points.test.ts`, `seniority.test.ts`, `convocatoria.test.ts`, `exclusion-history.test.ts` | test module | `server/src/domain/`                          | Create (split from `domain.test.ts`) | E1-E4                           |
| `*.test.ts` per repository/service                                                         | test module | `server/src/repo/`                            | Create                               | E5-E11, integration-level       |
| `server/src/repo.ts`                                                                       | module      | `server/src/`                                 | Delete                               | replaced by `server/src/repo/*` |
| `README.md` §Estructura                                                                    | doc section | `README.md`                                   | Modify                               | E14                             |
| `AGENTS.md` §Architecture, §Coding standard                                                | doc section | `AGENTS.md`                                   | Modify                               | E15                             |

## 6. Refactors

| #   | Refactor                                      | Component   | Units                            | Scenarios            | Status   | Verification                                                                           | Mandatory Reading |
| --- | --------------------------------------------- | ----------- | -------------------------------- | -------------------- | -------- | -------------------------------------------------------------------------------------- | ----------------- |
| E1  | `PointsCalculator`                            | Domain      | `PointsCalculator`               | UC-002-01-S1,S2,S3   | terminal | `points.test.ts` reproduces today's fixture rows to the same digit                     | this HLD §1-3     |
| E2  | `SeniorityCurve`                              | Domain      | `SeniorityCurve`                 | UC-002-02-S1,S2,S3   | terminal | `seniority.test.ts` reproduces the Aux table                                           | this HLD §1-3     |
| E3  | `ExclusionHistory`                            | Domain      | `ExclusionHistory`               | UC-002-03 (supports) | terminal | `exclusion-history.test.ts`: same wait/mercy/demotion counts as today's free functions | this HLD §1-3     |
| E4  | `ConvocatoriaBuilder`                         | Domain      | `ConvocatoriaBuilder`            | UC-002-03-S1,S2,S3   | terminal | `convocatoria.test.ts` reproduces today's cases                                        | this HLD §1-3     |
| E5  | `SeasonRepository`                            | Persistence | `SeasonRepository`               | UC-002-04-S1         | terminal | integration test, real temp-file DB                                                    | this HLD §1-4     |
| E6  | `PlayerRepository`                            | Persistence | `PlayerRepository`               | UC-002-04-S1         | terminal | integration test                                                                       | this HLD §1-4     |
| E7  | `GameRepository`                              | Persistence | `GameRepository`                 | UC-002-04-S1         | terminal | integration test                                                                       | this HLD §1-4     |
| E8  | `ParticipationRepository`                     | Persistence | `ParticipationRepository`        | UC-002-04-S1         | terminal | integration test                                                                       | this HLD §1-4     |
| E9  | `ExclusionRepository`                         | Persistence | `ExclusionRepository`            | UC-002-04-S1         | terminal | integration test                                                                       | this HLD §1-4     |
| E10 | `ConvocatoriaService`                         | Persistence | `ConvocatoriaService`            | UC-002-04-S2         | terminal | integration test: one transaction, same tables                                         | this HLD §1-4     |
| E11 | `StandingsService`                            | Persistence | `StandingsService`               | UC-002-04-S1         | terminal | integration test                                                                       | this HLD §1-4     |
| E12 | Composition root + `routes/api.ts` call sites | API         | `repo/index.ts`, `routes/api.ts` | UC-002-05-S1,S2      | terminal | `npm run test:e2e` unmodified                                                          | this HLD §1-3     |
| E13 | `import-season.ts` call sites                 | Tooling     | `scripts/import-season.ts`       | UC-002-04-S3         | terminal | `npm run seed -- --reset` reproduces 2024/2025                                         | this HLD §1       |
| E14 | `README.md` §Estructura                       | Docs        | `README.md`                      | UC-002-07-S1         | terminal | reviewer reads the corrected line                                                      | —                 |
| E15 | `AGENTS.md` §Architecture, §Coding standard   | Docs        | `AGENTS.md`                      | UC-002-07-S2         | terminal | reviewer reads the corrected lines                                                     | —                 |

UC-002-06 realizes no unit of its own — it's the review-time check run against E1-E13's result;
see §13 Test Methodology.

#### E1 — `PointsCalculator`

**Approach.** `compute(input)` is a straight method-ification of today's `computePoints` body — no
constructor state, since the calculation depends only on its argument. `exclusionScores` becomes a
private method (`private scores(kind: ExclusionKind): boolean`), since nothing outside `points.ts`
calls it directly today (`verified — source`, grep: only `convocatoria.ts` imports `demotionCount`/
`mercyCount`/`waitCounter`, never `exclusionScores`).

#### E2 — `SeniorityCurve`

**Approach.** `contribution`/`total` are direct method-ifications of `seasonContribution`/
`seniorityPoints`; no constructor state needed.

#### E3 — `ExclusionHistory`

**Approach.** Wraps the raw `ExclusionKind[]` array `waitCounter`/`mercyCount`/`demotionCount`
already take as their first argument today — turning that array into constructor state is what
makes these legitimate instance methods rather than the free functions they are now. `historyFor`
(E9) constructs one `ExclusionHistory` per player instead of returning the raw
`Map<number, ExclusionKind[]>` it does today; `ConvocatoriaBuilder` (E4) then calls
`.waitCounter(rules)`/`.mercyCount()`/`.demotionCount()` on each, replacing today's free-function
calls at `convocatoria.ts` lines 46-48.

#### E4 — `ConvocatoriaBuilder`

**Approach.** `build` takes `Map<number, ExclusionHistory>` instead of `History` (`Map<number,
ExclusionKind[]>`) — the one call-shape change this element makes, cited so E9 and E10 both build
against it consistently. `selectPromotees`/`selectDemotees` become private methods; no other
behavior changes (§6 table's Verification: existing test cases, moved).

#### E9 — `ExclusionRepository`

**Data Contract Verification.** `historyFor`'s SQL (today's `repo.ts` lines 306-328) is unchanged;
only the return shape changes, from `Map<number, ExclusionKind[]>` to `Map<number,
ExclusionHistory>` — each value wrapped once, at the query boundary, before returning. Every
consumer of `historyFor` (only `previewConvocatoria`/`commitConvocatoria`, both moving into E10) is
updated in the same increment, so no caller ever sees the old shape after this element lands.

#### E10 — `ConvocatoriaService`

**Approach.** `preview`/`commit` are direct method-ifications of `previewConvocatoria`/
`commitConvocatoria` (`repo.ts` lines 423-476), reading `signedUp` via `ParticipationRepository`,
`standings` via `StandingsService`, and building via `ConvocatoriaBuilder` — the same three
dependencies today's free functions reach for via direct imports/calls, now constructor-injected.

**Data Contract Verification.** `commit`'s transaction (today's `tx(() => {...})` block, `repo.ts`
lines 451-473: delete-then-insert into `convocatorias`/`convocatoria_entries`/`exclusions`, then
`setParticipation` per entry) is preserved exactly — same statements, same order, same single
`tx()` call, now issued from a method instead of a function.

#### E12 — Composition root + `routes/api.ts` call sites

**Approach.** One new file, `server/src/repo/index.ts`, builds one instance of every
repository/service (Interface Specification, §3) at module load — mirroring `server/src/db/
index.ts`'s existing singleton pattern (`verified — source`, `db()`'s lazy-singleton `instance`
variable). `routes/api.ts` imports named instances from this module (`import { seasons, players,
... } from '../repo/index.js'`) instead of `import * as repo from '../repo.js'`, and every handler
body changes from `repo.listSeasons()` to `seasons.list()` — a mechanical rename per handler, no
handler's control flow changes.

**Test Methodology.** Not unit-testable in isolation (it's wiring); verified by the full `npm test`

- `npm run test:e2e` suite passing, per UC-002-05-S2.

## 7. Patterns and Conventions

- **Repository pattern** (E5-E9): one class per aggregate root, encapsulating its SQL — the
  standard shape for isolating persistence from domain logic, and the direct fix for `repo.ts`
  being one 491-line file of unrelated queries today.
- **Service/composition** (E10, E11): a service class composes repositories via constructor
  injection rather than reaching for a global — Dependency Inversion in practice, not just in name.
- **Composition root** (E12): one place builds the object graph; everything else receives its
  dependencies already built. Standard for avoiding scattered `new Repository(db())` calls across
  route handlers.
- **Value-wrapping** (E3): turning a raw array parameter into constructor state is the mechanical
  pattern for converting a free function into a legitimate instance method, used here as the
  template for `ExclusionHistory` and citable if a similar case turns up in WP-001 later.

## 8. Unit Communication

```
routes/api.ts
   -> repo/index.ts (composition root: seasons, players, games, participations, exclusions,
                      standingsService, convocatoriaService)
        -> SeasonRepository / PlayerRepository / GameRepository / ParticipationRepository
             -> db() [server/src/db/index.ts, unchanged]
        -> ExclusionRepository -> db(), constructs ExclusionHistory per player
        -> StandingsService -> {PlayerRepository, ParticipationRepository, ExclusionRepository,
                                 SeasonRepository, PointsCalculator}
        -> ConvocatoriaService -> {GameRepository, ParticipationRepository, ExclusionRepository,
                                    StandingsService, ConvocatoriaBuilder}
```

Same call depth as today (`routes/api.ts` → `repo.ts` → `db()`, plus `repo.ts` → `domain/*.ts`
inside `standings`/`previewConvocatoria`) — only the number of named stops between them changes,
not the overall shape. See `design/diagrams/class-composition.puml`.

## 9. New Functionality

Pure refactoring — no element in this WP changes what the backend does, only the shape holding it
(`VISION.md` §3). See §6 Refactors for the full table; nothing appears twice.

## 10. Architecture

Components (extends WP-001's own vocabulary where it overlaps, since both work packages touch
`server/src`):

- **Domain** — `server/src/domain/` (E1-E4): pure calculation, no persistence.
- **Persistence** — `server/src/repo/` (E5-E11): repository/service classes, one file each.
- **API** — `server/src/routes/api.ts`, `server/src/repo/index.ts` (E12): HTTP handlers and the
  composition root wiring them to Persistence.
- **Tooling** — `server/scripts/import-season.ts` (E13): the seed script, a Persistence consumer
  outside the HTTP layer.
- **Docs** — `README.md`, `AGENTS.md` (E14, E15).

No change to the existing layering direction (`AGENTS.md` §Architecture: domain → db/repo →
routes) — Persistence still depends on Domain (via `StandingsService`/`ConvocatoriaService`), never
the reverse.

## 11. File Changes

**Modify:** `server/src/domain/points.ts`, `seniority.ts`, `convocatoria.ts`, `types.ts` (class
shapes replace function/interface-only exports where needed); `server/src/routes/api.ts`;
`server/scripts/import-season.ts`; `README.md`; `AGENTS.md`.

**Create:** `server/src/domain/exclusion-history.ts`; `server/src/repo/season-repository.ts`,
`player-repository.ts`, `game-repository.ts`, `participation-repository.ts`,
`exclusion-repository.ts`, `convocatoria-service.ts`, `standings-service.ts`, `index.ts`.

**Delete:** `server/src/repo.ts` (replaced by `server/src/repo/*`).

**Migrate:** none — no data shape changes (§4).

**Tests:** split `server/src/domain/domain.test.ts` into `points.test.ts`, `seniority.test.ts`,
`exclusion-history.test.ts`, `convocatoria.test.ts` (one per new class, same assertions, adapted
call syntax); new integration test files under `server/src/repo/` per repository/service, against
a real temp-file SQLite DB (`docs/test-strategy.md` §Integration).

**Docs:**

- `README.md` §Estructura — _"La carpeta `domain/` no sabe nada de SQLite ni de HTTP: son
  funciones puras con sus tests."_ stops being true; replaced with the same invariant restated for
  classes (E14).
- `AGENTS.md` §Architecture's `server/src/domain/` description, and §Coding standard's "It
  supersedes the free-function style ... written in today" line, both stop being true once this WP
  ships; corrected to describe the classes and drop "today" (E15).

## 12. Risks

- **A repository method's SQL silently drifts from today's during the rewrite.** Handled: the
  integration tests (§13) run the same fixture scenarios through the real DB and compare results,
  not just "does it run."
- **`routes/api.ts` handlers already call exactly one `repo.*` export each (§1)** — low risk of a
  multi-step handler getting tangled in the rename; each handler's edit is one-line-for-one-line.
- **Splitting `domain.test.ts` loses a cross-cutting assertion that spanned two describe-blocks.**
  Handled: read the whole file before splitting (already done, this session) — no assertion in it
  crosses `describe('seniority')`/`describe('points')`/(the convocatoria block) boundaries, so a
  clean split loses nothing.

## 13. Test Methodology

Per `docs/test-strategy.md`: E1-E4 are unit tests (Vitest, pure classes); E5-E12 are integration
tests (Vitest, real temp-file SQLite DB, never a mocked DB); E12 is additionally checked by the
existing E2E suite end-to-end. E14/E15 (docs) are checked by review reading, not a test run.

**Conformance review checklist (UC-002-06)**, run once every element above is terminal:

- Grep `server/src` for a top-level `export function` or `export const ... = (...) =>` outside a
  class body — zero results (UC-002-06-S1).
- Read every `static` method introduced by E1-E15 (there should be none needed — no element above
  calls for a named constructor/factory) and confirm none is stateless (UC-002-06-S2).

**Testability Assessment**

| #   | Element                       | Fully automatable?                            | Manual verification needed                                        |
| --- | ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| E1  | `PointsCalculator`            | Yes                                           | —                                                                 |
| E2  | `SeniorityCurve`              | Yes                                           | —                                                                 |
| E3  | `ExclusionHistory`            | Yes                                           | —                                                                 |
| E4  | `ConvocatoriaBuilder`         | Yes                                           | —                                                                 |
| E5  | `SeasonRepository`            | Yes                                           | —                                                                 |
| E6  | `PlayerRepository`            | Yes                                           | —                                                                 |
| E7  | `GameRepository`              | Yes                                           | —                                                                 |
| E8  | `ParticipationRepository`     | Yes                                           | —                                                                 |
| E9  | `ExclusionRepository`         | Yes                                           | —                                                                 |
| E10 | `ConvocatoriaService`         | Yes                                           | —                                                                 |
| E11 | `StandingsService`            | Yes                                           | —                                                                 |
| E12 | Composition root + call sites | Yes (via E2E)                                 | —                                                                 |
| E13 | `import-season.ts` call sites | Yes (`npm run seed -- --reset` is scriptable) | —                                                                 |
| E14 | `README.md`                   | No                                            | reviewer reads the corrected §Estructura line                     |
| E15 | `AGENTS.md`                   | No                                            | reviewer reads the corrected §Architecture/§Coding standard lines |

## 14. Diagrams

One diagram: the composition/dependency shape of §8, under
`design/diagrams/class-composition.puml`, linked from §8. Drawn via `skill: auctor-diagrams` on
completion.

## 15. Configuration

Not relevant for this development — no new configurable key, flag, or environment variable; this
WP changes internal structure only.

## 16. Deployment Design

Not relevant beyond the existing build/deploy path (`README.md` §"Despliegue en la Raspberry":
`npm ci && npm run build`, systemd restart) — no new environment variable, no schema/data
migration (§4, §11), no rollout-order dependency on WP-001 (WP-001 is paused, per this session's
sequencing decision).

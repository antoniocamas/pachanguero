# Coding Standard

**Mandatory reading before any design or coding work on `server/src`** — referenced from
`AGENTS.md`. Where this standard and existing code disagree, the standard wins; the code is what's
wrong (see "What this changes," below).

## Scope

Applies to `server/src/**` — domain, db, repo, routes: the whole backend.

**Does not apply to `web/src/**`.** React's component model is standard function components and
hooks (`useState`, `useEffect`, ...); hooks cannot be called from a class component at all, so an
OOP-only rule there would mean abandoning hooks and the framework's own idiomatic model, not
restyling it. `web/src` keeps its current function-component style as a named exception —
author decision.

## Paradigm: object-oriented, SOLID-mandatory

Backend logic is objects with behavior, not data threaded through free functions. Every module
organizes its logic as classes.

### 1. No free functions

- No exported top-level `function` declaration or `const fn = (...) => ...` outside a class,
  anywhere in `server/src`.
- Every operation lives as a method on the class that owns the data or behavior it concerns.
- Concretely, today's free functions become methods on classes: `computePoints` →
  `PointsCalculator.compute(...)`; `seniorityPoints`/`seasonContribution` → `SeniorityCurve`;
  `buildConvocatoria`/`selectPromotees`/`selectDemotees` → `ConvocatoriaBuilder`; `waitCounter`/
  `mercyCount`/`demotionCount` → methods on the class that holds a player's exclusion history
  (e.g. `ExclusionHistory`); the `matching.ts` module drafted in WP-001's Increment 0
  (`stripDecorations`, `matchName`) → a `NameMatcher` class.
- A pure calculation is still a method — on a class instantiated with (or constructed from) the
  data it operates over. "Pure" and "object-oriented" are not in tension; only "pure" and
  "free function" are being separated here.

### 2. No stateless static methods

- A `static` method that neither reads nor writes class-level state is a free function wearing a
  class as a namespace — banned equally.
- The only legitimate uses of `static` are named constructors/factories that produce an instance
  (`static fromRow(row: PlayerRow): Player`) and genuine class-level state (a registry, a counter).
  Both must actually reference the class they're declared on.
- If a method's output depends only on its parameters, it belongs on an instance of the class
  those parameters represent, not behind `static`.

### 3. SOLID, in this codebase's own terms

- **S — Single Responsibility.** One class, one reason to change. A `SeasonRepository`
  (persistence) is not a `Season` (the entity's own rules) is not a `SeasonRulesValidator`.
- **O — Open/Closed.** New behavior extends via a new class or a composed strategy, not another
  branch inside an existing method. Example: the regulars-vs-guests arrival-order rule
  (UC-001-03-S6) is a second `SelectionStrategy` implementation alongside the existing
  points-based one, not an `if` added inside one method that does both.
- **L — Liskov Substitution.** A subclass must be usable anywhere its base type or interface is
  expected, with no strengthened precondition and no weakened guarantee.
- **I — Interface Segregation.** Narrow, role-shaped interfaces over one large interface a class
  is forced to partially implement.
- **D — Dependency Inversion.** Domain classes depend on interfaces (`PlayerRepository`), never on
  `better-sqlite3` directly; SQL lives behind an interface the domain layer is constructed with.

## What this changes about the existing codebase

- `server/src/domain/points.ts`, `seniority.ts`, `convocatoria.ts`, `types.ts` and their tests are
  free-function modules today and do not conform. They are rewritten under this standard.
- `server/src/repo.ts` is currently one file of exported free functions issuing SQL directly; it is
  restructured into repository classes per aggregate (`SeasonRepository`, `PlayerRepository`,
  `GameRepository`, ...), each behind a narrow interface the domain layer depends on (DIP).
- `server/src/routes/api.ts` handlers stay thin, per the existing `route()` wrapper convention, but
  call into classes rather than into `repo.ts` free functions.
- `web/src/**` is unaffected (Scope, above).

## Enforcement

No ESLint rule enforces this automatically — there is no core "no free function" or "no stateless
static" rule, and none is configured yet. Until a custom rule exists, this is enforced by design
review and code review, per `AGENTS.md`'s existing rule that no lint rule may be downgraded or
skipped without asking first: the same standard applies here — a violation found in review is
fixed, not waived, without asking.

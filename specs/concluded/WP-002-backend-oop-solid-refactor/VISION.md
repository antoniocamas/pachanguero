# Vision — WP-002-backend-oop-solid-refactor

## 1. Problem Statement

`server/src/domain/*.ts` and `server/src/repo.ts` are written as free functions operating on plain
data, which violates `.agents/rules/coding-standard.md` (OOP/SOLID, no free functions, no stateless
`static` methods) now that it exists. Every work package touching `server/src` — starting with
WP-001 — either has to write non-conforming code to match today's style or fight an inconsistent
codebase mid-feature.

## 2. Key Stakeholder or User Needs

The author, as the only developer on this codebase today (and for the foreseeable future),
maintaining it under a standard they just set. No end-user-facing need — this is purely a
maintainability/consistency fix for whoever writes `server/src` code next, which right now is only
the author (via WP-001 and beyond).

## 3. Scope

In scope: `server/src/domain/points.ts`, `seniority.ts`, `convocatoria.ts`, `types.ts`, their tests,
and `server/src/repo.ts`, rewritten into classes per `.agents/rules/coding-standard.md`, plus the
`routes/api.ts` call sites that construct/invoke them.

Out of scope: `web/src/**` (governed by `.agents/rules/frontend-coding-standard.md` instead, not
this standard). No behavior/rule change to the selection algorithm, points formula, or seniority
curve — same outcomes, different shape holding them. WP-001's own new code (schema, matching
module, new endpoints) is not touched here; WP-001 conforms to the standard on its own once this WP
unblocks it.

## 4. Quality Ranges

The HTTP contract (`routes/api.ts` endpoints, request/response JSON shapes) does not need to stay
byte-for-byte identical — minor shape adjustments are acceptable where the new class design
genuinely calls for them (author decision, this phase). What must hold: every existing domain rule
(points formula, seniority curve, convocatoria selection/mercy/demotion logic) produces the same
outcomes for the same inputs — verified by the existing test suite's _assertions_ surviving, adapted
to the new call shapes, not rewritten to check something looser.

## 5. Constraints

No hard technical wall. The author is open to a new lightweight dependency (e.g. a DI container or
a query builder) if a specific class design genuinely benefits from one (author decision, this
phase) — not a requirement, and not to be reached for by default. Plain constructor-injected
dependencies (an interface passed into a constructor) are expected to be sufficient for this
codebase's size; `better-sqlite3` stays the persistence library regardless — no ORM swap intended
unless Design finds a concrete reason.

## 6. Assumptions and Dependencies

- WP-001 is blocked on this landing for any new `server/src` code it writes — `verified` (the
  author's own sequencing decision, this session).
- No production data beyond the CSV-reproducible seed exists yet — `verified` (confirmed this
  session, WP-001). Relevant here because it means test fixtures/behavior parity can be checked
  purely through the existing automated test suite, with no live-data migration risk to also
  verify.

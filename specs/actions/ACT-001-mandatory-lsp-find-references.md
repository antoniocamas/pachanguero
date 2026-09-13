# ACT-001: Make LSP find-references mandatory, not prose guidance, especially for refactors

**Status:** open
**Raised:** 2026-09-13
**Origin:** WP-002-backend-oop-solid-refactor, RETROSPECTIVE.md R-001
**Target:** `auctor-design` skill (Current State Analysis / Interface Specification sections), and
`auctor-task-implementation` wherever it performs an equivalent consumer/dependency check

## Action

Make LSP find-references a mandatory, explicit, checkable step for locating every consumer of a
symbol before changing it — not prose guidance that can be silently satisfied by a grep/text-search
substitute. Call out explicitly that this is required for refactor-shaped work (porting or
reshaping existing logic into new interfaces or classes), since that is exactly where a method's
full dependency surface must be known before its new signature is fixed.

## Root cause

A design-phase rule that exists only as prose inside a larger section is easy to satisfy with a
weaker substitute (grep) that produces superficially similar output — a list of references —
without the semantic depth (what each reference's body actually touches) the rule was written to
guarantee.

## What it cost

Three separate constructor-dependency omissions (`StandingsService` once; `ConvocatoriaService`
twice — missing `conn`/transaction access, and the missing `saved()` method) plus one call-site
undercount (`import-season.ts` missing 5 of its 9 `repo.*` calls), each requiring task-file
guideline rewrites and implementation rework within the same task, recurring across three
different tasks (01, 03, 04) in this work package.

## Resolution

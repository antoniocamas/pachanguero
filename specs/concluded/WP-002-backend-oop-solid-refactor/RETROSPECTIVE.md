# Retrospective — WP-002-backend-oop-solid-refactor

## What Worked

## What Didn't Work

- R-001: 2026-09-13: [architecture] `DESIGN_PLAN.md`'s Interface Specification sketches for the
  repository/service classes repeatedly omitted real constructor dependencies. Task 01 needed
  temporary shims (`computePoints`/`buildConvocatoria`) the design never anticipated, because it
  didn't trace that `repo.ts` — untouched until task 05 — would still call the free functions the
  design's own element rows removed. Task 03 then found three more instances in one task:
  `StandingsService`'s sketched constructor (`players, participations, exclusions, seasons,
points`) couldn't run `standings`'s own join queries against tables no single repository method
  covers, and `participations` turned out unused once queried directly; `ConvocatoriaService`'s
  sketched constructor (`games, participations, exclusions, standings, builder`) couldn't touch the
  `convocatorias`/`convocatoria_entries` tables or wrap `commit`'s transaction, and needed
  `SeasonRepository` for `rulesOf` rather than re-deriving that mapping; and `saved(gameId)` was
  listed in `REQUIREMENTS.md` §3's own mapping table as moving to `ConvocatoriaService` but never
  appeared in the design's interface sketch at all. Cost: task-file guideline rewrites plus
  implementation rework within the same task, three times in task 03 alone, after a first instance
  in task 01 — a recurrence across tasks, not a one-off caught-and-fixed loop. Recurred a third time
  in task 04: its guideline for `scripts/import-season.ts` named only 4 of the script's actual 9
  distinct `repo.*` calls (missing `setParticipation`, `setExclusion`, `activateSeason`,
  `standings`, `listGames`), and didn't anticipate the script's own local `games` variable
  colliding with the composition root's exported `games` repository instance.

## Root Cause Analysis

### R-001: Design sketched constructors from the scenario list, not from tracing each ported method's body — and the mandatory LSP consumer-check was silently done with grep instead

**5 Whys:**

1. Why did the interface sketches omit real dependencies? They were derived from each class's
   scenario/unit list (what it needed to realize), not from tracing every table/collaborator the
   actual ported method body touches.
2. Why wasn't each method traced fully during design? The mapping table
   (`REQUIREMENTS.md` §3's "today's export → new home," each row already citing file:line) was
   treated as sufficient grounding for the interface shape on its own.
3. Why was that treated as sufficient? The "locate every consumer" check the design phase actually
   ran was done with `grep`, which confirms _that_ a symbol is referenced but doesn't put the
   reader inside the reference the way semantic navigation does.
4. Why grep instead of LSP? The LSP tool was never invoked this session, despite
   `auctor-design`'s own Current State Analysis section instructing, in prose: "Before changing a
   symbol used in more than one place, use LSP find-references to locate every consumer."
5. **Root cause:** the rule existed but was phrased as guidance inside a paragraph rather than a
   checklist step the agent must act on, so it was satisfied with a text-search substitute that
   answers "is this used elsewhere" without surfacing "what does that usage actually need" — the
   exact gap that let three separate constructor-dependency omissions (`StandingsService`,
   `ConvocatoriaService` twice) and one call-site undercount (`import-season.ts`) through design
   and into implementation, across three different tasks.

**Root Cause:** A design-phase rule that only exists as prose inside a larger section is easy to
satisfy with a weaker substitute (grep) that produces superficially similar output (a list of
references) without the semantic depth (what each reference's body actually touches) the rule was
written to guarantee. This generalizes beyond this WP: any refactor-shaped design or task that
needs to trace a symbol's full consumer surface is exposed to the same substitution unless the
tool use itself, not just the intent, is made a mandatory, checkable step.

**Solution Type:** Fix Existing Skill (`auctor-design`, and `auctor-task-implementation` wherever it
performs the same kind of consumer/dependency check)

**Action Items:**

- [ ] Strengthen `auctor-design`'s Current State Analysis and Interface Specification guidance so
      that using the LSP tool for find-references (not grep, not a manual read) is a mandatory,
      explicit step — worded so it cannot be silently satisfied by a text-search substitute —
      specifically flagged as required for any refactor-shaped work (porting/reshaping existing
      logic into new interfaces), since that is exactly where a method's full dependency surface
      must be known before its new signature is fixed.

## Action Items Summary

| Id    | Action                                                                                                                  | Type           | Status  | Where it landed                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | -------------- | ------- | -------------------------------------------------- |
| R-001 | Make LSP find-references mandatory (not grep) in `auctor-design`'s consumer/dependency checks, especially for refactors | Process Change | pending | `actions/ACT-001-mandatory-lsp-find-references.md` |

# Anatomy — WP-001-season-player-match-lifecycle

**Status: approved**

## Sizing test

Element inventory (design `DESIGN_PLAN.md` §2.6-2.7): 11 elements, all `terminal` — zero deferred.
No two elements share a genuine verification-entangling bond (see correction below), so the task
count equals the element count: **11**, plus one closing regression task once the whole iteration
lands = **12**. That is within the 10-15 band, so no split is proposed — **one iteration**.

**Correction 1 (post-approval-draft check):** the first draft of this anatomy bonded R1 with F1 on
their shared UC-001-01 ancestor. That violates the Type rule — "Type bounds every bond: elements
bond into a task only within the same task-type" — since R1 is a Refactor and F1 is a Feature. They
are separate, adjacent tasks (01 then 02); the design's own note about a deployable gap between them
is satisfied by task **order**, not by merging.

**Correction 2 (found while sequencing the tasks, before any was written):** the first draft also
bonded F5 with F6 on their shared UC-001-03 ancestor. That bond does not survive contact with the
actual dependency graph: F6's `resolve()` calls directly into F7's `PlayerRegistrar`, which itself
is built on F5's `NameMatcher`/`AliasRepository` (`DESIGN_PLAN.md` §3/F7 Approach, step 1). Bundling
F5 into F6's task would force F7 — which must exist before F6 can be finished — to be built against
an F5 that only exists inside a task not yet done, a circular order. F5's own scenarios
(UC-001-03-S7/S8, UC-001-09-S1..S3) are fully verifiable alone, with no F6 fixture needed
(`DESIGN_PLAN.md` §3/F5 Test Methodology is entirely self-contained) — so sharing a UC ancestor with
F6 was not, on inspection, a real entangling bond (T2 holds for F5 alone). F5 is now its own task,
ordered before F7 and F6.

No boundary is put to the cancellation test because none is proposed: every element belongs to one
connected rebuild (season lifecycle → roster → game-day resolution → candidate/final-list paste →
selection), and the real dependencies found below (F4 on F3; F7 on F5; F6 on F5, F7 and F3; F8 on F6;
F9 on F5, F7, F4 and F8's write-path removal; F10 on F1 and F9) are task-ordering concerns inside a
single iteration, not seams a delivery split could exploit — none of them ships independent value the
rest of the design could be cancelled around.

## Iteration 1 — Season, roster, schedule and paste/resolution rebuild

**Elements:** R1, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10 — every element in the design's inventory.
**Deferred:** none — every row is `terminal`.
**Bonds:** none — every task below is a single element; see Correction 1/2 above for the two bonds
the first draft proposed and why neither survived.
**Order** (invalidating-first, dependency-respecting):

1. R1 — drop `seasons.is_active`/`season_players.active` (nothing downstream can be built on the
   season-gating columns while they still exist)
2. F1 — current season derived from the calendar (same UC-001-01 ancestor as R1, different task-type
   so not bonded into its task; ordered immediately after it so no deployable gap opens between
   removing `.activate()`/`.active()` and shipping `current()`)
3. F2 — seniority capture on first appearance (independent of the schedule/paste work; ordered early
   since `PlayerRepository.add()`'s conflict-clause fix is itself a bug fix other elements should
   build on, not compete with)
4. F5 — name/alias matching with decoration stripping (needed by both F7 and F6, next; verifiable
   fully in isolation per Correction 2 above)
5. F3 — weekly schedule + game-day auto-resolution (needed before F4 and F6, which both consume its
   `ScheduleResolver`/`GameDayResolutionService`)
6. F4 — final-list target auto-resolution (depends on F3's `ScheduleResolver.cutoffFor`, already
   built; adds no change to that class, only a new consumer — task order, not a bond)
7. F7 — inline new-player registration (`PlayerRegistrar` composes F5's `NameMatcher`/
   `AliasRepository`; must land before F6, which calls into it for the `register` resolve action)
8. F6 — candidate list paste & resolution (composes F5's `NameMatcher`, F7's `PlayerRegistrar`, and
   F3's `GameDayResolutionService` — the first element to wire all three together)
9. F8 — convocatoria commit decoupled from attendance, guest-aware (reuses F6's `GuestSlotAllocator`
   and `GuestCandidateRepository`, unmodified; task order, not a bond)
10. F9 — final list paste & resolution (needs F5's `NameMatcher`, F7's `PlayerRegistrar` (shared, not
    duplicated), F4's `FinalListTargetResolver`, and reconciles against exclusions F8's own
    `ConvocatoriaService.commit` writes)
11. F10 — historical backfill (needs F1's `SeasonRepository.current(asOf)` and explicitly reuses F9's
    `FinalListResolutionService`, not a duplicate)

**Why one cut:** no element here has standalone delivery value independent of the others — the
whole point (per `VISION.md`) is that the Organizer can run a full Wednesday cycle end to end
(season → roster → schedule → candidate paste → convocatoria → final list) only once every element
lands. Splitting anywhere would leave a genuinely half-usable system with no way to close out a
Wednesday, which is not a real deliverable boundary.

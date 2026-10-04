# Retrospective — WP-001-season-player-match-lifecycle

## What Worked

## What Didn't Work

- R-001: 2026-09-27: [process] Drafting increment 7 (F9, F10), the agent marked both agenda rows
  `settled`, then immediately finished the top-level Documentation Impact section, amended the HLD
  in place, and deleted `design/agenda.md` — all before presenting F9/F10 to the author for the
  increment's own gate. This conflated the per-increment gate ("present that increment's Low Level
  Design subsections to the author before the next one starts") with the separate, later
  phase-closing steps ("once every row is settled, finish Documentation Impact... and delete
  agenda.md"), which only apply once every increment has already cleared its own gate. Cost: the
  author had to stop and question the ordering after the fact, and the agenda-tracking file had to
  be reasoned about as recoverable (via git) rather than never having been prematurely removed.
- R-002: 2026-10-04: [testing] Task 01 removed `SeasonRepository.activate()` after a grep of
  `server/src`, `web/src` and `e2e`, but `server/scripts/import-season.ts` still called it. Scripts
  are neither type-checked nor tested, so the break stayed silent until task 02 ran the import.
  Cost: task 02 had to fix a leftover from task 01, and the committed task 01 shipped a broken
  seed script.
- R-003: 2026-10-04: [testing] Task 01 deleted `POST /seasons/:id/activate` and task 02 the
  `is_active` flag, but `web/src/App.tsx` and `pages/Manage.tsx` still called
  `api.activateSeason`, so creating a season failed with a 404 in the browser, and the existing
  E2E spec had been failing since task 01. Neither task's checks run the browser; it surfaced in
  task 08, whose E2E run was the first to exercise the UI after the removal. Same cause as R-002
  (callers outside `server/src` not searched), recurring in a different task. Cost: task 08 had to
  repair the season selector in the web app before its own E2E spec could pass.

## Action Items Summary

| Id    | Action                                                                                                                                                                                                | Type           | Status | Where it landed                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| R-001 | Never mark an agenda/anatomy row (or any element's status) `settled` without the author's explicit approval of that specific row first — approval is a distinct step from having finished drafting it | Process Change | done   | author's standing instruction, this entry; carried forward as agent behavior beyond this work package |

# Task 10 — The test strategy as a decision tree

## Type

**Feature.** Iteration 1. Elements absorbed: **F16**. Depends on: tasks 04 and 06 (the tiers they create).

## Mandatory Reading

- `DESIGN_PLAN.md`: 2.10, section 3 `#### F16`, and section 4 `#### docs/test-strategy.md` (the content, written in full).
- `docs/test-strategy.md`; `ai-kit/skills/pachanguero-release/SKILL.md`.
- Load `skill: ai-docs-editor` before editing either file.

## Description

Rewrite `docs/test-strategy.md` as section 4 of the design describes:

- the axes and the decision tree;
- the table of tiers with time and gate;
- the limits;
- the guided sandbox checklist;
- the worked Bizum examples;
- the rule of thumb's new ending.

Add one step to the release skill: before a release that touches the bank feed, run `npm run test:sandbox` if the standing session is configured, and the guided checklist.

## Guidelines

1. Measure each figure on the day, and write it with the command that reproduces it and the date: `time npm test`; `time npm run test:e2e` and the test count; the sandbox suite's time if configured, else "not measured".
2. Keep the existing per-layer sections, each with a "Time" and a "Gate" line.
3. Name no identifier of this work package in either file.

## Tests

Not automatable (documents). Read the result against section 4 of the design: every tier has a trigger, a time budget, a gate and a limit; the tree reaches every tier; each figure has its command and date. `npm run format:check` passes.

## Definition of Done

- [x] `docs/test-strategy.md` holds all seven parts of section 4, with figures measured on the day of the task.
- [x] The release skill's "Steps" has the new step; the skill passes `ai-docs-editor`'s review.
- [x] No work-package identifier appears in either file (`grep -n "WP-006\|UC-006" docs/test-strategy.md ai-kit/skills/pachanguero-release/SKILL.md` prints nothing).
- [x] **Graduation:** the requirements' success criteria (how each is tested) → `document`, in `docs/test-strategy.md`.
- [x] **Hard requirements:** none.
- [x] **Documentation:** this task is the documentation change.
- [x] **Tests / Regression:** none apply: no executable change. `npm run format:check` passes.
- [x] **Code checks:** `npm run format:check`.

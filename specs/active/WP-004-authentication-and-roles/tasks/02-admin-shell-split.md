# Task 02 — The admin app becomes one of two shells

## Type

**Refactor.** Iteration 1. Elements absorbed: **R2**. Depends on: nothing (independent of task 01).

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/frontend-coding-standard.md`
- `docs/test-strategy.md`
- `DESIGN_PLAN.md` §3, subsection `R2 — The admin app becomes one of two shells`
- `REQUIREMENTS.md` UC-004-03-S7
- Discover, via the project's own documentation-routing rule, any guideline covering `web/src/`.

## Description

`App.tsx` today is the admin app: three tabs and a refetch-everything cycle. Move that into
`pages/AdminShell.tsx` unchanged in behaviour, and leave `App.tsx` as a thin root that renders the
shell. Later tasks add the login screen and the player's own shell beside it; this task only makes the
room. Nothing changes on screen.

## Guidelines

1. Read the R2 subsection; it states what moves and what the root keeps. Do not alter any component,
   hook or style while moving.
2. Move, then run the existing suites before touching anything else; a diff of the rendered admin
   screens must be empty.
3. Follow the frontend coding standard (function components, hooks, `lib/` for pure code).

## Tests

Testability: fully automatable (HLD 2.10, R2 row). No new test file: the existing `web/src/lib/` suites
and the two existing E2E specs are the verification that the admin tabs are identical.

- `npm test` (web and server workspaces) green, unchanged.
- `npm run test:e2e` green, with the two specs unchanged (guard not yet present at this point).

## Definition of Done

- [ ] `pages/AdminShell.tsx` holds the former `App.tsx` behaviour; `App.tsx` renders it
      (`npm run build` compiles both workspaces).
- [ ] The existing E2E specs run unmodified and pass (`npm run test:e2e`).
- [ ] **Graduation:** UC-004-03-S7 is a hard requirement → the two existing E2E specs staying green,
      and the shell tests added by task 03 (login, guard); recorded here as carried by those specs.
- [ ] **Hard requirements:** no new test is added by this task; the carrier is the unchanged E2E
      specs named above, and this line is the record.
- [ ] **Documentation:** none made untrue by the move alone (the `AGENTS.md` description of `App.tsx`
      is changed by task 03, when the root first chooses between shells).
- [ ] **Tests:** `npm test` and `npm run test:e2e`.
- [ ] **Regression:** the two commands above are the regression for this task.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

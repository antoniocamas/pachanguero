# Task 07 — The team paste records only team

## Type

**Feature.** Iteration 1. Elements absorbed: **F7**. Depends on task 03.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `F7 — The team paste records only team`
- `docs/domain-model/ciclo-del-partido.md` §1
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Teams become a resource (`GET`/`PUT /games/:id/teams`, the paste a sub-resource); the paste writes only `team`, keeps unresolved lines as text, and is refused before the game is played. `FinalListParser` is renamed `TeamListParser`.

## Guidelines

1. Follow F7: `TeamAssignmentService`, `TeamPasteService`, `ParticipationRepository.clearTeams`, the route list, the `X +1` rule.
2. The old final-list routes and services stay until task 09.

## Tests

- `team-list-parser.test.ts` (domain unit), `team-paste-service.test.ts` (integration): S1…S5.
- `api.test.ts` (route): a paste changes only `team`; refusal "Marca el partido como jugado antes de pegar los equipos".

## Definition of Done

- [x] A paste leaves `played`, `paid_cents` and `signed_up` untouched (asserted).
- [x] **Graduation:** UC-003-07-S1…S5, `throwaway` (author: "I don't care, this is just to have something in the database"); the tests stay as ordinary regression tests.
- [x] **Hard requirements:** none — the scenario is `throwaway`.
- [x] **Documentation:** `docs/domain-model/glossary.md` — _Claros y Oscuros_ head the team-recording step, not "la lista final". `docs/domain-model/ciclo-del-partido.md` — the optional team step.
- [x] **Tests:** `npm test`.
- [x] **Regression:** `npm test` passes in full.
- [x] **Code checks:** `npm run lint` and `npm run format:check`; the code follows `.agents/rules/coding-standard.md`.

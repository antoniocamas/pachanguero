# Task 04 — The stored convocatoria: create, confirm, correct by hand, history

## Type

**Feature.** Iteration 1. Elements absorbed: **F3, F4, F8**. Depends on task 03.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsections `F3`, `F4` and `F8`
- `docs/domain-model/convocatoria.md`
- `study/convocatoria-and-exclusions.md`, `study/blind-spot.md`
- `docs/test-strategy.md`
- Discover, through the project's own documentation-routing rule, the guidelines covering the specific files you touch.

## Description

Creating the convocatoria stores it; confirming stamps it; recreating recomputes and warns only when hand corrections exist; members move in and out by hand within the apuntados and the cap; and every seeded played game gets a confirmed convocatoria (`source = 'history'`). `ConvocatoriaService.commit` is removed and `store(gameId, source)` is split out of `create`.

## Guidelines

1. F3 first: `GuestOrdinals`, `ConvocatoriaRepository.confirm`/`replace(…, source)`, the two routes. Confirm stamps and never recomputes.
2. F4: `ConvocatoriaEditService`, `PUT /games/:id/convocatoria/members` with body `{ member, playing }`, `CandidateResolutionService.save` calling `align`. Task 03 added a guard in the same `save`; F4 orders the checks around it, so edit that block once, keeping the guard's behaviour.
3. F8 last: `ConvocatoriaHistoryConverter`, called from `import-season.ts`; the seed prints a report and rolls back on any throw. Verify the design's one `assumed` — standings can be read as of a game (`upToGameId`).
4. Only `convocatoria_entries.playing` changes by hand; never `outcome`, `points`, `wait_counter`, `position`, `rules_json`.

## Tests

- `guest-ordinals.test.ts` (domain unit); `convocatoria-edit-service.test.ts` (integration, both states, subset rule, cap on the 15th, hand marks from `playing` ≠ `outcome`).
- `convocatoria-service.test.ts` and `candidate-list-requirements.test.ts` (integration): 12, 14, 16 apuntados; confirm stamps; recreate with and without hand corrections; `candidate-resolution-service.test.ts`: align on a sign-up change.
- `convocatoria-history-converter.test.ts` (temporary database): none above 14, history columns and standings identical before and after, a second run changes nothing, failure rolls back.
- `api.test.ts` (route): create, confirm, members, participation routes, S8 of UC-003-09.

## Definition of Done

- [ ] `ConvocatoriaService.commit` no longer exists (find-references).
- [ ] `npm run seed -- --reset` on a temporary database prints the conversion report with no game above 14.
- [ ] **Graduation:** UC-003-03-S1…S4 and UC-003-04-S1…S7, hard requirement → the tests above (the drag gesture of UC-003-04-S1 is task 08); UC-003-09-S1…S5, S8 hard requirement → converter and route tests; UC-003-09-S6 `document` → the report text in the seed output, described in `docs/domain-model/ciclo-del-partido.md`.
- [ ] **Hard requirements:** each such test is titled with the scenario identifier; no other marking convention exists.
- [ ] **Documentation:** `docs/domain-model/convocatoria.md` — the note "quién jugó y quién pagó lo fija la lista final" is replaced; hand corrections (`cambiado a mano`) and anonymous plus-ones as entries are added. `AGENTS.md` — the "Convocatorias are frozen" invariant: stored when created, stamped when confirmed, hand corrections change only `playing`. `docs/domain-model/ciclo-del-partido.md` — the convocatoria created, corrected, confirmed, and the history conversion. `docs/domain-model/glossary.md` — _cambiado a mano_.
- [ ] **Tests:** `npm test`.
- [ ] **Regression:** `npm test` passes in full.
- [ ] **Code checks:** `npm run lint` and `npm run format:check`; the code follows `.agents/rules/coding-standard.md`.

# The game screen today and what depends on it (Q-07)

Searched: `web/src/pages/GameDay.tsx`, `web/src/components/*`, `web/src/hooks/*`, `e2e/tests/season-and-player.spec.ts`.

## Contents of the Partido tab (one page, one scroll)

1. **Partido card:** register a game by date, game dropdown, delete button, four counters (apuntados, plazas, pagados, deuda).
2. **Lista de apuntados** (`CandidatePaste`): editable draft, "Añadir a la lista", "Guardar lista", "Vaciar lista", matched and unresolved lines.
3. **Lista final** (`FinalListPaste`): team paste, matched by team, seniority prompts, unresolved lines.
4. **Jugadores:** one row per roster player, chips `apunta` and `jugó → debe → pagó`, tags (mercy, fuera, debe).
5. **Convocatoria:** "Simular", "Confirmar", ranked list.

`GameDay.tsx` still holds the fetch, the money maths and four sections in one component (the frontend coding standard names it for a split). No element shows the game's state or the next action.

## Dependencies

- The Jugadores chips call `PUT /games/:id/players/:id` directly, so **payment can already be recorded by hand today**, independently of any paste.
- E2E specs touching this screen: nine in one file. Those that rely on the final-list paste: "a final list retracts the exclusion of a player who did play", "records a past game in the season its date belongs to". The rest use the candidate list, seniority and deletion.
- `RecordPastGame`, `DeleteGame`, `pickDefaultGame` and the missing-season prompt are recent additions to the same page.

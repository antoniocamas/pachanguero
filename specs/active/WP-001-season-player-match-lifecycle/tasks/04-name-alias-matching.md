# Task 04 — Name/alias matching with decoration stripping

## Type

**Feature.** Iteration 1. Elements absorbed: **F5**. No hard dependency on tasks 01-03; ordered
fourth because tasks 07 (`PlayerRegistrar`) and 08 (candidate paste) both compose this element's
`NameMatcher`/`AliasRepository` directly and must not start before it lands.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsection `F5 — Name/alias matching with decoration stripping`
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/domain/`, `server/src/repo/`, and `server/src/routes/`.

## Description

Add a new `player_aliases` table, a pure `NameMatcher` domain class (decoration-stripping + matched/
ambiguous/unresolved matching), an `AliasRepository`, `PlayerRepository.listAll()` (the ungated
equivalent of the season-scoped `list()`), and the alias-linking endpoint.

## Guidelines

1. In `server/src/db/schema.sql`: add `CREATE TABLE player_aliases (player_id INTEGER NOT NULL
REFERENCES players(id), alias TEXT NOT NULL, PRIMARY KEY (player_id, alias))` — no global
   `UNIQUE(alias)`.
2. Create `server/src/domain/name-matcher.ts`: class `NameMatcher(players, aliases)` with:
   - `strip(raw: string): string` — three ordered passes: (1) drop a leading list-marker
     (`/^\s*(?:\d+[.)]?|[•\-*])\s*/`); (2) drop emoji via a Unicode-block regex
     (`/[\u{1F300}-\u{1FAFF}\u{2600}-➿\u{FE0F}]/gu`); (3) collapse internal whitespace runs to a
     single space and trim. Order matters — list-marker pass before whitespace collapsing.
   - `match(raw: string)` — strips `raw`, compares (`a.localeCompare(b, 'es', { sensitivity: 'base'
})`) against every canonical name and alias. Returns `{ outcome: 'matched', playerId }` on
     exactly one hit, `{ outcome: 'ambiguous', playerIds }` on more than one, `{ outcome:
'unresolved' }` on zero.
3. In `server/src/repo/player-repository.ts`: add `listAll(): { id, name }[]` (ungated, no season
   join).
4. Create `server/src/repo/alias-repository.ts`: class `AliasRepository` with `listAll(): {
playerId, alias }[]` and `add(playerId, alias): void` (`INSERT OR IGNORE`).
5. In `server/src/routes/api.ts`: add `POST /players/:playerId/aliases` — body `{ alias: string }`.

## Tests

Testability Assessment: F5 = Yes, fully automatable.

- `server/src/domain/name-matcher.test.ts` (vitest, unit, **new**):
  - Decoration stripping: `"5 Álvaro R ⚽"` → `"Álvaro R"`; `"• Pablo"` → `"Pablo"`;
    `"  Facu   "` → `"Facu"`.
  - Alias matching: canonical `"Jorge Gutiérrez"` with aliases `"Guti"`, `"Gutito"`, `"Jorge"` — each
    `match(...)` → `{ matched, playerId }`.
  - Combined: `"5 Guti ⚽"` → strip → `"Guti"` → match → matched.
  - Ambiguity: two players, one canonical `"Juanito"`, one alias `"Juanito"` on a different player →
    `{ ambiguous, playerIds: [both] }`.
  - Unresolved: a name matching neither → `{ unresolved }`.
  - The author's own full WhatsApp-paste fixture (`REQUIREMENTS.md` §5), run line-by-line, confirms
    the matched/unresolved split it names.
- `server/src/repo/alias-repository.test.ts` (vitest, integration, **new**).
- `server/src/repo/player-repository.test.ts` (vitest, integration, modify): `listAll()` fixture
  including a player absent from the given season.
- `server/src/routes/api.test.ts` (vitest, integration, modify): `POST /players/:playerId/aliases`
  coverage.

## Definition of Done

- [ ] `player_aliases` table exists, no global unique on `alias`.
- [ ] `NameMatcher.strip`/`match` pass every fixture above, including the author's WhatsApp paste.
- [ ] `PlayerRepository.listAll()` and `AliasRepository` (`listAll`, `add`) exist and are tested.
- [ ] `POST /players/:playerId/aliases` exists and is tested.
- [ ] **Graduation:** F5 realises UC-001-03-S7/S8 and UC-001-09-S1..S3 — graduation value is
      `name-matcher.test.ts` + `alias-repository.test.ts` + the modified repo/route test files.
- [ ] **Documentation:** none — F5 is not named in `DESIGN_PLAN.md` §2.8/§4.
- [ ] **Tests:** `npm test --workspace=server` passes.
- [ ] **Regression:** deferred to task 12.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

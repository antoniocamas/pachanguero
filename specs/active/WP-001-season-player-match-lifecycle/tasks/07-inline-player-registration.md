# Task 07 — Inline new-player registration (introducing link, collision handling)

## Type

**Feature.** Iteration 1. Elements absorbed: **F7**. Depends on task 04 (F5) — `PlayerRegistrar`
builds a `NameMatcher` from `players.listAll()`/`aliases.listAll()` to run its collision check.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `DESIGN_PLAN.md` §3, subsections `F7 — Inline new-player registration` and (for the composed
  `NameMatcher`) `F5 — Name/alias matching with decoration stripping`
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/db/schema.sql` and `server/src/repo/`.

## Description

Add `players.introduced_by`, a standalone `PlayerRepository.register()` (creates a player with no
season enrollment — enrollment now happens implicitly on first appearance, per tasks 02/03), and a
`PlayerRegistrar` that guards registration behind a collision check (exact name, or via alias)
reusing F5's `NameMatcher`, shared by future callers (tasks 08 and 10) so neither duplicates it.

## Guidelines

1. In `server/src/db/schema.sql`: add `players.introduced_by INTEGER REFERENCES players(id)`
   (nullable).
2. In `server/src/repo/player-repository.ts`: add `register(name, introducedBy?): PlayerRow` —
   inserts into `players` only, no `season_players` row.
3. Create `server/src/repo/player-registrar.ts`: class `PlayerRegistrar(players, aliases)` with:
   ```
   register(name, introducedBy?):
     | { outcome: 'registered', player: PlayerRow }
     | { outcome: 'collision', match: NameMatcher.match(name) }   // 'matched' or 'ambiguous'

     1. build a NameMatcher from players.listAll() + aliases.listAll()
     2. const found = matcher.match(name)
     3. if found.outcome !== 'unresolved' → return { outcome: 'collision', match: found }
     4. otherwise → players.register(name, introducedBy) → { outcome: 'registered', player }
   ```
   This surfaces a collision through the same `matched`/`ambiguous` shape F5 already defines for a
   pasted line, so a client can route it through the identical link-or-resolve view.

## Tests

Testability Assessment: F7 = Yes, fully automatable (the Manual Test Plan guideline for the UI half
belongs to task 08's candidate-paste flow, not this backend logic).

- `server/src/repo/player-registrar.test.ts` (vitest, integration, **new**):
  - Plain registration, no host: `register('Nuevo')` → `{ registered, player: { name: 'Nuevo',
introducedBy: null } }`.
  - Host-linked registration: `register('Adri', introducedBy: <David's id>)` →
    `player.introducedBy === <David's id>`.
  - Collision, exact name: existing player `'Pablo'`; `register('Pablo')` → `{ collision, match: {
matched, playerId } }`; no new row created (verify unchanged `players` count).
  - Collision, via alias: existing player with alias `'Guti'`; `register('Guti')` → `{ collision,
match: { matched } }`.
- `server/src/repo/player-repository.test.ts` (vitest, integration, modify): `register()` fixture,
  `introduced_by` round-trip.

## Definition of Done

- [x] `players.introduced_by` exists, nullable, self-referencing.
- [x] `PlayerRepository.register` creates a player row with no `season_players` row.
- [x] `PlayerRegistrar.register` passes all four fixtures above.
- [x] **Graduation:** F7 realises UC-001-04-S1..S5 (S5 — "resolving one unresolved name doesn't
      touch the others" — is a property of the _caller_, verified in task 08's own fixtures, not
      re-tested here in isolation) — graduation value is `player-registrar.test.ts` + the modified
      `player-repository.test.ts`.
- [x] **Documentation:** none — F7 is not named in `DESIGN_PLAN.md` §2.8/§4.
- [x] **Tests:** `npm test --workspace=server` passes.
- [x] **Regression:** deferred to task 12.
- [x] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

# Task 08 — Candidate list paste & resolution (named + ephemeral guests, arrival-order rule)

## Type

**Feature.** Iteration 1. Elements absorbed: **F6**. Depends on task 04 (F5 — `NameMatcher`/
`AliasRepository`), task 05 (F3 — `GameDayResolutionService`), and task 07 (F7 —
`PlayerRegistrar`) — the first element to compose all three.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `docs/test-strategy.md` (E2E category)
- `DESIGN_PLAN.md` §3, subsection `F6 — Candidate list paste & resolution`, plus the `F5`, `F3` and
  `F7` subsections for the classes this element composes unchanged
- `.agents/rules/frontend-coding-standard.md` (for the `GameDay.tsx` portion)
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/domain/`, `server/src/repo/`, `server/src/routes/`, `web/src/pages/`, and `e2e/tests/`.

## Description

Add the `guest_candidates` table, a pure `CandidateLineParser`, a pure `GuestSlotAllocator`, a
`GuestCandidateRepository`, and an orchestrating `CandidateResolutionService` with `paste`/`resolve`.
Extend `GameDay.tsx` with a paste textarea and per-line resolve controls.

## Guidelines

1. In `server/src/db/schema.sql`: add
   ```sql
   CREATE TABLE guest_candidates (
     game_id        INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
     position       INTEGER NOT NULL,
     player_id      INTEGER REFERENCES players(id) ON DELETE CASCADE,  -- NULL = ephemeral guest
     host_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     PRIMARY KEY (game_id, position)
   );
   ```
   Row existence here (not a flag elsewhere) is the regular/guest discriminator.
2. Create `server/src/domain/candidate-line-parser.ts`: class `CandidateLineParser` with
   `parse(rawLine, position)` → `{ position, kind: 'plain', name }` |
   `{ position, kind: 'hostAnnotated', name, hostName }` | `{ position, kind: 'plusOne', hostName }`.
   Run `NameMatcher.strip` on the whole line first, then check in order: trailing `/\+\s*1\s*$/`
   (plusOne), else trailing `/\(([^)]+)\)\s*$/` (hostAnnotated), else plain. Re-strip each extracted
   `name`/`hostName` individually.
   Before parsing, split the raw text on newlines; drop the first line matching `/^reservas\b/i` and
   everything after it. Skip blank lines without consuming a position number.
3. Create `server/src/domain/guest-slot-allocator.ts`: class `GuestSlotAllocator` with
   `allocate(regularsCount, guests: { position }[], slots)`:
   `openSlots = slots - regularsCount; sorted = guests sorted by position ascending; return {
calledUp: sorted.slice(0, openSlots), excluded: sorted.slice(openSlots) }`. Pure, no I/O.
4. Create `server/src/repo/guest-candidate-repository.ts`: class `GuestCandidateRepository` with
   `list(gameId)` and `replaceAll(gameId, rows)` (delete-then-insert).
5. In `server/src/repo/participation-repository.ts`: add `clearSignups(gameId)` — sets `signed_up =
0` for every row of that game, called before a re-paste.
6. Create `server/src/repo/candidate-resolution-service.ts`: class
   `CandidateResolutionService(gameDay, players, aliases, participations, guests, parser)`:
   - `paste(text, gameId?)`: resolve the target game (explicit `gameId`, or
     `gameDay.resolveTarget(today)`); build one `NameMatcher` from `players.listAll()` +
     `aliases.listAll()`; drop the Reservas section; parse every remaining line; per line:
     - `plain`/`hostAnnotated` — match `name`; for `hostAnnotated`, also match `hostName` (an
       unresolved host makes the whole line unresolved — no chained resolution). `unresolved`/
       `ambiguous` → add to the response's `unresolved` list with the parsed shape.
     - `plusOne` — match `hostName` only; unresolved host → whole line unresolved.
     - Every resolved `plain`/already-known-`hostAnnotated` line → `participations.signed_up = 1`,
       no `guest_candidates` row.
     - Every resolved genuinely-new-`hostAnnotated` line → `participations.signed_up = 1` **and** a
       `guest_candidates` row.
     - Every resolved `plusOne` line → `participations.signed_up = 1` for the host (if not already
       set) **and** a `guest_candidates` row with `player_id = NULL`.
     - Replace semantics: before inserting, `clearSignups(gameId)` on `participations` (not
       deleted); `guests.replaceAll(gameId, [])` first (full delete) then insert this paste's rows.
     - Return `{ game, matched: [...], unresolved: [...] }`.
   - `resolve(gameId, line, action)`: `line` is the round-tripped parsed shape from `paste()`'s
     `unresolved` list. `action` is `{ type: 'link', playerId }`, `{ type: 'linkAsAlias', playerId }`
     (also `aliases.add(playerId, strip(name))`), or `{ type: 'register', name, introducedBy? }`
     (calls `PlayerRegistrar.register`; a `collision` outcome returns unresolved again, carrying the
     collision's match info). Persist through the same rules as `paste()`'s resolved branch, for
     this one line only — never re-running replace-semantics for the rest of the game's candidates.
7. In `server/src/routes/api.ts`: add `POST /games/candidates:paste`, `POST
/games/:gameId/candidates/resolve`.
8. In `web/src/pages/GameDay.tsx`: add a paste textarea, a matched/unresolved summary, and per-line
   resolve controls (link / link+alias / register, with an introducing-player field).

## Tests

Testability Assessment: F6 = Yes (Playwright E2E covers the UI half).

- `server/src/domain/candidate-line-parser.test.ts` (vitest, unit, **new**).
- `server/src/domain/guest-slot-allocator.test.ts` (vitest, unit, **new**): **the author's own
  worked example, run exactly** — 11 regulars, 4 guests at positions 8 (`Adri`), 12
  (`Álvaro +1`), 13 (`Juan`), 14 (`Rubén`), `slots = 14` → `allocate(11, [8,12,13,14], 14)` →
  `openSlots = 3` → `calledUp = [8, 12, 13]`, `excluded = [14]`.
- `server/src/repo/candidate-resolution-service.test.ts` (vitest, integration, **new**):
  - Clean paste, everyone matched — `unresolved` empty, every name has a `signed_up = 1` row.
  - Ambiguous/unmatched name — one line unresolved; no `participations` row until `resolve()`.
  - Reservas trailer — names beneath it appear in neither `matched` nor `unresolved`.
  - Named guest, first appearance: `"Adri (David)"` → `resolve(..., { register, name: 'Adri',
introducedBy: David })` → `participations` row for Adri **and** a `guest_candidates` row.
  - Named guest, already known: `"Juan (David)"`, `Juan` already exists → plain match path, **no**
    `guest_candidates` row.
  - Anonymous plus-one: `"Álvaro +1"` → `participations` row for Álvaro plus a `guest_candidates`
    row, `player_id = NULL`.
  - Re-paste replaces: paste, then re-paste with one name dropped, one added — dropped name's
    `signed_up` → `0`; added name's → `1`; no duplicate `guest_candidates` rows survive.
- `server/src/routes/api.test.ts` (vitest, integration, modify).
- E2E (new `e2e/tests/` spec): the candidate-paste-and-resolve flow end to end.

## Manual Test Plan

1. Submit a paste containing one ambiguous name alongside several unambiguous ones.
2. Observe the matched candidates render immediately, while the ambiguous one shows both candidate
   players with a pick-one control.
3. Pick one and confirm; observe it is removed from the unresolved list without re-submitting the
   whole paste, and the matched list now includes it.

## Definition of Done

- [x] `guest_candidates` table exists with the discriminator rule above.
- [x] `CandidateLineParser.parse` and `GuestSlotAllocator.allocate` pass every fixture above,
      including the author's exact worked example.
- [x] `CandidateResolutionService.paste`/`resolve` pass every fixture above, including re-paste
      replace semantics.
- [x] `GameDay.tsx` renders the paste flow per the Manual Test Plan.
- [x] **Graduation:** F6 realises UC-001-03-S1..S6,S9 — graduation value is
      `candidate-line-parser.test.ts` + `guest-slot-allocator.test.ts` +
      `candidate-resolution-service.test.ts` + the new E2E spec + the Manual Test Plan above.
- [x] **Documentation:** `docs/domain-model/glossary.md` — add entries for the new terms this task
      introduces: candidate, reserva (explicitly not modeled as a distinct concept — a name past the
      "Reservas" trailer is simply dropped), invitado ocasional/nombrado (named guest) vs. invitado
      anónimo (ephemeral guest), each in the same style as the existing `## Mercy seat` entry.
- [x] **Tests:** `npm test --workspace=server` passes; `npm run test:e2e` passes for the new spec.
- [x] **Regression:** deferred to task 12.
- [x] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file,
      including `web/src/pages/GameDay.tsx` per `.agents/rules/frontend-coding-standard.md`.

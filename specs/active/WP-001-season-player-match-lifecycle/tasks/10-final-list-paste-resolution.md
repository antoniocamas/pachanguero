# Task 10 — Final list paste & resolution: attendance/payment/team-split, exclusion retraction

## Type

**Feature.** Iteration 1. Elements absorbed: **F9**. Depends on task 04 (F5 — `NameMatcher`), task
06 (F4 — `FinalListTargetResolver`), task 07 (F7 — `PlayerRegistrar`, shared not duplicated), and
task 09 (F8 — reconciles against exclusions `ConvocatoriaService.commit` writes). Reuses task 08's
`CandidateLineParser` unchanged for per-line shape parsing.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `docs/domain-model/glossary.md` (this task's Documentation Impact obligation — see below)
- `docs/test-strategy.md` (E2E category)
- `DESIGN_PLAN.md` §3, subsection `F9 — Final list paste & resolution`, plus the `F5`, `F4`, `F7`,
  `F6` (for `CandidateLineParser`), and `F8` subsections it composes or reconciles against
- `.agents/rules/frontend-coding-standard.md` (for the `GameDay.tsx` portion)
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/domain/`, `server/src/repo/`, `server/src/routes/`, `web/src/pages/`, and `e2e/tests/`.

## Description

Add `participations.team`, a pure `FinalListParser` (team-section splitting), and an orchestrating
`FinalListResolutionService` that becomes the sole writer of `participations.played`/`.paid_cents`/
`.paid_on`, reconciles `exclusions` against the frozen `convocatoria_entries` outcome every time, and
sets `games.status = 'played'` (task 06's deferred write path).

## Guidelines

1. In `server/src/db/schema.sql`: add `participations.team TEXT CHECK (team IN ('claros',
'oscuros'))`, nullable.
2. Create `server/src/domain/final-list-parser.ts`: class `FinalListParser` with
   `splitByTeam(rawText): Array<{ team: 'claros' | 'oscuros'; line: string; position: number }>`.
   Split on newlines; run `NameMatcher.strip` on each; classify in order:
   - **Heading** — stripped line equals `claros`/`oscuros` case-insensitively
     (`localeCompare(…, 'es', { sensitivity: 'base' })`). Sets the current team until the next
     heading; headings may appear in either order.
   - **Separator/blank** — a stripped line with no letter at all (`/^[^a-zA-Zà-ÿÀ-Ÿ]*$/`), dropped
     without consuming a position number.
   - **Content** — everything else; assigned the next position in one running counter shared across
     both teams, in paste order.
     Content before the first heading → `throw`, naming the offending line.
3. Each `content` line, once tagged with a team, is handed to task 08's
   `CandidateLineParser.parse(line, position)` unchanged.
4. In `server/src/repo/participation-repository.ts`: add `clearFinalOutcome(gameId)` — resets
   `played`/`team`/`paid_cents`/`paid_on`/`guests` to their defaults for every row of that game;
   `signed_up` untouched.
5. Create `server/src/repo/final-list-resolution-service.ts`: class
   `FinalListResolutionService(games, schedule, players, aliases, participations, exclusions,
seasons, parser)`:
   - `paste(text, gameId?)`: resolve target game (explicit `gameId`, or `new
FinalListTargetResolver(games, schedule).resolve()`); build one `NameMatcher`; run
     `parser.splitByTeam(text)`, then `CandidateLineParser.parse` per line. Per parsed line:
     - `plain`/`hostAnnotated` — match `name` (and, for `hostAnnotated`, `hostName`, only for the
       `introduced_by` link on a genuinely new registration — never billed for a named guest).
       `unresolved`/`ambiguous` → add to `unresolved`.
     - `plusOne` — match `hostName` only; on resolution, increment that host's companion count for
       this paste (accumulates across multiple `plusOne` lines for the same host).
     - Every resolved line writes `participations.set(gameId, playerId, { signed_up: true, played:
true, team })` — `signed_up` unconditional (a final-list-only regular still gets signed up).
     - After every line resolves, compute payment: `paid_cents = perHead * (1 + companionCount)`,
       `perHead = Math.round(season.price_cents / season.slots)` (matching
       `import-season.ts:142`'s own expression); `paid_on` stamps today.
     - Exclusion reconciliation, recomputed fresh every call: read this game's
       `convocatoria_entries`. For every entry with frozen `outcome` `excluded`/`demoted`:
       `exclusions.set(gameId, playerId, thisPasteMarksThemPlaying ? null : entry.outcome)`. The
       frozen `convocatoria_entries` row itself is never rewritten.
     - Replace semantics: before writing, `clearFinalOutcome(gameId)`; `signed_up` and
       `guest_candidates` rows untouched.
     - Set `games.status = 'played'` once every line resolves without error.
     - Seniority-capture surfacing (reuse task 03 unchanged): for every resolved participant, if
       `players.hasAppeared(game.season_id, playerId)` is `false`, the response's `matched` entry
       carries `{ seniorityPrompt: true, suggested: players.suggestSeniority(game.season_id,
playerId) }`.
     - Return `{ game, matched: [...], unresolved: [...] }`.
   - `resolve(gameId, line, action)`: identical contract to task 08's `resolve` (line + team;
     `link`/`linkAsAlias`/`register` via `PlayerRegistrar`), persisting through the same rules as
     `paste()`'s resolved branch for this one line only.
6. In `server/src/routes/api.ts`: add `POST /games/final:paste`, `POST /games/:gameId/final/resolve`.
7. In `web/src/pages/GameDay.tsx`: add a final-list paste textarea, matched/unresolved summary with
   inline seniority-prompt, and team display.

## Tests

Testability Assessment: F9 = Yes (Playwright E2E covers the UI half).

- `server/src/domain/final-list-parser.test.ts` (vitest, unit, **new**): the author's own worked
  example, run exactly as given (headings in either order, arbitrary separator characters under
  each) — `splitByTeam` assigns all seven `Claros` lines `team: 'claros'`, all seven `Oscuros` lines
  `team: 'oscuros'`, regardless of heading order or separator characters.
- `server/src/repo/final-list-resolution-service.test.ts` (vitest, integration, **new**):
  - UC-001-06-S1, exact match: every called-up player's line resolves, billed `perHead`, `played =
1`; no `exclusions` change.
  - UC-001-06-S2, divergence: an omitted called-up player keeps `played = 0`; a replacement gets
    `played = 1`, billed normally; a different, actually-excluded candidate's exclusion point is
    untouched.
  - UC-001-06-S3, anonymous guest billing: `"Fer +1"` under `Claros`, `perHead = 400` →
    `paid_cents = 800` for Fer; no row for the companion.
  - UC-001-06-S6, retraction: a player with frozen `outcome = 'excluded'` and a live `exclusions`
    row appears playing → after `paste()`, the `exclusions` row is gone; `convocatoria_entries`
    unchanged. Re-paste omitting them again → the `exclusions` row is re-created.
  - UC-001-06-S7, brand-new guest via host annotation: `"Jesus (Pablo)"`, unresolved →
    `resolve(..., { register, name: 'Jesus', introducedBy: Pablo })` → a `participations` row for
    Jesus, `played = 1`, billed at `perHead`, `introduced_by = Pablo`.
  - UC-001-06-S8, known regular with no prior candidacy: no pre-existing `participations` row,
    named plainly in the final list → resolves via the ordinary match-and-write path.
  - UC-001-06-S9: `participations.team` holds correctly for every written row; grep for `\.team\b`
    outside this task's own files finds nothing.
  - Seniority surfacing: a resolved player with no `season_players` row for `game.season_id` →
    `matched` entry carries `seniorityPrompt: true` and the matching `suggested` value.
  - Malformed paste: content before any heading → throws, naming the line; no `participations` row
    written for any line in that same paste (all-or-nothing).
- `server/src/repo/participation-repository.test.ts` (vitest, integration, modify):
  `clearFinalOutcome` fixture.
- `server/src/routes/api.test.ts` (vitest, integration, modify).
- E2E (new `e2e/tests/` spec): the final-list-paste-and-resolve flow end to end, including the
  exclusion-retraction case.

## Manual Test Plan

1. Paste a final list where one previously-excluded player now appears as having played.
2. Observe their standings row updates (exclusion count drops by one, points recompute) without a
   page reload.
3. Observe the team split renders as two labelled groups matching the pasted headings' own order.

## Definition of Done

- [ ] `participations.team` exists, nullable, `CHECK (team IN ('claros','oscuros'))`.
- [ ] `FinalListParser.splitByTeam` passes the author's worked example exactly.
- [ ] `FinalListResolutionService.paste`/`resolve` pass every fixture above, including the
      all-or-nothing malformed-paste case and the bidirectional exclusion-reconciliation case.
- [ ] `games.status` is set to `'played'` on successful resolution (closes task 06's deferred write).
- [ ] `GameDay.tsx` renders the final-list flow per the Manual Test Plan.
- [ ] **Graduation:** F9 realises UC-001-06-S1..S9 — graduation value is
      `final-list-parser.test.ts` + `final-list-resolution-service.test.ts` + the new E2E spec + the
      Manual Test Plan above.
- [ ] **Documentation:** `docs/domain-model/glossary.md` — add entries for Claros/Oscuros (the team
      split) and "final convocatoria" (the post-game outcome, distinct from the algorithmic
      Convocatoria task 09 already pointed at); correct the `## Convocatoria` entry to close the
      candidate-vs-final distinction task 09 started.
- [ ] **Tests:** `npm test --workspace=server` passes; `npm run test:e2e` passes for the new spec.
- [ ] **Regression:** deferred to task 12.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file,
      including `web/src/pages/GameDay.tsx` per `.agents/rules/frontend-coding-standard.md`.

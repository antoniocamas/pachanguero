# Task 09 — Convocatoria commit decoupled from attendance, guest-aware

## Type

**Feature.** Iteration 1. Elements absorbed: **F8**. Depends on task 08 (F6) — reuses
`GuestSlotAllocator` and `GuestCandidateRepository`, unmodified.

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `docs/domain-model/convocatoria.md`, `docs/domain-model/points.md` (this task's Documentation
  Impact obligations — see below)
- `DESIGN_PLAN.md` §3, subsection `F8 — Convocatoria commit decoupled from attendance, guest-aware`,
  plus the `F6` subsection for `GuestSlotAllocator`
- Discover, via the project's own documentation-routing rule, any guideline covering
  `server/src/repo/`.

## Description

Branch `ConvocatoriaService.commit`/`preview` on `regularsCount` vs. `rules.slots`. Stop calling
`participations.set(…, { played })` entirely — attendance becomes task 10's (F9's) sole concern. Add
a precondition that every ranked candidate already has a `season_players` row before ranking runs.

## Guidelines

1. In `server/src/repo/convocatoria-service.ts`:
   - Compute `regularsCount = signedUp.length − namedGuestPlayerIds.length`, where
     `namedGuestPlayerIds` are the `player_id`s present in `GuestCandidateRepository.list(gameId)`
     for this game.
   - **`regularsCount <= rules.slots`**: no `ConvocatoriaBuilder`. Every regular is `called_up`.
     `GuestSlotAllocator.allocate(regularsCount, guestRows, rules.slots)` splits guests into
     called-up/excluded by arrival order. Persist a `convocatoria_entries` row for every entry with a
     real `player_id` (regulars, all named guests); an `exclusions` row (`kind: 'points'`) for every
     excluded **named** guest; nothing for ephemeral guests either way.
   - **`regularsCount > rules.slots`**: build one `Contender[]` pool — regulars and named guests as
     real `{playerId, name, points}` from `standings()`; ephemeral guests as synthetic
     `{playerId: -position, name: 'Invitado de <host>', points: 0}` (negative id, never collides with
     a real `INTEGER PRIMARY KEY`). Run `ConvocatoriaBuilder.build` unchanged. Post-process: any
     entry with a negative `playerId` is never written to `convocatoria_entries`/`exclusions` —
     display-only. Every entry with a real `playerId` persists exactly as today.
   - Both branches, and `preview`, stop calling `participations.set(…, { played })` entirely.
   - New precondition (only for the `>` branch): every real-`playerId` candidate must already have a
     `season_players` row for this season (`StandingsService.players.list(seasonId)`); if any are
     missing, `preview`/`commit` throw, naming them.

## Tests

Testability Assessment: F8 = Yes, fully automatable.

- `server/src/repo/convocatoria-service.test.ts` (vitest, integration, modify):
  - **The exhaustive-grep success criterion**: after this task,
    `grep -rn 'participations.*\.set(' server/src | grep played` must find **zero** call sites —
    checked at review time as part of this task's own completion gate, not a runtime assertion.
  - Boundary, `regularsCount === rules.slots` exactly: 14 regulars, `slots = 14`, one guest →
    arrival-order branch runs; `openSlots = 0` → the guest is excluded, no regular touched.
  - The author's worked example, end to end: 11 regulars + 4 guests, `slots = 14` →
    `convocatoria_entries` holds 11 regulars + 3 called-up guests, all `called_up`; `exclusions`
    holds one row (a named `Rubén`, `kind: 'points'`) — fixture written with a **named** `Rubén`
    specifically to exercise the exclusion-point path.
  - Guest-inclusive ranking, `regularsCount > rules.slots`: 15 regulars + 1 named guest with high
    points + 1 ephemeral guest, `slots = 14` → the named guest's points place them ahead of the
    lowest-points regular, whose cut lands on the regular instead. The ephemeral guest produces zero
    `convocatoria_entries`/`exclusions` rows either way.
  - `participations.played` stays unset after `commit()` — never set to match `playing`.
  - Seniority precondition: a signed-up candidate with no `season_players` row → `preview()`/
    `commit()` throw, naming that player, when `regularsCount > rules.slots`; the same fixture with
    `regularsCount <= rules.slots` succeeds despite the missing row.

## Definition of Done

- [ ] `ConvocatoriaService.commit`/`preview` branch correctly on `regularsCount` vs `rules.slots`,
      per every fixture above.
- [ ] The exhaustive-grep check finds zero `participations…set(…, played)` call sites.
- [ ] The seniority precondition throws exactly when specified.
- [ ] **Graduation:** F8 realises UC-001-05-S1..S4 — graduation value is the modified
      `convocatoria-service.test.ts`.
- [ ] **Documentation:** `docs/domain-model/convocatoria.md` — add a pointer near `## Pasos` step 1
      ("Reunir a los apuntados") noting that "apuntados" now means the resolved candidate pool
      (regulars + named/ephemeral guests) from task 08, not a raw `signed_up` read, and that this
      document describes selection only, not what actually happened on the pitch (task 10's own
      record). `docs/domain-model/points.md` — add one paragraph after `## 1. Asistencia` stating
      explicitly that a paid game requires a resolved final list (task 10), not merely a Convocatoria
      commit — checked in full during this task per the design's own note.
- [ ] **Tests:** `npm test --workspace=server` passes.
- [ ] **Regression:** deferred to task 12.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

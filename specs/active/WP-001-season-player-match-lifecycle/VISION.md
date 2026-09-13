# Vision — WP-001-season-player-match-lifecycle

## 1. Problem Statement

The app's domain model doesn't match how games are actually run: players are modeled as belonging
to a season when they're really a persistent roster that comes and goes on its own schedule, and
there is no representation of the real match lifecycle (Sunday candidate list → Monday algorithmic
Convocatoria → post-game actual attendance). Fixing the model is the driver; the WhatsApp/Telegram
paste-to-input flow exists to serve it, not the other way around.

## 2. Key Stakeholder or User Needs

The author, as sole operator, running the weekly bookkeeping alone today. Other regulars may input
or view data in the future, so the design should not hard-code a single-user assumption where it's
cheap not to, but this WP is not building multi-user features now.

## 3. Scope

In scope: the full lifecycle of seasons, players, games/matches, and convocatorias (candidate list,
algorithmic pre-game Convocatoria, post-game actual attendance/Claros-Oscuros), including
occasional/guest players, the reserve queue, and manual/backfilled historical games. This WP also
decides _when_ points are won as a consequence of that lifecycle (e.g., which event — algorithmic
cut vs. post-game attendance — triggers a point).

Out of scope: the selection algorithm itself (who gets picked, how the mercy mechanism computes its
outcome) — treated as an existing, correct rule this WP feeds inputs to, not something it changes.
Actually sending or receiving WhatsApp/Telegram messages is out of scope; input arrives as
user-pasted text in a text box. However, since a Telegram bot is a planned future input channel, the
input-handling architecture must be designed so a bot can be added later without reworking the
domain model or parsing core — channel (paste box today, Telegram bot later) should be a thin edge,
not baked into the domain logic.

## 4. Quality Ranges

When pasted text can't be confidently matched to a canonical player, the system must never guess
silently. It must show the partial result — what matched cleanly — alongside the names it couldn't
resolve, and give the user a comfortable view to resolve each ambiguous/unmatched name individually
before the data is committed.

## 5. Constraints

None as hard technical limits — the application is not yet in production use, so schema and data can
be freely changed, undone, or redone during this work.

## 6. Assumptions and Dependencies

- No season currently has real points data yet (app unused in production) — `verified` (author
  confirmed), so this WP is free to define the points/season model rather than migrate one.
- Historical data (existing games/attendance already recorded, e.g. `data/seed/*.csv` and
  `data/pachanguero.db`) can be used to derive a player's starting point value the first time they
  appear in a new season, rather than starting everyone at zero — `unverified`, to be worked out in
  Requirements/Design.
- Existing DB schema and current season/points logic are a starting point to evolve, not a hard
  constraint to preserve — `verified`.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- A season runs Sept-July, one game a week. Rules are per-season so they can be
-- changed between seasons without rewriting history.
CREATE TABLE IF NOT EXISTS seasons (
  id                   INTEGER PRIMARY KEY,
  name                 TEXT    NOT NULL UNIQUE,   -- '2024/2025'
  starts_on            TEXT    NOT NULL UNIQUE,  -- 'YYYY-09-01'
  ends_on              TEXT    NOT NULL,         -- 'YYYY+1-08-31'
  price_cents          INTEGER NOT NULL DEFAULT 5600,  -- pitch cost per game
  slots                INTEGER NOT NULL DEFAULT 14,
  mercy_seats          INTEGER NOT NULL DEFAULT 1,
  games_out_for_mercy  INTEGER NOT NULL DEFAULT 2,
  mercy_resets_counter INTEGER NOT NULL DEFAULT 0,  -- 0 = legacy 'subtract N'
  demotion_direction   TEXT    NOT NULL DEFAULT 'bottom-up'
                         CHECK (demotion_direction IN ('bottom-up','top-down')),
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE,
  introduced_by INTEGER REFERENCES players(id),  -- the player who brought them along
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seniority is per season: a player has N seasons behind them in this season.
CREATE TABLE IF NOT EXISTS season_players (
  season_id INTEGER NOT NULL REFERENCES seasons(id)  ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  seasons   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (season_id, player_id)
);

-- Nicknames a pasted name may use instead of the canonical one. No global
-- UNIQUE(alias): two players may share one, which matching reports as ambiguous.
CREATE TABLE IF NOT EXISTS player_aliases (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  alias     TEXT    NOT NULL,
  PRIMARY KEY (player_id, alias)
);

-- The weekly game day, versioned: a change is a new row with a later
-- effective_from, never an edit, so earlier weeks keep resolving as they did.
CREATE TABLE IF NOT EXISTS weekly_schedule (
  id             INTEGER PRIMARY KEY,
  weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- Sunday = 0
  kickoff_time   TEXT    NOT NULL,                                  -- 'HH:MM'
  effective_from TEXT    NOT NULL UNIQUE,
  created_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id         INTEGER PRIMARY KEY,
  season_id  INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  played_on  TEXT    NOT NULL,
  label      TEXT,                                  -- 'Bis' for a replayed week
  status     TEXT    NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','convocatoria_created',
                                 'convocatoria_confirmed','played','cancelled')),
  -- The state a cancelled game returns to when the cancellation is undone.
  cancelled_from TEXT
               CHECK (cancelled_from IN ('open','convocatoria_created',
                                         'convocatoria_confirmed','played')),
  notes      TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (season_id, played_on, label),
  CHECK ((status = 'cancelled') = (cancelled_from IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_games_season ON games(season_id, played_on);

-- The three concepts the legacy '*' conflated, kept apart on purpose.
--
--   signed_up  -- I want to play this week
--   played     -- I was on the pitch
--   paid_cents -- settled, with the date it actually landed
--
-- A player who played without paying is `played = 1, paid_cents = 0`: that is
-- the debt the '*' used to mean, and it survives being paid later because
-- paid_on records when the money arrived, not when the game was.
CREATE TABLE IF NOT EXISTS participations (
  game_id    INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  signed_up  INTEGER NOT NULL DEFAULT 1,
  played     INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  paid_on    TEXT,
  team       TEXT    CHECK (team IN ('claros','oscuros')),  -- from the final list
  note       TEXT,
  PRIMARY KEY (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_participations_player ON participations(player_id);

-- Guests among a game's pasted candidates. A candidate with a row here is a
-- guest (ranked by arrival, not points); one without is a regular. A NULL
-- player_id is an anonymous '+1' who is not a registered player.
CREATE TABLE IF NOT EXISTS guest_candidates (
  game_id        INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  position       INTEGER NOT NULL,   -- 1-based place in the pasted list
  player_id      INTEGER REFERENCES players(id) ON DELETE CASCADE,
  host_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, position)
);

-- The candidate list as the organiser saved it: one text line per row, in
-- order. Unmatched names live only here, as text: each load re-reads the lines
-- against the current players, so nothing is guessed or stored for them.
CREATE TABLE IF NOT EXISTS candidate_lines (
  game_id  INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,   -- 1-based place in the list
  text     TEXT    NOT NULL,
  -- Who the organiser said the name (or its host) is, when the spelling alone
  -- does not say: their choice for this line, not a guess.
  name_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  host_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  -- 1 when this line registered the name as its host's guest: that, not the
  -- host in the brackets, is what makes a named guest.
  introduced     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, position)
);

-- One row per player left out of (or mercy-seated into) a game. The legacy
-- FueraDeConvocatoria grid, normalised.
CREATE TABLE IF NOT EXISTS exclusions (
  game_id   INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind      TEXT    NOT NULL CHECK (kind IN ('points','demoted','mercy')),
  PRIMARY KEY (game_id, player_id)
);

-- Every convocatoria that was run, frozen with the points it saw. This is what
-- makes a selection auditable even though payments keep arriving late.
CREATE TABLE IF NOT EXISTS convocatorias (
  id           INTEGER PRIMARY KEY,
  game_id      INTEGER NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  rules_json   TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,                                -- NULL until confirmed
  source       TEXT    NOT NULL DEFAULT 'generated'
                 CHECK (source IN ('generated','history'))
);

-- One entry per person the selection placed. An anonymous '+1' takes a slot
-- too, so it is an entry: no player, identified by its host and ordinal (the
-- nth plus-one of that host), which survives the candidate list being rewritten.
CREATE TABLE IF NOT EXISTS convocatoria_entries (
  id                   INTEGER PRIMARY KEY,
  convocatoria_id      INTEGER NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  player_id            INTEGER REFERENCES players(id) ON DELETE CASCADE,
  guest_host_player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  guest_ordinal        INTEGER CHECK (guest_ordinal > 0),
  position             INTEGER NOT NULL,
  points               REAL    NOT NULL,
  wait_counter         INTEGER NOT NULL DEFAULT 0,
  outcome              TEXT    NOT NULL
                         CHECK (outcome IN ('called_up','mercy','demoted','excluded')),
  playing              INTEGER NOT NULL,
  CHECK ((player_id IS NULL) != (guest_ordinal IS NULL)),
  CHECK ((guest_ordinal IS NULL) = (guest_host_player_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_convocatoria_entries_player
  ON convocatoria_entries(convocatoria_id, player_id) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_convocatoria_entries_guest
  ON convocatoria_entries(convocatoria_id, guest_host_player_id, guest_ordinal)
  WHERE guest_ordinal IS NOT NULL;

-- A share still owed: one row per share, deleted when it is settled, so the
-- table holds only live obligations and debt reads do not slow as history grows.
-- The holder answers for it; the beneficiary is the player it is for, or an
-- anonymous '+1' (the nth of this holder's, which no line number can name).
CREATE TABLE IF NOT EXISTS share_debts (
  id                    INTEGER PRIMARY KEY,
  game_id               INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  holder_player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  beneficiary_player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  guest_ordinal         INTEGER CHECK (guest_ordinal > 0),
  amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
  CHECK ((beneficiary_player_id IS NULL) != (guest_ordinal IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_share_debts_game   ON share_debts(game_id);
CREATE INDEX IF NOT EXISTS idx_share_debts_holder ON share_debts(holder_player_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_share_debts_player
  ON share_debts(game_id, beneficiary_player_id) WHERE beneficiary_player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_share_debts_guest
  ON share_debts(game_id, holder_player_id, guest_ordinal) WHERE guest_ordinal IS NOT NULL;

-- A share settled: an append-only record of who paid it and when. A share is in
-- share_debts or here, never both; that exclusion is kept by the code that moves it.
CREATE TABLE IF NOT EXISTS payments (
  id                    INTEGER PRIMARY KEY,
  game_id               INTEGER NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  holder_player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  beneficiary_player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  guest_ordinal         INTEGER CHECK (guest_ordinal > 0),
  payer_player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_on               TEXT    NOT NULL,
  CHECK ((beneficiary_player_id IS NULL) != (guest_ordinal IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_payments_game  ON payments(game_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_player_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_player
  ON payments(game_id, beneficiary_player_id) WHERE beneficiary_player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_guest
  ON payments(game_id, holder_player_id, guest_ordinal) WHERE guest_ordinal IS NOT NULL;

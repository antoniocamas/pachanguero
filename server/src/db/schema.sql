PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- A season runs Sept-July, one game a week. Rules are per-season so they can be
-- changed between seasons without rewriting history.
CREATE TABLE IF NOT EXISTS seasons (
  id                   INTEGER PRIMARY KEY,
  name                 TEXT    NOT NULL UNIQUE,   -- '2024/2025'
  starts_on            TEXT,
  ends_on              TEXT,
  is_active            INTEGER NOT NULL DEFAULT 0,
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
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seniority is per season: a player has N seasons behind them in this season.
CREATE TABLE IF NOT EXISTS season_players (
  season_id INTEGER NOT NULL REFERENCES seasons(id)  ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  seasons   INTEGER NOT NULL DEFAULT 1,
  active    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (season_id, player_id)
);

CREATE TABLE IF NOT EXISTS games (
  id         INTEGER PRIMARY KEY,
  season_id  INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  played_on  TEXT    NOT NULL,
  label      TEXT,                                  -- 'Bis' for a replayed week
  status     TEXT    NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled','played','cancelled')),
  notes      TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (season_id, played_on, label)
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
  guests     INTEGER NOT NULL DEFAULT 0,   -- extra people they paid for
  note       TEXT,
  PRIMARY KEY (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_participations_player ON participations(player_id);

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
  id         INTEGER PRIMARY KEY,
  game_id    INTEGER NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  rules_json TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS convocatoria_entries (
  convocatoria_id INTEGER NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  player_id       INTEGER NOT NULL REFERENCES players(id)       ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  points          REAL    NOT NULL,
  wait_counter    INTEGER NOT NULL DEFAULT 0,
  outcome         TEXT    NOT NULL
                    CHECK (outcome IN ('called_up','mercy','demoted','excluded')),
  playing         INTEGER NOT NULL,
  PRIMARY KEY (convocatoria_id, player_id)
);

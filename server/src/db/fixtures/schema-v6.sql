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

-- The names the bank shows a player under as a Bizum sender, one row each. A player may have
-- several; two players may hold the same one (then it identifies neither).
CREATE TABLE IF NOT EXISTS player_bizum_names (
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  bizum_name TEXT    NOT NULL,
  PRIMARY KEY (player_id, bizum_name)
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
CREATE INDEX IF NOT EXISTS idx_share_debts_beneficiary ON share_debts(beneficiary_player_id);
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
  method                TEXT    NOT NULL DEFAULT 'otro'
                        CHECK (method IN ('efectivo', 'bizum', 'otro')),
  bizum_id              INTEGER REFERENCES bizums(id),   -- the Bizum that paid it; null for a manual payment
  CHECK ((beneficiary_player_id IS NULL) != (guest_ordinal IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_payments_game  ON payments(game_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_player_id);
CREATE INDEX IF NOT EXISTS idx_payments_beneficiary ON payments(beneficiary_player_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_player
  ON payments(game_id, beneficiary_player_id) WHERE beneficiary_player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_guest
  ON payments(game_id, holder_player_id, guest_ordinal) WHERE guest_ordinal IS NOT NULL;

-- Login accounts, separate from players: a username is not a player's name. A regular
-- user is tied to exactly one player; an admin may or may not be. players.id has no
-- ON DELETE action here, so a player with an account cannot be deleted by accident.
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  username        TEXT    NOT NULL UNIQUE,   -- stored lower-case
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK (role IN ('admin','regular')),
  player_id       INTEGER UNIQUE REFERENCES players(id),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,                      -- ISO-8601 UTC
  last_login      TEXT,                      -- ISO-8601 UTC
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (role = 'admin' OR player_id IS NOT NULL)
);

-- One row per refresh token handed out; only its SHA-256 is stored. A token is used
-- once: rotating it revokes the row and inserts the next.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  view       TEXT    NOT NULL DEFAULT 'admin' CHECK (view IN ('admin','regular')),
  acting_as  INTEGER REFERENCES players(id) ON DELETE SET NULL, -- the player an admin is looking at the app as, if not their own
  expires_at TEXT    NOT NULL,               -- ISO-8601 UTC
  revoked    INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Every time an admin starts looking at the app as another player. The name is kept as it was.
CREATE TABLE IF NOT EXISTS view_as_log (
  id            INTEGER PRIMARY KEY,
  admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id     INTEGER NOT NULL,
  player_name   TEXT    NOT NULL,
  started_at    TEXT    NOT NULL                    -- ISO-8601 UTC
);

-- Optional contact data a player keeps about themselves; a row exists only while one value is set.
CREATE TABLE IF NOT EXISTS player_contacts (
  player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  email     TEXT,
  phone     TEXT
);

-- A bank authorisation the organiser started and the bank has not yet sent the browser back from.
-- Only the SHA-256 of the state is stored; a used row stays a day past its expiry so a second
-- use can be told from a state that was never issued.
CREATE TABLE IF NOT EXISTS bank_authorizations (
  state_hash TEXT PRIMARY KEY,
  bank_id    TEXT NOT NULL,
  purpose    TEXT NOT NULL CHECK (purpose IN ('connect','renew')),
  created_at TEXT NOT NULL,                  -- ISO-8601 UTC
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

-- The one bank access: at most one row. The session id is kept as is, because every read needs
-- it; the accounts only as a summary (currency, type, last 4 characters), never a holder's name.
CREATE TABLE IF NOT EXISTS bank_connection (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  bank_id        TEXT    NOT NULL,
  session_id     TEXT    NOT NULL,
  valid_until    TEXT    NOT NULL,           -- ISO-8601 UTC
  state          TEXT    NOT NULL CHECK (state IN ('connected','reconnect_needed')),
  reason         TEXT,                       -- the bank's error code, or EXPIRED, when reconnecting is needed
  connected_at   TEXT    NOT NULL,
  accounts_json  TEXT    NOT NULL,
  deep_read_done INTEGER NOT NULL DEFAULT 0 CHECK (deep_read_done IN (0,1))
);

-- What the organiser chose to read: at most one row, written once by the first read of the
-- settings. A null bank means none was chosen yet and the catalogue's default is offered; the
-- account is kept by its stable id, which survives renewals.
CREATE TABLE IF NOT EXISTS bank_settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  bank_id           TEXT,
  currency          TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3),
  account_stable_id TEXT,
  start_date        TEXT                       -- YYYY-MM-DD; null: not set
);

-- The two lists of words that keep or discard a Bizum, as the organiser typed them; they are
-- compared folded, so "futbol" and "fútbol" are two rows that match the same subjects.
CREATE TABLE IF NOT EXISTS bank_keywords (
  list TEXT NOT NULL CHECK (list IN ('include','exclude')),
  word TEXT NOT NULL,
  PRIMARY KEY (list, word)
);

-- The Bizum core's own tables: nothing here knows a player, a debt or a payment.
-- Every bank entry handled, by the bank's own identification and what became of it; the key
-- holds no sender, subject or amount, so a discarded entry leaves no personal data.
CREATE TABLE IF NOT EXISTS bizum_entries (
  account     TEXT NOT NULL,
  reference   TEXT NOT NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('kept','discarded','not_bizum','dismissed')),
  recorded_at TEXT NOT NULL,                 -- ISO-8601 UTC
  PRIMARY KEY (account, reference)
);

-- The Bizums kept, one column per field of the model.
CREATE TABLE IF NOT EXISTS bizums (
  id             INTEGER PRIMARY KEY,
  account        TEXT    NOT NULL,
  reference      TEXT    NOT NULL,
  direction      TEXT    NOT NULL CHECK (direction IN ('incoming','outgoing')),
  booked_on      TEXT    NOT NULL,           -- YYYY-MM-DD
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  currency       TEXT    NOT NULL,
  sender_name    TEXT,
  sender_phone   TEXT,
  receiver_name  TEXT,
  receiver_phone TEXT,
  subject        TEXT,
  kept_at        TEXT    NOT NULL,
  UNIQUE (account, reference)
);

-- How the last read ended: codes and counts only. At most one row.
CREATE TABLE IF NOT EXISTS bizum_feed_state (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  started_at         TEXT    NOT NULL,
  finished_at        TEXT    NOT NULL,
  result             TEXT    NOT NULL,       -- 'ok', a bank failure code, or 'internal'
  code               TEXT,
  entries            INTEGER NOT NULL,
  kept               INTEGER NOT NULL,
  discarded          INTEGER NOT NULL,
  not_bizum          INTEGER NOT NULL,
  pending            INTEGER NOT NULL,
  unidentified       INTEGER NOT NULL,
  known              INTEGER NOT NULL,
  rate_limited_until TEXT
);

-- What the group decided about a kept Bizum: waiting for the organiser, or settled, and how.
CREATE TABLE IF NOT EXISTS bizum_handling (
  bizum_id          INTEGER PRIMARY KEY REFERENCES bizums(id) ON DELETE CASCADE,
  status            TEXT    NOT NULL CHECK (status IN ('waiting','settled')),
  reason_json       TEXT,                    -- the wait reason and the sender; null once settled
  unallocated_cents INTEGER NOT NULL DEFAULT 0 CHECK (unallocated_cents >= 0),
  settled_how       TEXT    CHECK (settled_how IN ('automatic','organiser')),
  updated_at        TEXT    NOT NULL
);

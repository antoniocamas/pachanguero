# Schema examples — `not yet run`

Worked by hand from UC-004-01 to 11. Table and column names are illustrative until Design. Nothing
here has been run against SQLite.

```sql
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  username        TEXT    NOT NULL UNIQUE,
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL CHECK (role IN ('admin','regular')),
  player_id       INTEGER UNIQUE REFERENCES players(id),   -- one user per player (UC-004-04-S3)
  active          INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (role = 'admin' OR player_id IS NOT NULL)          -- a regular user always has a player (S2)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,                       -- the token itself is never stored
  view       TEXT    NOT NULL DEFAULT 'admin' CHECK (view IN ('admin','regular')),  -- UC-004-11-S6
  expires_at TEXT    NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

Open for Design (study Q-05): contact data as two nullable columns of `players` (needs a
migration step, UC-004-10-S5) or as a new table keyed by `player_id` (needs none):

```sql
CREATE TABLE IF NOT EXISTS player_contacts (
  player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  email     TEXT,
  phone     TEXT
);
```

A merge of players (UC-004-04-S13) must move `users.player_id`, and refuse when both players have a row.

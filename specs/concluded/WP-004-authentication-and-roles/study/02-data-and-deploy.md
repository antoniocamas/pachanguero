# Players, schema and deployment (Q-04, Q-05, Q-06)

Searched: `server/src/db/{schema.sql,index.ts,test-support.ts,schema.test.ts}`, a read-only count
query on `data/pachanguero.db`, `deploy/`, `README.md` (deployment), `server/package.json`.

## Q-04 — Which players can be users

- The live database has 43 players, 4 introduced by another player (guests brought along), 1 with
  no `season_players` row, 4 `guest_candidates`, 53 games, 67 payments, 2 outstanding debts.
- `players` has only `id`, `name` (UNIQUE), `introduced_by`, `created_at`. No email, phone or
  user link. Merged duplicates are folded into one row by `PlayerMergeService`, so a user links to
  the surviving id; a later merge must move or reject a linked user (open for Design).
- Anonymous plus-ones are not players at all (guest ordinal on a holder), so they can never be
  users. Players with `introduced_by` are real rows and could be users if the organiser wants.
- A player without an account is the normal case (guests, people who left). The link is therefore
  optional on the player side and unique on the user side (one user per player).

## Q-05 — Schema, email/phone, migrations

- There is no migration system. `db()` runs the whole `schema.sql` (all `CREATE TABLE IF NOT
EXISTS`) on every open, so adding a new table is already safe on the live DB: a `users` table
  needs no migration at all.
- Adding `email` and `phone` to `players` is different: `CREATE TABLE IF NOT EXISTS` will not add
  columns to an existing table, and `AGENTS.md` today says the fix is to delete the DB and
  reseed, which the author has ruled out. Two ways to avoid it: store contact data in the new
  per-player table (no `ALTER` of an existing table) or add a minimal versioned migration step
  (`PRAGMA user_version` and an ordered list). The author allowed migrations; the first option may
  need none. Design decides.
- Safe-migration ingredients already present: `data/pachanguero.before-wp003.db` shows the
  author already takes a file copy before risky changes. A migration step should do the same copy
  automatically and run inside a transaction.
- `schema.test.ts` and `TestDatabase` build from `schema.sql`, so any migration mechanism must
  leave a fresh database and a migrated one identical (a test for that is cheap).

## Q-06 — Deployment, secrets, first admin

Superseded in part: the author is moving to Docker, see `04-author-decisions.md`. What follows describes the repo as it stands today.

- Production: systemd unit on a Raspberry Pi, `HOST=127.0.0.1`, node serves SPA and API on one
  port, Caddy reverse-proxies with TLS (`deploy/Caddyfile`, DuckDNS domain). The unit hard-codes
  its environment lines, so a JWT secret fits there as an `Environment=`/`EnvironmentFile=`.
- Caddy already gives HTTPS; the app should still set cookies `Secure` and trust the proxy
  (`X-Forwarded-*`) for client IPs used in rate limiting. Behind the proxy the node process sees
  only 127.0.0.1 unless `trust proxy` is set.
- No bootstrap path exists. The first admin cannot be created through an admin-only endpoint.
  Options: a CLI script (like `npm run seed`) that creates or resets an admin, run on the Pi.
  This also doubles as the forgotten-password route for the admin.
- Node is v26; `node:crypto` has `scrypt` and `timingSafeEqual`, so password hashing needs no new
  package. JWT signing/verification (HS256) could also be done with `node:crypto`, but it is
  safer to use a vetted library; **adding one needs the author's explicit permission** (global
  rule: never install without permission).

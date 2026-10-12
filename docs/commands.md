# Commands and configuration

Everything you type to run, configure and operate Pachanguero. The rules of the
game are in [`domain-model/`](domain-model/); who can do what is in
[`users-and-roles.md`](users-and-roles.md); backups are in
[`backup_and_restore.md`](backup_and_restore.md).

## npm scripts

Run from the repository root.

| Command                                         | What it does                                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`                                   | Installs both workspaces (`server`, `web`) and the E2E one                                                                                                      |
| `npm run dev`                                   | The API on :8787 (`tsx watch`) and the web on :5173 (Vite, proxying `/api`). Needs `JWT_SECRET`, see [Configuration](#configuration)                            |
| `npm run build`                                 | Compiles the web and the server (`web/dist`, `server/dist`)                                                                                                     |
| `npm start`                                     | Production: one port, Express serves the SPA and the API                                                                                                        |
| `npm test`                                      | Domain and route tests (server) and `lib/` tests (web)                                                                                                          |
| `npm run test:e2e`                              | Full-stack browser tests, against an isolated database ([`test-strategy.md`](test-strategy.md))                                                                 |
| `npm run lint` / `lint:fix`                     | ESLint                                                                                                                                                          |
| `npm run format` / `format:check`               | Prettier                                                                                                                                                        |
| `npm run seed`                                  | Imports the 2024/2025 season from `data/seed/*.csv`; `-- --reset` first wipes the imported season's rows. See [Trying the app by hand](#trying-the-app-by-hand) |
| `npm run admin --workspace=server -- <command>` | The operator tool, see [The admin tool](#the-admin-tool)                                                                                                        |

A single server test file or case, from `server/`:

```bash
npx vitest run src/domain/convocatoria.test.ts
npx vitest run -t "reproduces the legacy remainder bug"
```

## Configuration

The server and the admin tool are configured by environment variables.

| Variable               | Default                         |                                                                                      |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `JWT_SECRET`           | — (required)                    | Secret for the sessions, 32 characters or more. Without it the server does not start |
| `ACCESS_TOKEN_MINUTES` | `30`                            | How long an access token lasts before it is renewed                                  |
| `REFRESH_TOKEN_DAYS`   | `30`                            | How long a session lasts without asking for the password again                       |
| `COOKIE_SECURE`        | `true` in production            | `false` to serve over plain http on a trusted network                                |
| `PORT`                 | `8787`                          |                                                                                      |
| `HOST`                 | `0.0.0.0`                       | Set it to `127.0.0.1` behind Caddy                                                   |
| `PACHANGUERO_DB`       | `data/pachanguero.db`           | Path of the SQLite file                                                              |
| `PACHANGUERO_BACKUPS`  | `backups/` next to the database | Folder for the backups                                                               |

The admin tool needs only `PACHANGUERO_DB` and `PACHANGUERO_BACKUPS`; it never
reads `JWT_SECRET`.

### The `.env` file

[`.env.example`](../.env.example) lists every variable with an explanation. Copy
it to `.env` at the repository root (it is git-ignored) and put a real secret in
`JWT_SECRET`:

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # paste it as JWT_SECRET
```

- **It is read on its own.** The server (`npm run dev`, `npm start`, `node
server/dist/index.js`) and the admin tool read `.env` at start-up, wherever
  you run them from: the file is found from where the code lives, not from the
  current directory. If there is no `.env`, nothing happens.
- **`--env-file <path>`** (or `--env-file=<path>`) makes either one read that file
  instead of `.env`. A file named like this must exist.
- **The real environment wins.** A variable that is already set (in your shell, in
  a container, in a systemd unit) is never overridden by the file.
- **`npm run seed` does not read it**, on purpose; see below.
- In a container, pass the file to Docker, which reads it itself:
  `docker run --env-file .env …`. `.env` is not copied into the image.

## The admin tool

`pachanguero-admin` creates and looks after the accounts and takes backups. Users
exist only through it; there is no registration (see
[`users-and-roles.md`](users-and-roles.md)).

| Command                                                                  | What it does                                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create --username <name> --role <admin\|regular> [--player <id\|name>]` | Creates a user. A regular user needs a player; an admin may have one                                                                                                 |
| `list`                                                                   | Lists the users: role, player, active or not, locked or not                                                                                                          |
| `reset-pwd --username <name>`                                            | Sets a new password and ends all the user's sessions                                                                                                                 |
| `unlock --username <name>`                                               | Lifts a lock-out after too many wrong passwords                                                                                                                      |
| `activate` / `deactivate --username <name>`                              | Allows or forbids signing in (deactivating ends the sessions)                                                                                                        |
| `link --username <name> --player <id\|name>`                             | Gives a user that has no player its player (ends the user's sessions, so they sign in again). Refuses a user who already has one, or a player who already has a user |
| `promote` / `demote --username <name>`                                   | Makes a user an admin, or a regular user (which needs a player)                                                                                                      |
| `backup`                                                                 | Writes a consistent copy of the live database, see [`backup_and_restore.md`](backup_and_restore.md)                                                                  |

Passwords are never an argument: `create` and `reset-pwd` ask for them on the
keyboard, twice, or read two lines from standard input. A password needs at least
12 characters with an uppercase letter, a lowercase letter, a digit and a special
character. Exit code `0` means done, `1` means refused (the reason is printed),
`2` means misuse (the usage is printed). Run it with no arguments to see the usage.

### How to run it

| Where                              | Command                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The repository (development)       | `npm run admin --workspace=server -- create --username antonio --role admin`                                               |
| A container                        | `docker exec -it pachanguero pachanguero-admin create --username antonio --role admin` (`-i` so the password can be typed) |
| A script (password on stdin)       | `printf '%s\n%s\n' "$PW" "$PW" \| docker exec -i pachanguero pachanguero-admin create …`                                   |
| The Raspberry Pi, outside the unit | `npm run admin --workspace=server -- --env-file /etc/pachanguero.env list`                                                 |

The admin tool must point at the **same database as the server**. On the Pi the
database path is set in the systemd unit, which a shell does not see: put
`PACHANGUERO_DB` in `.env` or in the file you give with `--env-file`, or set it on
the command line. Otherwise the tool falls back to `data/pachanguero.db` inside
the checkout and creates a new, empty database there.

### First admin

With the database created (starting the server does it, or `npm run seed`
imports the season):

```bash
npm run admin --workspace=server -- create --username antonio --role admin
npm run admin --workspace=server -- create --username carlos --role regular --player "Carlos García"
```

An admin created without a player can be given one later with `link --username antonio --player "Antonio"`; that is what turns on "Ver como jugador".

## Container

The repository ships a `Dockerfile` (for x86_64) that builds an image with the
application and the `pachanguero-admin` tool. All configuration comes from the
environment and there are two volumes: `/data` (the database) and `/backups` (the
backups). Deployment files (compose, Kubernetes), an image registry and TLS are
outside the repository.

```bash
docker build -t pachanguero .
docker run -d --init --name pachanguero -p 8787:8787 \
  --env-file .env \
  -v pachanguero-data:/data -v pachanguero-backups:/backups \
  pachanguero
```

- `.env` needs at least `JWT_SECRET`; without it the container exits at start-up
  and the log names what is missing.
- To serve over plain http, with no TLS in front, add `COOKIE_SECURE=false`.
- `--init` makes `docker stop` stop the application at once.
- The image already sets `PACHANGUERO_DB=/data/pachanguero.db` and
  `PACHANGUERO_BACKUPS=/backups`, `PORT=8787`, `HOST=0.0.0.0`.
- Mounting host folders instead of volumes, and taking the backups out, are in
  [`backup_and_restore.md`](backup_and_restore.md).

## Running on the Raspberry Pi

```bash
git clone <repo> /opt/pachanguero && cd /opt/pachanguero
npm ci && npm run build
sudo mkdir -p /var/lib/pachanguero && sudo chown pi /var/lib/pachanguero
sudo cp deploy/pachanguero.service /etc/systemd/system/
sudo systemctl enable --now pachanguero
```

The unit needs `JWT_SECRET` in its environment, for example with an
`EnvironmentFile=/etc/pachanguero.env` line; without it the service does not
start. [`deploy/Caddyfile`](../deploy/Caddyfile) offers three ways to put it behind
the existing Caddy on port 443: a **subdomain** (recommended), a path under the
current site, or another port.

## Trying the app by hand

`npm run seed` imports the 2024/2025 season. If `PACHANGUERO_DB` is set **in the
environment** to a **throwaway** database (another file, not yours), it also
creates three accounts, all with the password `Pachanguero-dev-1`:

| Username  | Role    | Player                              |
| --------- | ------- | ----------------------------------- |
| `admin`   | admin   | none                                |
| `jefe`    | admin   | the player who owes the second most |
| `jugador` | regular | the player who owes the most        |

If the variable is not set, it creates **none**, because that database might be
the real one; this is also why the seed does not read `.env`.

```bash
PACHANGUERO_DB=/tmp/prueba.db npm run seed
PACHANGUERO_DB=/tmp/prueba.db JWT_SECRET=$(openssl rand -base64 48) npm run dev
```

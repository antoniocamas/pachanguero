# Running it, operating it, testing it (Q-06, Q-07, Q-13, Q-14)

Sources: `server/src/index.ts`, `server-app.ts`, `Dockerfile`, `docs/commands.md`, `docs/backup_and_restore.md`, `docs/test-strategy.md`, `server/src/cli/user-cli.ts`, `server/src/repo/auth-config.ts`, `.gitignore`, `README.md`, `AGENTS.md`, `deploy/`.

## Q-06 Running and secrets

- **The app runs only locally today.** `index.ts` starts one Express process on one port against one SQLite file (`PACHANGUERO_DB`), serving the API and the built web app. A `Dockerfile` exists (one image, `/data` and `/backups` volumes, environment-driven); **no compose or Kubernetes files** are shipped (`docs/commands.md`, `docs/backup_and_restore.md`). The deployment target is undecided (Compose or Kubernetes) and the Raspberry Pi is no longer a target.
- **No background job exists.** The only timers-like code concerns the weekly *schedule* of games, not execution; there is no scheduler. A poller would either run inside the server process (works the same under Compose and Kubernetes) or as a separate process, which would share the SQLite file, and `index.ts` explicitly guards against a second server beside the first [`inferred`: a second process writing the same SQLite file is the risky option; one replica with an in-process poller fits both targets].
- **Secrets pattern:** settings come from environment variables, with a git-ignored `.env`, an `--env-file` option for the tools, and `AuthConfig.fromEnv` failing at start if `JWT_SECRET` is missing. An Enable Banking application id and private key would follow the same pattern (the key being a file or a multi-line value, which both Compose secrets and Kubernetes Secrets can supply). Session data and the poll state are not secrets of the same kind and could live in the database [`inferred`], which is backed up.
- **Backups** (`DatabaseBackup.create`): `VACUUM INTO` of the whole database, file mode 0600, before every migration and on `backup`.

## Q-07 Operator commands

`pachanguero-admin` (`server/src/cli/user-cli.ts` over `UserAdminService`) has a flat command set (`create`, `list`, `reset-pwd`, `unlock`, `activate`, `deactivate`, `promote`, `demote`, `link`, `views`, `backup`) documented in `docs/commands.md`; it reads only `PACHANGUERO_DB` and `PACHANGUERO_BACKUPS`, never `JWT_SECRET`, asks for passwords without taking them as arguments, and exits 0, 1 (refused) or 2 (misuse). New commands for the bank (authorise, status, renew) fit this shape. The authorisation needs a browser on the operator's side and the account owner's approval in the Revolut app (WP-005); the redirect page need not load, the operator pastes the address (WP-005 guide).

## Q-13 Testing a feature that depends on an external bank

`docs/test-strategy.md` defines unit (`server/src/domain`, `web/src/lib`), integration (routes against a real SQLite file, no DB mocks) and E2E (Playwright, real server, isolated SQLite). The repository has **no precedent for an external HTTP dependency**. The pieces that fit: recognising a Bizum and matching it are pure domain logic (unit tests with anonymised fixtures like those of WP-005); applying a Bizum to debts is integration (real SQLite, a fake bank reader injected through the composition root `repo/index.ts`); E2E would use a fake reader as well. WP-005 provides a synthetic Bizum dataset and a working sandbox (the Mock ASPSP) that could back an optional contract test outside CI (it needs the network and an application key). The bank's limits and expiry cannot be tested without the real bank.

## Q-14 Doc map

| Document | What stops being true or needs extending |
| --- | --- |
| `docs/domain-model/glossary.md`, `ciclo-del-partido.md` | payment method and the Bizum link; a payment can be created by the system; the `pay` capability |
| `docs/users-and-roles.md` | the disclosure rule for bank data (admin only) |
| `docs/commands.md` | new settings and operator commands; **its Raspberry Pi sections** (running, outside-unit example, systemd) are stale |
| `docs/backup_and_restore.md` | backups now contain bank data; Pi-specific steps are stale |
| `README.md` (Caddy and Pi, around line 52), `AGENTS.md` (Architecture: services, invariants, "single port for the Pi"), `server/src/server-app.ts` (a Pi comment), `deploy/pachanguero.service`, `deploy/Caddyfile` | stale Raspberry Pi statements; AGENTS.md also gains the new components and the payment invariant |
| `docs/test-strategy.md` | the first external dependency and how it is faked |
| `.env.example` | new variables for the bank application |

## Q-15 Blind spot

All answers rest on reading code, documentation and counts. What only a run can show: the real accuracy of matching (needs live shadow running, see matching-and-data), Revolut's real limits and renewal over time (WP-005, Q-11), how the organiser actually handles unmatched senders, and whether the 2025/2026 history has any use (the season is not in the database).

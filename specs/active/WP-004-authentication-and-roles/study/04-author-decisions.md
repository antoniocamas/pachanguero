# Author decisions (Q-11, Q-12, Q-13)

Source: interview 2 with the author, plus the reference deployment the author named,
`~/Workspace/trading/trading-monolith/` (`docs/administration.md`, `docs/infrastructure/DEPLOYMENT.md`,
`.env.example`, `trade4me-front/{Dockerfile,nginx.conf}`, `trade4me-backend/Dockerfile`,
`build-images.sh`).

## Q-11 — Deployment, first admin, password reset

- Deployment moves to **Docker**, modelled on the trading monolith. Superseded by this: the
  systemd unit and the Caddy-on-the-Pi plan in `deploy/`.
- What the reference does, which is the template unless Design says otherwise:
  - One `Dockerfile` per deployable; images built by a script and pushed to a private registry;
    configuration through a `.env` file (JWT secret, token lifetimes) with a committed
    `.env.example` holding fake values.
  - Users are never created through the web. An **admin CLI** run inside the container
    (`docker exec … <tool> <command>`) offers `create`, `list`, `delete`, `reset-pwd`, `unlock`,
    `activate`, `deactivate`, `promote`, `demote`, `update-email`, `stats`.
  - A password policy applied on every password input (12+ chars, upper, lower, digit, special),
    brute-force lockout (`failed_attempts`, `locked_until`), and access plus refresh tokens
    (30 minutes / 30 days there).
- Consequence for this work package: the **first admin and password reset are answered by the
  same mechanism** — a CLI inside the container — so no web bootstrap path is needed. The
  author did not state this directly; it is read from "similar to trading-monolith" and is
  `unverified` until Requirements confirms it.
- The SQLite file must live on a mounted volume so the valuable data survives image rebuilds; the
  automatic backup before a migration then has to write inside that volume.
- Open for Design: whether this runs on the same Kubernetes-plus-registry setup as the reference
  or on plain Docker on the Pi, and where TLS ends (`unverified`).

## Q-12 — What a regular user sees

- **Only their own** debts, payments and statistics, read-only, plus editing their own email
  and phone. **No standings** (nobody else's points). Consequence: Standings, the debts overview,
  the player report picker and Manage are admin-only, and every regular endpoint is keyed to the
  token's own player, never to an id in the request.
- Names in debt rows: a user sees their own debts and, where a share is theirs but another player
  holds it, the **name of that player**, because the user is that player's guest. This is the only
  other person's name a regular user sees. Shares a user holds for anonymous plus-ones show no
  name (they have none).

## Q-13 — Dependency and token storage

Searched in the reference: `trade4me-front/src/services/{api-axios,authApi}.ts`, and in
`trade4me-backend/src/trade4me_backend/`: `api/endpoints/auth.py`,
`authentication/services/{jwt_service,auth_service,password_service}.py`,
`authentication/repositories/auth_repository.py`, `settings.py` (`get_cookie_config`).

- **Adding a JWT library is permitted.** Each dependency is still installed only when the work
  reaches it, with the author's go-ahead at that moment. The reference uses `python-jose` for
  tokens and `argon2-cffi` for passwords; the Node equivalents would be `jose` and `argon2`
  (or built-in `crypto.scrypt`, which needs no package).
- **The reference's scheme, which this work package follows:**
  - Two JWTs signed HS256 with one secret: a short **access token** (30 min, claim
    `type: access`) and a long **refresh token** (30 days, claim `type: refresh`).
  - The access token is held **in memory** in the SPA and sent as `Authorization: Bearer`.
    Nothing is put in `localStorage`.
  - The refresh token travels only in an **HttpOnly cookie**, `Secure` and `SameSite=Strict` in
    production (`Lax`, not `Secure` in development so plain HTTP works), path `/`.
  - Refresh tokens are **stored hashed** in a `refresh_tokens` table (user, hash, expiry, revoked).
    Every refresh **rotates**: the old token is revoked and a new pair issued. Logout revokes the
    token; a password change revokes **all** the user's tokens.
  - The SPA's single HTTP wrapper catches a 401, calls refresh once (queuing concurrent requests
    behind it), retries, and redirects to login if refresh fails.
  - Login: argon2 hashes, a 5-failure counter, a 15-minute lockout (`failed_attempts`,
    `locked_until`); `unlock` is an admin CLI command.
- **Fit with Pachanguero:** the web client already has the one wrapper that scheme needs
  (`call()` in `web/src/api.ts`). The cookie is `SameSite=Strict` and only the refresh route reads
  it, so mutating routes authenticate through the Bearer header and need no CSRF token. This
  closes the cookie-versus-header question: **both, as above**.
- **Not carried over:** the reference has self-registration (`/register`,
  `registration-status`); this work package has none, so those parts are left out.

# Security practice, docs, variants, blind spots (Q-07 to Q-10)

Searched: `AGENTS.md`, `README.md`, `docs/`, `.agents/rules/`, `web/src/pages/*`. Q-07 rests on
general engineering knowledge, not a fresh web search: every claim is marked `inference`.

## Q-07 — "Standard protection" for a home-hosted app

- Passwords: hash with scrypt or argon2id, per-user salt, constant-time compare (`inference`,
  widely documented guidance). Built in with `node:crypto.scrypt`, no dependency.
- Token lifetime: short access token (hours) with expiry; no refresh flow needed for a 40-person
  group if sessions of days are acceptable. Logout cannot revoke a stateless JWT before expiry,
  so keep the lifetime modest and store a per-user `token_version` (or `password_changed_at`) to
  invalidate on password change or user disable (`inference`).
- Storage (superseded: the access-token-in-memory plus HttpOnly refresh cookie scheme is decided, see `04-author-decisions.md`): an `HttpOnly; Secure; SameSite=Strict` cookie avoids script access to the token; an
  `Authorization` header from `localStorage` is simpler but exposed to XSS. The app is
  single-origin (SPA and API on one port), so the cookie is workable (`inference`). With cookies
  mutating routes need CSRF care: `SameSite=Strict` plus a custom header check is enough here.
- Brute force: rate-limit login by IP and by username (in-memory counters are enough on one
  process); uniform error message and response time (`inference`).
- Hardening: `express.json` body limit, security headers (CSP, `X-Content-Type-Options`), no
  stack traces to clients, JWT secret from the environment and refusing to start without it
  (`inference`).
- Dependencies: cookie parsing and header hardening can be hand-written in a few lines; a JWT
  library is the one dependency worth taking. All need explicit permission to install.

## Q-08 — Doc map (documents this work package makes untrue)

- `AGENTS.md`: "no migration system" paragraph under `server/src/db/`; the Architecture list (new
  auth/user classes, route guard); "Identity" ("replaces the spreadsheet", no mention of users);
  the Commands block if a bootstrap-admin script is added.
- `README.md`: configuration table (new env vars: JWT secret, cookie settings), deployment text
  that assumes an open LAN app, and the `HOST` note.
- `docs/test-strategy.md`: how E2E specs authenticate; route tests with tokens.
- `docs/domain-model/` (Spanish): needs a new page for users and roles (not an existing rule
  made false, an absence). `glossary.md` gains user/role/admin/regular.
- `deploy/pachanguero.service` and `deploy/Caddyfile`: replaced by the Docker deployment (see `04-author-decisions.md`); new `Dockerfile`, env file and build script; README deployment section rewritten.
- `.agents/rules/coding-standard.md` and `frontend-coding-standard.md`: not made untrue, but
  govern how the new code is written (classes on the server, hooks on the web).

## Q-09 — Variant inventory

- Other readers of the same data the regular role must not reach: the Debts tab with the
  WhatsApp copy (everyone's debts), Standings (everyone's points), the player report page (picks
  any player), Manage (players, merge, schedule, seasons).
- Other actors that call the API: Playwright specs; `server/scripts/import-season.ts` writes via
  repositories directly, not HTTP, so it is unaffected.
- The `regular` home view: debts as holder and as beneficiary, payments, player report for self.
  Whether Standings (everyone's points) is visible to regulars is a question for the author.
- Variant: a user disabled or a player merged or removed after the account exists.
- No variant beyond these found in the service classes: auth sits at the HTTP edge only.

## Q-10 — Blind spots of this Study

- It read code and counted rows; it cannot observe how the group will behave (forgotten
  passwords, shared phones, who is actually reachable by email).
- Security guidance here is recalled, not freshly sourced; a library choice should be checked
  against current advisories before Design settles it.
- It did not test the Caddy setup or the Pi: only what the repo says about them.
- Carried to the author: first-admin creation, password reset, what regulars can see besides
  their own data, whether contact data (email) is used for anything beyond display.

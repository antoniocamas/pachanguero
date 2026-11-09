# Pachanguero

## Identity

Pachanguero replaces the `Futbol_Miercoles` spreadsheet + Apps Script for a Wednesday 7-a-side football group: sign-ups, payments, and selecting the 14 who play when more than 14 sign up. The README, `AGENTS.md` and every document outside `docs/domain-model/` are in English; only the domain vocabulary stays Spanish (convocatoria, mercy seat, jugón, the game states…). `docs/domain-model/` is written in Spanish, and user-facing strings in the app are Spanish too: write UI copy in Spanish. Roles, accounts and views: `docs/users-and-roles.md`.

### Project Profile

- **Scale:** small. Three npm workspaces (`server`, `web`, `e2e`), about 55k lines of TypeScript (server 39k, web 14k, e2e 2k), tree five levels deep.
- **Conventionality:** standard. React 19 + Vite, Express, SQLite (`better-sqlite3`), vitest and Playwright: an agent that knows them finds its way. The object-oriented style of `server/src` is bound by a rule, not by convention.
- **Context budget:** not small. The repository does not fit a context window; documents are loaded on demand.

## Repository structure

- `server/` — API, game rules, SQLite (`server/AGENTS.md`)
- `web/` — React SPA (`web/AGENTS.md`)
- `e2e/` — Playwright tests against the real server (`e2e/AGENTS.md`)
- `docs/` — system documents; `docs/domain-model/` holds the game rules (Spanish)
- `specs/` — work packages (`specs/AGENTS.md`)
- `deploy/` — Helm chart and `deploy.sh`; `Dockerfile` and `build.sh` build the image
- `scripts/` — release and production-copy scripts
- `ai-kit/` — the project's skills; `.agents/rules/` — the rules
- `data/` — seed CSVs and local databases

## Constraints

- **No lint rule is downgraded, disabled or skipped without asking first.** If a rule flags something and the real fix seems out of scope, expensive or wrong, stop and ask: never lower a severity, add an `eslint-disable` or route around it. A pre-commit hook (lint-staged, then `npm test --workspace=server`) gates every commit; never bypass it.
- **Use the skill before the work:** `skill: pachanguero-release` before any version bump, image build or push, tag or deploy; `skill: pachanguero-deployment-management` before any `kubectl` or `helm` operation, including refreshing the kubeconfig; `skill: pachanguero-3pp-update` before updating any third-party version (decisions taken: `.3pp-management.md`); `skill: pachanguero-setup-production-copy` before copying, refreshing or querying the production copy.

## Rules

- `.agents/rules/deployment-impact.md` — Read before changing a setting (environment variable), a secret, a port, a volume, backups, the `Dockerfile`, the build layout or the Helm chart
- `server/AGENTS.md`, `web/AGENTS.md` and `e2e/AGENTS.md` list the rules for their code

## System documents

- `docs/architecture.md` — Read when designing a change that crosses layers
- `docs/test-strategy.md` — Read when planning how a feature is tested or choosing the type of a test
- `docs/deployment.md` — Read when planning a release or a change to production

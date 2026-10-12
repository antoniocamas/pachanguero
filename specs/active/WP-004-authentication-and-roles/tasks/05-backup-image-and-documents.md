# Task 05 — Backup at will, the Docker image and the documents

## Type

**Feature.** Iteration 1. Elements absorbed: **F10, F11, F14**. Depends on: tasks 03 and 04 (the CLI,
the settings and the behaviour the documents describe).

## Mandatory Reading

- `AGENTS.md`
- `.agents/rules/coding-standard.md`
- `docs/test-strategy.md`
- `DESIGN_PLAN.md` §3, subsections `F10`, `F11`, `F14`; §4 (Documentation Impact, per document)
- `REQUIREMENTS.md` UC-004-10-S1…S4
- Docker documentation for `docker build`, `HEALTHCHECK`-free multi-stage builds and `docker run -v`
  (add what you relied on when done).
- Discover, via the project's own documentation-routing rule, any guideline covering `server/src/cli/`,
  the repository root files and `docs/`.

## Description

The operator can write a backup of the live database at will (`pachanguero-admin backup`), the
repository builds a container image for this machine (x86_64; ARM is not a target of this work), with
every setting in `.env.example`, and the documents say what the system now does. The deployment target
is out of scope: no compose or Kubernetes files, no registry, no TLS.

## Guidelines

1. **F10** — add `backup` to `UserCli` and `main.ts`, using `DatabaseBackup` from task 01; the backup
   directory is `PACHANGUERO_BACKUPS`.
2. **F11** — `Dockerfile` (multi-stage on `node:26-slim`, matching `.nvmrc`), `.dockerignore`,
   `.env.example` (placeholder shorter than the minimum secret length, so an unedited copy does not
   start), the `dev` script change in `server/package.json` (reads `../.env`), and the `.env.example` drift test.
3. **F14** — only what tasks 01, 03 and 04 did not already change: review `AGENTS.md` and
   `docs/test-strategy.md` against the code and complete them (the domain-invariants bullet),
   `README.md` (configuration table, backup paragraph replaced, "Usuarios y acceso" section, one
   sentence about `JWT_SECRET` under the deployment section, and how to try the app by hand: `npm run seed`
   with `PACHANGUERO_DB` set to a throwaway database also creates `admin`, `jefe` and `jugador` with the
   password `Pachanguero-dev-1`, and creates none when the variable is unset because the database may be a real
   one), `docs/domain-model/glossary.md` and
   `README.md`, the two new Spanish documents `docs/domain-model/usuarios-y-roles.md` and
   `docs/backup_and_restore.md`, and one comment line in `deploy/pachanguero.service`. No document may
   name this work package or its identifiers. Spanish for README and domain documents, English for
   `AGENTS.md` and `test-strategy.md`.
4. Run the Manual Test Plan with a Docker daemon; if none is reachable, report it and stop at the point
   reached.

## Tests

Testability: F10 fully automatable; F11 partly; F14 not (HLD 2.10).

- Integration: backup cases in `user-cli.test.ts` (a database with unflushed WAL rows; a failing
  destination), the `.env.example` drift cases in `auth-config.test.ts` (every key the code reads is
  listed; the example values do not start a server).
- Mechanical: `npm run format:check`.

## Manual Test Plan

1. `docker build -t pachanguero .` completes on this machine.
2. `docker run` with no `JWT_SECRET`: the container exits non-zero and the log names the missing key.
3. With a real secret and two named volumes: `POST /api/auth/refresh` without a cookie answers 401, `/`
   serves the app, and `docker exec -i <container> pachanguero-admin create --username … --role admin`
   (password on stdin) creates a user who can log in.
4. Create a player, run `docker exec <container> pachanguero-admin backup`: the file appears in the
   `/backups` volume and can be read from the host.
5. Remove and recreate the container on the same volumes: the user, the player and the backup remain.
6. Follow `docs/backup_and_restore.md` to restore a backup onto a copy of the database; note any step
   that needs knowledge the text does not give.
7. Follow the README "primer administrador" steps on a clean checkout as a stranger would.

## Definition of Done

- [ ] Backup cases pass; the Manual Test Plan above is done and its outcome reported (steps 1 to 5
      need a Docker daemon: say so if absent).
- [ ] Every command and setting named in the documents exists and runs as written; no document still
      says the old thing listed in §4 of the design.
- [ ] **Graduation:** UC-004-10-S1, S2, S3 are hard requirements → the backup cases in
      `user-cli.test.ts`; UC-004-10-S4 is a hard requirement → `docs/backup_and_restore.md`.
- [ ] **Hard requirements:** each scenario with a test has a test whose title says what it asserts, with
      no work-package identifier in the code; this line is the record.
- [ ] **Documentation:** all of §4 of the design lands here or in tasks 01, 03 and 04, which carry
      the passages they break: `README.md`, `docs/backup_and_restore.md` (new),
      `docs/domain-model/usuarios-y-roles.md` (new), `docs/domain-model/glossary.md`,
      `docs/domain-model/README.md` (index row), `AGENTS.md` (domain invariant), `deploy/pachanguero.service`.
      The seed's test accounts (when they are created, why never on the default database, their names and
      password) are documented in `README.md` (Spanish); the `AGENTS.md` Commands line already says it.
- [ ] **Tests:** `npm test` and `npm run format:check`.
- [ ] **Regression:** `npm test`; the closing regression task 06 runs the E2E.
- [ ] **Code checks:** `npm run lint` and `npm run format:check` pass on every touched file.

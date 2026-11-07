# Backups in pachanguero (study answers: Q-01, Q-04, Q-05, Q-13)

Searched: server/, web/, e2e/, scripts/, deploy/, docs/, ai-kit/, Dockerfile, build.sh, README.md, AGENTS.md, .env.example (grep -i backup, `PACHANGUERO_BACKUPS`, `timestampOf`, `VERSION`, `npm_package`), then read the hits. `.agents/` has no backup mention (grep found none; `.agents/rules/*` not otherwise read: inference that it names nothing). `web/` has no hit. Closed/concluded specs under specs/ mention backups historically; not treated as live consumers.

## Q-01

Today the name is `pachanguero-<local YYYYMMDD-HHMMSS>[-<label>][-<n>].db`, written as `<target>.part` then renamed (`DatabaseBackup.create` / `freeName`). Everything below that touches names:

Code
- `server/src/db/database-backup.ts` (`DatabaseBackup`): writes, `VACUUM INTO` a `.part` file, chmod 0600, rename; dir 0700; `freeName` adds `-2`, `-3` on collision. Never prunes. Must change: new name `<kind>_<UTC>_<version>.db`, temp name `.`-prefixed instead of `.part` suffix (hidden file; a `.part` stale-file cleanup `rmSync(partial)` must follow the new temp name), a `kind` parameter replacing the free `label` string (today `label` is `before-migration` or absent), a UTC timestamp, a version input. The `-n` collision suffix would break the 3-field grammar (`_`-split) unless the version/timestamp rule changes; `inference`: collision rule needs a decision (same second, same kind, same version).
- `server/src/db/schema-migrator.ts` (`MigrationBackup.create(label?: string)`, called as `this.backup.create('before-migration')` in `SchemaMigrator.run`): interface signature and literal must become kind `release`.
- `server/src/cli/user-cli.ts` (`BackupWriter.create()`, `UserCli.backup` prints `✓ <path>`): no label; becomes kind `periodic` by default. The `✓ ` line is parsed by `scripts/prod-copy.sh`, so its output format must stay.
- `server/src/cli/main.ts`: builds `new DatabaseBackup(db(), BACKUP_DIR, new SystemClock(), new LocalCalendar())`; needs the version and drops LocalCalendar if UTC comes from the Clock.
- `server/src/db/index.ts`: `BACKUP_DIR` (from `PACHANGUERO_BACKUPS`, default `backups/` beside the DB) and the second `DatabaseBackup` for the migrator.
- `server/src/db/test-support.ts`: `NoBackup implements MigrationBackup` (throws; only interface shape matters).
- `server/src/domain/local-calendar.ts` `timestampOf`: local time, `YYYYMMDD-HHMMSS` with a dash; contract wants `YYYYMMDDTHHMMSSZ` UTC (see Q-05).

Tests asserting names (all break)
- `server/src/db/database-backup.test.ts`: `names the copy after the moment and the label` (expects `pachanguero-20261011-193000-before-migration.db` and `pachanguero-20261011-193000.db`; FixedClock is local `new Date(2026, 9, 11, 19, 30, 0)`, so UTC expectations depend on TZ unless the clock is made UTC); `never overwrites a backup that exists` (expects `-2`, `-3`); `replaces a stale partial file left by an earlier failure` (plants `pachanguero-20261011-193000.db.part`); `throws and leaves no partial file...` (expects empty dir, still valid); permission, WAL and directory tests are unaffected by naming.
- `server/src/db/schema-migrator.test.ts`: `starting the same file twice makes one backup and no more` (two `toEqual` on `pachanguero-20261011-193000-before-migration.db`); other tests only use `readdirSync(backupDir).length` / `[0]` (name-agnostic, but `[0]` would pick a hidden temp file if one lingered). `backupFor` builds `new DatabaseBackup(conn, backupDir, new FixedClock(), new LocalCalendar())`: constructor change.
- `server/src/cli/user-cli.test.ts`, `describe('backup')`: `prints the path of a timestamped copy...` asserts `/^pachanguero-\d{8}-\d{6}\.db$/`; uses `ManualClock(2026-10-11T10:00:00Z)` + `LocalCalendar`; other cases use `readdirSync(...)[0]`. The first `cli(...)` helper default `backups` is also a `DatabaseBackup`.
- `server/src/domain/local-calendar.test.ts`: tests `timestampOf` (local); stays valid only if `timestampOf` is kept; delete if the method is removed.
- `server/src/deployment-settings.test.ts` (class Repository, `accounts for every variable the server reads`): if the version is read from a new env var in `server/src`, the test fails unless the Dockerfile or chart sets it (chart will; that is the plan) or it is listed in `LEFT_TO_APPLICATION_DEFAULT`.

Chart
- `deploy/helm/pachanguero/templates/deployment.yaml`, `backup` sidecar: loop at `backup.hourUtc`, runs `pachanguero-admin backup`, then prunes with `ls -1t /backups/pachanguero-[0-9]*.db | grep -v before-migration | tail -n +$((keep+1)) | xargs -r rm -f`. Under the plan: delete the prune line (sidecar stops pruning); the glob `pachanguero-[0-9]*.db` would match nothing with the new names, so left in place it would silently prune nothing (not dangerous, but dead); mtime ordering and `grep -v before-migration` no longer meaningful (`release_` files). Hidden temp files do not match `ls` without `-a`. The sidecar container also needs the version env (same image as app).
- `values.yaml` `backup.keep` ("manual backups kept; before-migration backups are never pruned"): obsolete; `backup.enabled`, `hourUtc` stay. `deployment-settings.test.ts` does not look at `backup.keep` (inference: it reads env names only).

Scripts
- `scripts/prod-copy.sh`: `--fresh` runs `pachanguero-admin backup` in container `pachanguero` and extracts the path with `sed -n 's/^✓ //p'`; default picks `ls -1t /backups/pachanguero-*.db | head -n 1` in container `backup`, then `kubectl cp` from the pod (`-c backup`). Breaks: glob matches nothing after the rename; with a hostPath it still works in-pod but the mtime choice also catches `release_` files (which is the "newest" by mtime, arguably fine) and could in theory pick a hidden temp (it won't: `ls` hides dotfiles, glob `*` does not match leading dot). Must change glob to `*_*.db` or `periodic_*.db` and ideally sort by name (UTC timestamp sorts) rather than mtime. `--from <file>` unaffected. Also writes `PACHANGUERO_BACKUPS=$DIR/backups` into the generated env file (local, unaffected).

Docs
- `docs/backup_and_restore.md`: "Two kinds of backup" table with both names; example `✓ /backups/pachanguero-20261012-091054.db`; "The application never deletes them... `-2`, `-3`" and the sidecar prunes sentence; docker run with `pachanguero-backups` volume; `docker cp pachanguero:/backups/pachanguero-20261012-091054.db`; restore commands (Pi `cp backups/pachanguero-...db`; docker alpine `cp /backups/pachanguero-...db`). All names and the pruning statement must change.
- `docs/deployment.md`: `## Data and backups` (two PVCs, sidecar keeps `backup.keep`, "Copying /backups to papiros is not automated yet"); `## Deployment impact of a change` row for "`pachanguero-admin backup`, backup file names or folder" (lists sidecar globs, prod-copy newest `pachanguero-*.db`, the two docs) and the row about the `/data` and `/backups` volumes; Success/rollback text naming `…-before-migration.db`; `## Restoring a backup on erebor` (`$K cp <pod>:/backups/<file>.db <file>.db -c backup`).
- `docs/commands.md`: `PACHANGUERO_BACKUPS` row, `backup` command row, `## Container` docker run with `-v pachanguero-backups:/backups`, prod-copy `--fresh` text.
- `docs/domain-model/glossary.md` (copia de seguridad entry, Spanish): "a mano con `pachanguero-admin backup` y sola antes de cambiar la estructura"; no file names, probably fine (inference).
- `docs/users-and-roles.md`, `README.md`: only link/mention `backup`; no names.
- `AGENTS.md` (Architecture, `server/src/db/`): states the name `pachanguero-<time>-before-migration.db`; must change. Command list mentions `backup` (unchanged).
- `.env.example`: comment says the image sets `/data` and `/backups` as its two volumes (needs rewording; var itself stays).
- Skills: `ai-kit/skills/pachanguero-release/SKILL.md` step 8: `kubectl ... exec deploy/pachanguero -c pachanguero -- ls /backups` looking for a new `…-before-migration.db` (the mount path stays `/backups`, but the file is now `release_*`; wording changes; with hostPath one could also `ls` on erebor). `ai-kit/skills/pachanguero-deployment-management/SKILL.md`: logs of `-c backup` (unchanged) and points to docs. `ai-kit/skills/pachanguero-setup-production-copy/SKILL.md`: `--fresh` writes a backup in the pod; unchanged in meaning (it now lands on the hostPath where the shipper will take it).

Not present: `Dockerfile`/`build.sh`/e2e name no backup file (see Q-04 for mount parts); `web/` none; `deploy/deploy.sh` none (grep).
Also found: untracked `data/backups/` (dev, old-format names such as `pachanguero-20261011-232901-manual.db`) and `pre-upgrade.db` at repo root; old-format files already on disk will coexist with the new names (they will not match the shipper's grammar: `unknown`, depends on the shipper).

Signal: expected

## Q-04

Other dependents of `/backups`, the PVC or `PACHANGUERO_BACKUPS`:
- `Dockerfile` (final stage): `ENV PACHANGUERO_BACKUPS=/backups`; `RUN mkdir -p /data /backups && chown node:node /data /backups`; `VOLUME ["/data", "/backups"]`; header comment. With a hostPath the mkdir/chown/VOLUME are harmless; `VOLUME` makes Docker create an anonymous volume when run without a mount (inference, standard Docker behaviour). Keep `/backups` as the in-container path so nothing else changes. The hostPath dir is owned smaug uid 1000, mode 750 (`specs/active/WP-007-backups-and-currency/study/erebor-state.md`, Q-03): matches pod `runAsUser: 1000`. Note mode 750 vs app's 0700 dir creation: `mkdirSync(..., mode 0o700)` only applies if absent; the dir exists so its 750 stays; files are 0600 owned by uid 1000, so the shipper must run as uid 1000 (state file says it does).
- `deploy/helm/pachanguero/templates/deployment.yaml`: `volumeMounts` `backups` -> `/backups` in both containers; `volumes: backups` -> PVC `pachanguero-backups`. Becomes `hostPath: {path: /var/backups/erebor/pachanguero, type: Directory}`. fsGroup 1000 has no effect on hostPath (inference); relies on directory ownership.
- `deploy/helm/pachanguero/templates/pvc.yaml`: second document `pachanguero-backups`, with `helm.sh/resource-policy: keep`. Removing it from the template does NOT delete the PVC (keep policy and, anyway, helm only deletes resources it tracks; with keep annotation it is orphaned on upgrade, not deleted). Explicit `kubectl delete pvc` is a separate, later step.
- `values.yaml`: `storage.backupsSize: 2Gi` (remove) and `backup.keep` (remove). Chart has no values schema file seen (inference: `ls templates` shows no values.schema.json; not checked at chart root beyond Chart.yaml).
- `scripts/prod-copy.sh`: see Q-01 (exec/cp use container `backup` and path `/backups`); with the hostPath, `scp` from erebor would also work (`inference`).
- `docs/commands.md` `## Container` and `docs/backup_and_restore.md` `### In a container`: docker run with named volume `pachanguero-backups`; restore recipe with `-v pachanguero-backups:/backups`. `docs/deployment.md` `## Data and backups` and `## Restoring a backup on erebor`. `.env.example` comment. `ai-kit` release skill (`ls /backups`).
- e2e/test support: `e2e/playwright.config.ts` sets `PACHANGUERO_DB: testDb` and no `PACHANGUERO_BACKUPS` (grep), so backups default to `backups/` beside the test DB; no e2e spec touches backups. Server tests use temp dirs and pass the directory into `DatabaseBackup` directly (no env). `server/src/deployment-settings.test.ts` checks env names read by the server against Dockerfile+chart; `PACHANGUERO_BACKUPS` is set by the Dockerfile `ENV`, so removing the Dockerfile `ENV` would require the chart to set it.
- `server/src/cli/production-copy-guard.ts` / `scrub-production-copy.ts` (untracked, new): matched only `PACHANGUERO_DB`; no backup dependence (grep).

How to move the backups already in the PVC (procedure; do not run):
1. Pre-check: `$K get pvc pachanguero-backups`, note size; `$K exec deploy/pachanguero -c backup -- ls -la /backups` and count/sizes (old names `pachanguero-<local-ts>[-before-migration].db`). Confirm host dir exists, writable by uid 1000 (erebor-state.md Q-03 says yes).
2. Copy out while the old pod still runs (read-only, no downtime): `$K cp pachanguero/<pod>:/backups/. ./pvc-backups -c backup` (the sidecar stays up even if the app crashes; deployment.md already uses `kubectl cp ... -c backup`). Alternative that avoids tar-in-pod (the image is node:slim, tar present: unknown) is to read the data volume from the node: `inference`, k3s local-path/data-disk path unknown.
3. Verify: count, sizes, and `sqlite3`/`PRAGMA integrity_check` locally (container has no sqlite3, so check on the workstation); keep the local copy as the safety copy.
4. Rename to the new grammar before putting on the host: map local timestamp -> UTC (erebor timezone must be known: `unknown`, state file not checked for TZ; the old names are local time of the process, and in the container TZ is probably UTC since node:slim sets none, `inference`). `…-before-migration` -> `release`, others -> `periodic`, version: the old files have none (`unknown`: choose a placeholder or derive from `PRAGMA user_version`/deploy history; the `before-migration` ones are before 0.2.0/0.3.0 upgrades, `inference`).
5. Place into `/var/backups/erebor/pachanguero/` as uid 1000 (scp as smaug, mode 0600), write under a dotted temp name then `mv` so the shipper never ships a partial file (same rule as the app).
6. Only then deploy the new chart (hostPath replaces PVC). The old PVC stays (resource-policy keep) as a second copy until the shipper has shipped everything and a restore from the new location has been rehearsed; delete it by hand much later after the user's say-so.
7. Rollback: redeploying the previous chart revision re-mounts the PVC unchanged.
Risk to flag: switching the mount while the app still starts with `/backups` empty is harmless (migration backup goes to the host dir), but a migration release done in the same deploy writes its `release_` file only to the hostPath.

Signal: expected

## Q-05

Where the version lives today:
- `package.json` (root): `"version": "0.3.0"` (only package with a version line; `server/package.json` and `web/package.json` have none per grep).
- `deploy/helm/pachanguero/Chart.yaml`: `version: 0.3.0`, `appVersion: '0.3.0'`.
- `build.sh`: `VERSION` parsed from root `package.json` by grep/sed; tags `pachanguero:<VERSION>` and `:latest`, pushes to the registry.
- `templates/deployment.yaml`: `$image = registry/name:(default .Chart.AppVersion .Values.image.tag)`; `deploy/deploy.sh --tag X` sets `image.tag`. So the deployed version is `image.tag` if given, otherwise `appVersion`; they can differ from package.json (e.g. `--restart` dev flows, `latest`; inference).
- Runtime: no read of the version anywhere in `server/src` or `web/src` (grep for `VERSION`, `npm_package`, `package.json` found only `LATEST_SCHEMA_VERSION`, the schema integer). The image copies root `package.json` to `/app/package.json` (Dockerfile final stage), so a runtime read is possible; `npm start` in dev also has `npm_package_version` (inference).
- Not in `.env.example`.

Options (inference): chart env `PACHANGUERO_VERSION` = `default .Chart.AppVersion .Values.image.tag` in both containers (the sidecar runs the same image and takes the same env); matches the plan and the deployed tag. Dev/CLI outside the chart: unset, so a fallback (read `/app/package.json`, or literal `dev`) must be chosen; `deployment-settings.test.ts` will require the chart to set it (it will). A `--tag latest` deploy would produce version `latest` (decision needed).

SchemaMigrator wiring (`server/src/db/index.ts`, `db()`): creates `new DatabaseBackup(conn, BACKUP_DIR, new SystemClock(), new LocalCalendar())` and passes it as the last (5th) argument of `new SchemaMigrator(conn, schema, LATEST_SCHEMA_VERSION, [migration steps], backup)`; `SchemaMigrator.run` calls `backup.create('before-migration')` for any file with a stored `user_version` below latest (including 0). A new file gets schema.sql and no backup. `db()` is a singleton, also used by `pachanguero-admin` (`cli/main.ts` calls `db()` so the admin tool can also trigger a before-migration backup, then creates a second `DatabaseBackup` for `backup`).

Which version a before-migration backup should carry (inference): the backup holds the OLD data and is made by the NEW code. Two candidates: the running app version (new, from env) = which release created it; or the data's previous app version (unknown, the database does not store the app version; only `PRAGMA user_version`). The plan's env var gives the new version; if the contract meant "version to roll back to" it cannot be known from the file. Flag for the author: `release_<ts>_<new version>.db` restores to "the data before <new version>". The rollback text in `docs/deployment.md` uses the previous tag with this file, so the name should make clear that the version is the one that made it (`unknown`: contract wording not checked here).

Timestamp today: `LocalCalendar.timestampOf(d)` (`server/src/domain/local-calendar.ts`) uses `getFullYear/getMonth/getDate/getHours...`: process-local time, format `YYYYMMDD-HHMMSS`. `DatabaseBackup` composes `calendar.timestampOf(clock.now())`. The contract (`YYYYMMDDTHHMMSSZ`, UTC) needs either a new method (e.g. via `toISOString()` and stripping `-:.`) or a UTC variant; local-calendar.test.ts tests the local one with `new Date(y, m, d, h, mi, s)`. Other `LocalCalendar` users (api.ts, candidate-resolution-service.ts, own-data-service.ts, payment-service.ts) use it for local dates, so do not change `timestampOf` semantics without checking they do not call it (grep: only `database-backup.ts` calls `timestampOf`; unverified for the dynamic uses, inference).

Clock abstraction: `server/src/domain/clock.ts` (`Clock.now(): Date`, `SystemClock`); test helper `server/src/domain/clock-test-support.ts` (`ManualClock(Date)`, `advance(ms)`); ad hoc `FixedClock` classes inside `database-backup.test.ts` and `schema-migrator.test.ts` (local-time constructor `new Date(2026, 9, 11, 19, 30, 0)`, TZ-dependent for UTC assertions: switch to `new Date(Date.UTC(...))`). `user-cli.test.ts` already uses `ManualClock` with an ISO Z instant. Container TZ: not set in Dockerfile or chart (grep), so local = UTC in production (inference); in dev it differs, so tests must pin UTC explicitly.

Signal: surprising
(The surprise: the app never reads its own version at runtime, and a before-migration backup is made by new code over old data, so "version" is the new release unless the file's own history is recorded.)

## Q-13

Pachanguero-side inventory of `DatabaseBackup`, `MigrationBackup`, `BackupWriter`:
- `DatabaseBackup` (class, `server/src/db/database-backup.ts`; implements `MigrationBackup`; satisfies `BackupWriter` structurally):
  - production constructors: `server/src/db/index.ts` (`db()`, for the migrator, with `BACKUP_DIR`), `server/src/cli/main.ts` (for `UserCli`'s `backup`).
  - tests: `server/src/db/database-backup.test.ts`; `server/src/db/schema-migrator.test.ts` (`backupFor`); `server/src/cli/user-cli.test.ts` (default `backups` param and `writer()` in `describe('backup')`).
- `MigrationBackup` (interface, `server/src/db/schema-migrator.ts`, `create(label?: string): string`): consumed by `SchemaMigrator` (constructor 5th param); implemented by `DatabaseBackup`, `NoBackup` (`server/src/db/test-support.ts`, used by `TestDatabase.create`, i.e. every repo/route test database), `FailingBackup` (`schema-migrator.test.ts`).
- `BackupWriter` (interface, `server/src/cli/user-cli.ts`, `create(): string`): consumed by `UserCli` (constructor `backups`), exercised by `user-cli.test.ts`; implemented by `DatabaseBackup`.
- Variant inventory: exactly two behaviours today, (a) migrator: label `before-migration`; (b) CLI/sidecar: no label. Nothing else (web, e2e, repo services, bank, routes) calls them. The sidecar is just `pachanguero-admin backup` through (b). Under the plan these become kinds `release` and `periodic`: replace the free `label` by a closed kind and split the two interfaces' signatures accordingly (`MigrationBackup.create()` implicitly release, `BackupWriter.create()` implicitly periodic) to keep fakes (`NoBackup`, `FailingBackup`) trivial: design suggestion, inference.
- Other code that writes copies of the DB without `DatabaseBackup`: none found in server/ (grep for `VACUUM INTO` is only in database-backup.ts, inference from the backup grep list). `scripts/prod-copy.sh` makes a local copy `incoming.db` that is not a backup.

Signal: expected

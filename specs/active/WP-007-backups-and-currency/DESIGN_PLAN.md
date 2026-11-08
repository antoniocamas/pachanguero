# Design — WP-007-backups-and-currency

**Artifact types:** code (server classes, shell scripts), infrastructure (Helm chart, Dockerfile),
skills, system documentation.

**Depth: medium.** What is at stake: the group's only copy of its data, but the app is not critical,
the change is mostly small and reversible, and a wrong backup name is found the day the shipper logs
nothing. **Budget:** the HLD about four pages; each element's Low Level Design one page or less. Past
that, I ask first.

## 1. Current Implementation

Evidence is tagged per *Grounding*; the study's answers (`study/*.md`) are cited as `verified — document`.

- **Backup writer.** `DatabaseBackup.create(label?)` writes `VACUUM INTO <target>.part`, chmods 0600,
  renames, and picks the free name `pachanguero-<local time>[-label][-n].db`
  (`server/src/db/database-backup.ts:23-47`, `verified — source`). Three callers: the migrator
  (`schema-migrator.ts:46`, label `before-migration`), `pachanguero-admin backup`
  (`cli/user-cli.ts:179-182`, prints `✓ <path>`), and the composition in `db/index.ts:33` and
  `cli/main.ts:31` (`verified — source`). `LocalCalendar.timestampOf` is local time and is used for
  backup names only by this class (`verified — source`, grep).
- **Chart.** Two PVCs (`templates/pvc.yaml`); a `backup` sidecar that runs `pachanguero-admin backup`
  daily (UTC) and then **prunes** with `ls -1t /backups/pachanguero-[0-9]*.db … | xargs rm`
  (`templates/deployment.yaml:61-85`); `/backups` mounted from `pachanguero-backups` in both
  containers; no version in the environment (`verified — source`). The image tag is
  `default .Chart.AppVersion .Values.image.tag` (`deployment.yaml:1`).
- **Build and deploy.** Both Dockerfile stages are `FROM node:26-slim` with no OS refresh; `build.sh`
  has no `--pull`; `deploy.sh --tag` accepts any string, including `latest` (`verified — source`).
- **Production copy.** `scripts/prod-copy.sh` finds the newest `pachanguero-*.db` in the sidecar and
  copies it with `kubectl cp -c backup` (`prod-copy.sh:50-59`, `verified — source`).
- **The shipper** accepts `^(release|periodic)_[0-9]{8}T[0-9]{6}Z_[A-Za-z0-9.+-]+\.[a-z0-9.]+$`,
  trims staging itself only for files already on papiros, and mounts staging read-write as uid 1000
  (`study/shipper-and-restore.md`, `verified — document`). `/var/backups/erebor/pachanguero/` exists,
  uid 1000, mode 750 (`study/erebor-state.md`, `verified — invocation` by the study).
- **Currency.** Nothing refreshes OS packages or reports out-of-date pins (`study/gates-release-docs.md`
  Q-11, `verified — document`). The release skill checks tests, lint, format, chart lint and an image
  build, then deploys; it checks no image run and no running service beyond the manual list in
  `docs/deployment.md`.

## 2. High Level Design

### 2.1 Architecture

Components, each a grouping of the units it names (`[diagram](design/diagrams/components.puml)`):

| Component | Units (physical) |
|---|---|
| **Backup writer** | `server/src/db/database-backup.ts`, `schema-migrator.ts`, `index.ts`; `server/src/cli/user-cli.ts`, `main.ts`; new `server/src/domain/backup-name.ts`; their tests |
| **Chart** | `deploy/helm/pachanguero/templates/{deployment,pvc}.yaml`, `values.yaml`, `Chart.yaml` |
| **Build** | `Dockerfile`, `build.sh`, `deploy/deploy.sh` |
| **Release flow and checks** | `ai-kit/skills/pachanguero-release/`, `ai-kit/skills/pachanguero-deployment-management/`, new `scripts/verify-release.sh`, `docs/test-strategy.md` row |
| **Currency** | new `ai-kit/skills/pachanguero-3pp-update/`, the pins it moves (`Dockerfile`/`build.sh` base tag, the `package.json` files, `package-lock.json`) |
| **Production copy** | `scripts/prod-copy.sh`, `ai-kit/skills/pachanguero-setup-production-copy/` |
| **Shipper entry** | `trade4me-server/k8s/charts/backup-shipper/values.yaml` (and its redeploy) |
| **Repository documents** | `AGENTS.md`, `docs/{deployment,backup_and_restore,commands,test-strategy}.md`, `.env.example`, `Dockerfile` header comment |
| **Infrastructure documents** | `home-network-map/services/{pachanguero,backup-shipper,rsync-papiros}/info.md`; `trade4me-server/docs/deployment/backup-contract.md` |

Logical grouping and physical grouping coincide except for UC-007-02 (recovery), which has no unit of
its own: it is carried by the Shipper entry, the Repository documents and an operator procedure
(F7, F9).

### 2.2 Approach

The backup writer gains a small domain class, `BackupName`, that makes the only names the shipper
accepts (`<kind>_<UTC>_<version>.db`, kind `periodic` or `release`, collision counter inside the
version part); `DatabaseBackup` is created with a version and takes a kind per call, and the CLI
`backup` takes `--kind` and `--version`. The chart keeps the `backup` sidecar (UC-007-01 names it) but
replaces the `pachanguero-backups` PVC with a `hostPath` of `/var/backups/erebor/pachanguero`, still
mounted at `/backups`, sets `PACHANGUERO_VERSION` on both containers, and stops pruning. The release
skill takes a `release` backup in the running pod before the deploy and gains a light check script run
before the push (the built image runs on a scrubbed copy of production and answers a login) and after the deploy (version, request, logs). A new
`pachanguero-3pp-update` skill, in `t4m-3pp-update`'s style, reports and moves every pin and hands a
patch release to the release skill; `build.sh` builds with `--pull` and a date argument that re-runs
an `apt-get upgrade` layer. The shipper is opted in by one `apps:` entry in `trade4me-server`.

**Why this shape.** Keeping `/backups` as the in-container path (Dockerfile `VOLUME`, `ENV`, the
`docker run` story and `PACHANGUERO_BACKUPS` all unchanged) confines the move to the chart and to
the names; the sacrifice is that `/backups` now means "the staging folder", which the docs must say.
The version is read from the environment, not from `package.json`, because the migration backup must
carry the version of the *code that migrates* and the pre-deploy backup the version *about to deploy*
(`study/decisions.md`, `author decision`).

**Alternatives (hard to reverse only).** *Drop the sidecar and use a Kubernetes CronJob.* Entails a
second pod mounting the live data PVC (ReadWriteOnce, same node only) and a second image reference;
advantage: no extra container; disadvantages: scheduling coupling, a new failure mode, and
UC-007-01-S1 names the sidecar; risk: backup of a database mid-write is no worse (`VACUUM INTO`);
scope: larger chart. Not taken. *Name by `package.json` version.* Rejected: wrong for the pre-deploy
backup of the new version.

### 2.3 Impacted Units (Component level)

| Unit | Type | Location | Action | Notes |
|---|---|---|---|---|
| `BackupName` | class | `server/src/domain/` | Create | name grammar, UTC stamp, version check, counter |
| `DatabaseBackup`, `MigrationBackup`, `BackupWriter`, `UserCli`, composition | classes | `server/src/db`, `server/src/cli` | Modify | kind, version, hidden temp name |
| `deployment.yaml`, `pvc.yaml`, `values.yaml` | chart | `deploy/helm/pachanguero/` | Modify | hostPath; no prune; version env; no second PVC |
| `Dockerfile`, `build.sh`, `deploy.sh` | image/script | root, `deploy/` | Modify | pin once; OS refresh; refuse `latest` |
| `verify-release.sh` | script | `scripts/` | Create | image and deployed checks |
| `pachanguero-3pp-update` | skill | `ai-kit/skills/` | Create | |
| `pachanguero-release`, `-deployment-management`, `-setup-production-copy` | skills | `ai-kit/skills/` | Modify | steps, `-c backup` text |
| `prod-copy.sh` | script | `scripts/` | Modify | new names |
| `apps:` entry | values | `trade4me-server` | Modify | cross-repository commit and redeploy |
| documents | docs | see 2.8 | Modify | |

Method-level grain arrives with each element's LLD.

### 2.4 Interface Specification

```
backup name   <kind>_<YYYYMMDDTHHMMSSZ>_<version>[-<n>].db     kind ∈ {periodic, release}
temp name     .<final name>.part                              (hidden; renamed when complete)
env           PACHANGUERO_VERSION   unset → "unreleased"
cli           pachanguero-admin backup [--kind periodic|release] [--version <v>]   → "✓ <path>"
deploy        deploy.sh --tag <semver>    (a non-semver tag, notably "latest", exits 1 before helm)
```

| Key | Meaning | Default |
|---|---|---|
| `--kind` | `periodic` or `release` | `periodic` |
| `--version` | version in the name; must match `[A-Za-z0-9.+-]+` | `PACHANGUERO_VERSION`, else `unreleased` |
| `backup.weekday` (chart) | day of the weekly `periodic` backup | `Tue` (was daily) |
| `backup.timeMadrid` (chart) | time of that backup, Europe/Madrid | `08:15` (was `hourUtc: 2`, UTC) |

**Time reference (as trade4me).** Every timestamp in a name is UTC, from the instant, whatever the
process time zone (`author decision`: same reference as trade4me; its contract says `YYYYMMDDTHHMMSSZ`,
UTC, `backup-contract.md:21`, `verified — document`). **The schedule is in Madrid time**, like the
shipper's (`0 9 * * *`, `timeZone: Europe/Madrid`, `backup-shipper/values.yaml:13-14`,
`verified — source`) and papiros, which is off 01:00–08:00 Madrid time and powers up at 08:00 CET or
CEST, following daylight saving (`author decision`). The `periodic` backup runs **weekly, on Tuesday
at 08:15 Madrid time** (`author decision`): papiros is up, the shipper pushes it 45 minutes later at
09:00, and it holds the Monday-night game's list, convocatoria and result (the group plays Mondays at 22:00 and the list is pasted that night, `WP-001` requirements UC-001-08, `verified — document`). The game day is schedule data and can change; the weekday is then a chart value to move with it. Trade4me's own backup runs
at `0 3 * * *` (`trade4me-infrastructure/values.yaml:82`, `verified — source`), far from it. The
sidecar therefore computes its next run in `Europe/Madrid` (today it uses `date -u`,
`deployment.yaml:72-73`); that needs the zone database in the image (`assumed`: checked in F2's LLD,
and if absent, the sidecar's loop is rewritten to use `TZ` another way or the Dockerfile adds
`tzdata`, which is an `apt` install in the build, not on this machine). UC-007-01's examples that
name 02:00 UTC are updated with this design.

**Old backups (`author decision`).** Only the newest backup on the old `pachanguero-backups` volume is
kept. Just before the first deploy the operator takes a fresh one with the old pod's own command (so it is
the newest), copies it into the staging folder renamed to the current grammar as a `release` copy (an
older file adopted instead: `release` if its name ends `-before-migration`, else `periodic`); timestamp from the file's modification time converted
to UTC (so the pod's time zone does not matter); version the one running in production at the moment
of the cutover, which the operator confirms from the pod. The others are not carried over, and the old
volume is deleted only after the drill and with the user's go-ahead.

### 2.5 Unit Communication

Weekly (Tue 08:15 Madrid): sidecar → `pachanguero-admin backup` → `DatabaseBackup` → staging → (shipper, 09:00) → papiros.
Release: release skill → `kubectl exec -c backup … backup --kind release --version X` → staging →
`deploy.sh` → new pod → (if the schema is newer) `SchemaMigrator` → `DatabaseBackup` `release` with
the new code's version. Update: 3pp skill → pins → checks (`verify-release.sh`, tests) → one commit →
release skill (patch).

### 2.6 Refactors

| # | Refactor | Component | Units | Scenarios | Status | Verification | Mandatory Reading |
|---|---|---|---|---|---|---|---|
| R1 | The base image tag lives in one place | Build | `Dockerfile`, `build.sh` | UC-007-03-S1, UC-007-03-S2 | terminal | `./build.sh` builds the same image content; `docker run … node -v` shows the pinned line | HLD |

### 2.7 New Functionality

| # | Feature | Component | Units | Scenarios | Status | Verification | Mandatory Reading |
|---|---|---|---|---|---|---|---|
| F1 | Backups named for the shipper | Backup writer | `BackupName`, `DatabaseBackup`, `SchemaMigrator` seam, `UserCli`, composition | UC-007-01-S1, -S2, -S3, -S4 | terminal | unit tests; every name matches the shipper pattern | HLD, F1 |
| F2 | Backups staged on the host and never deleted by the app | Chart, Build | `deployment.yaml`, `pvc.yaml`, `values.yaml`, `deploy.sh` | UC-007-01-S5, -S6, -S7 | terminal | `helm template`; `deploy.sh --tag latest` exits 1 | HLD, F2 |
| F3 | The production copy reads the new names | Production copy | `prod-copy.sh`, its skill | UC-007-01-S8 | terminal | script run against a folder with both kinds | HLD, F3 |
| F4 | Light checks before the push and after the deploy | Release flow and checks | `verify-release.sh`, `test-strategy.md` | UC-007-04-S1, -S2, -S3 | terminal | script fails on a broken tree; passes on a good one | HLD, F4 |
| F5 | A release backs up first, is a patch when it only moves pins, and offers rollback | Release flow and checks | `pachanguero-release`, `-deployment-management` skills | UC-007-01-S1 (row 4), UC-007-04-S4, -S5 | terminal | skill read-through against the steps; one real release | HLD, F5 |
| F6 | Every build carries current OS packages | Build | `Dockerfile`, `build.sh` | UC-007-03-S5 | terminal | two builds on different dates differ in the apt layer | HLD, F6 |
| F7 | The 3pp skill reports, updates, asks only for a risky primary major, holds, commits on pass | Currency | `pachanguero-3pp-update` | UC-007-03-S1, -S2, -S3, -S4, -S6, -S7 | terminal | second report lists only held items; a deliberate break is not committed | HLD, F7 |
| F8 | The shipper takes pachanguero in | Shipper entry | `apps:` entry, redeploy | UC-007-02-S1 | terminal | first shipper job logs `pushed` for a staged file | HLD, F8 |
| F9 | Cutover: the newest old backup adopted, restore drilled, old storage retired | Repository documents, Shipper entry | operator procedure in `docs/deployment.md`; drill record | UC-007-02-S1, -S2, -S3, -S4 | terminal | one drill from papiros | HLD, F9 |
| F10 | Everything written down, nothing stale | Repository documents, Infrastructure documents | the documents of 2.8 | UC-007-05-S1, -S2 | terminal | the search of UC-007-05's success criterion | HLD, F10 |


### 2.8 Documentation Impact

The study's doc map (`study/gates-release-docs.md`) stands; the whole-solution effect, per document:
`docs/deployment.md` (Data and backups, Releasing, Restoring, impact table, Checks, One-time setup)
loses the two-PVC, pruning and "not automated" statements; `docs/backup_and_restore.md` gains the new
names, the staging folder and the restore from papiros; `docs/commands.md` (`backup` flags, Docker
volumes, production copy); `docs/test-strategy.md` (a row for the light checks); `AGENTS.md`
(skill pointer; `server/src/db/` paragraph names the old file name); `.env.example`; the
`Dockerfile` header comment; the three skills; `home-network-map` pages; `trade4me-server`'s
backup-contract worked example. **One correction to the doc map:** it says the sidecar goes; the
requirements keep it, so `-c backup` stays valid and only the `/backups` path meaning changes.
`None` of `docs/users-and-roles.md`, `docs/domain-model/*`. Detail: section 4.

### 2.9 Risks

| Risk | Handling |
|---|---|
| A backup overlaps the shipper's run, or papiros is off when someone needs it | Names are published only by rename, and the shipper reads only non-dot names, so even an overlap ships whole files only; the weekly backup is placed 45 minutes before the shipper, with papiros up. Anything that needs papiros (the drill, an on-demand shipper job after a release, a fetch) is done between 08:00 and 01:00 local time; the skill and the runbook say so |
| A name the shipper ignores is never shipped and never logged | F1 test asserts every producible name against the shipper's regex (copied into the test with its source cited); the first shipper job is read for a `pushed` line per file |
| The first release with this change runs on an old pod that has no `--kind` | F5: the first release skips the pre-deploy backup file via the CLI; F9's adoption puts the newest old backup on papiros first; stated in the skill as a one-time exception |
| hostPath ownership or a missing folder stops the pod | `type: Directory` makes the pod fail visibly (UC-007-01-S6); folder verified today (Q-03) |
| Dot-file left by a crash is never cleaned | accepted; the writer removes its own partial on failure (S4); a stale one is visible with `ls -a` |
| Dropping the PVC loses the old backups (all but the newest are dropped by decision) | `helm.sh/resource-policy: keep` keeps it; deletion only after the drill (UC-007-02-S4), with the user's go-ahead |
| An "update all" breaks the app | F7 gates it on the checks and never commits a failing update |

**Detector results.** D1 grounding: every Current Implementation claim cites source or study;
file:line for the HLD-central classes only. D2 assumptions: (a2) the image has the Europe/Madrid zone data (`assumed`, F2); (b) `kubectl exec -c backup` can write to the hostPath as uid 1000
(`inferred` from the sidecar already running as 1000); (c) papiros module accepts a new app folder
(`inferred`, `study/shipper-and-restore.md`: `reach_papiros` creates it). D3 reachability: every
element above names its units; nothing is "figure out X". D4 pre-mortem: F1 — a version containing
`_` would break the grammar → `BackupName` rejects it; two backups in one second → the `-n` counter (UC-007-01-S3); F6 — an `apt` upgrade layer cached by Docker
→ the date argument busts it; F4 — the login check needs a JWT secret in the throwaway container →
LLD must say where it comes from. **Deferrals: 0.**

### 2.10 Test Methodology

Domain tests in the server workspace (vitest) for F1; `helm template`/`helm lint` for F2; shell script
runs for F3, F4, F6 against a temporary folder or the built image; no e2e (it runs only when a
framework moved, UC-007-04-S2). Tiers per `docs/test-strategy.md`.

| # | Element | Fully automatable? | Manual verification needed |
|---|---|---|---|
| R1 | Base tag in one place | Yes | — |
| F1 | Names | Yes | — |
| F2 | Staging | Partly | after deploy, a file appears in `/var/backups/erebor/pachanguero` on erebor |
| F3 | Production copy | No | run with `--fresh` and without, against the real pod, and open the copy |
| F4 | Checks | Yes (image), No (deployed) | the public address is confirmed by the operator |
| F5 | Release flow | No | one real release: file `release_…_X.db` exists before the deploy |
| F6 | OS refresh | Yes | — |
| F7 | 3pp skill | No | run it twice; second report lists only held items |
| F8 | Shipper | No | job log shows `pushed` per staged file |
| F9 | Cutover | No | the drill: fetch, decrypt, `PRAGMA integrity_check` = `ok`, players and games answer; date recorded |
| F10 | Docs | Yes (search) | a separate reviewer reads them |

### 2.11 Patterns and Conventions

Server code follows `.agents/rules/coding-standard.md`: classes, no free functions, no stateless
`static`; `BackupName` is a class constructed with a version and clock-independent (the time comes
from the caller). Shell scripts follow `scripts/prod-copy.sh`/`build.sh` (`set -e`, usage text).
Skills follow `ai-skill-author`: short SKILL.md, detail in `references/`; documents follow
`ai-docs-editor` and `ai-docs-placement`; single source of truth (link, never copy the shipper's
facts); `home-network-map` follows its own `AGENTS.md`.

## 3. Low Level Design

#### F1 — Backups named for the shipper

**Current Implementation.** `DatabaseBackup.create(label?)` builds `pachanguero-<local time>[-label][-n].db`,
writes `<target>.part`, renames (`server/src/db/database-backup.ts:23-47`, `verified — source`).
`MigrationBackup.create(label?)` is the migrator's seam (`schema-migrator.ts:7-9`, called at `:46` with
`'before-migration'`); `BackupWriter.create()` is the CLI's (`user-cli.ts:16-18`, used `:182`);
`LocalCalendar.timestampOf` has one production consumer, `database-backup.ts:40` (`verified — source`,
grep). Tests that name the old format: `database-backup.test.ts`, `user-cli.test.ts:243-330`,
`schema-migrator.test.ts:73`, `local-calendar.test.ts:14-17`.

**Approach.**
- New class `BackupName` (`server/src/domain/backup-name.ts`, no I/O): constructed with a kind
  (`'periodic' | 'release'`), a version string and an instant; `fileName(counter = 1)` returns
  `<kind>_<stamp>_<version>[-<counter>].db` (counter omitted for 1) and `hiddenName(counter)` the same
  with a leading `.` and a trailing `.part`. The stamp is `instant.toISOString()` without `-`, `:` and
  the milliseconds (`2026-10-11T10:00:00.000Z` → `20261011T100000Z`, worked by hand, `not yet run`).
  The version must match `/^[A-Za-z0-9.+-]+$/` or the constructor throws; an unset or empty version
  becomes `unreleased`. `BackupKind` is the exported union.
- `DatabaseBackup(conn, dir, clock, version?)` (the `LocalCalendar` parameter goes): `create(kind, version?)`
  where the argument wins over the constructor's. It picks the first free counter, writes
  `VACUUM INTO` the hidden name, chmods 0600, then renames it to the final name, as today (the contract
  asks for exactly this: hidden name, then rename). Two backups in the same second are sequential in every
  real case (weekly sidecar, an occasional operator command), so the free-name check is enough.
- The migrator calls `create('release')`; its version is the constructor's (the code that migrates).
- `BackupWriter.create(kind, version?)`; `UserCli.backup` accepts `--kind periodic|release` (default
  `periodic`) and `--version`; a kind outside the two is a usage error (exit 2); a bad version is the
  command's `✗` (exit 1). Output stays `✓ <path>`.
- `db/index.ts` exports `BACKUP_VERSION = process.env.PACHANGUERO_VERSION`; both composition roots
  (`db/index.ts:33`, `cli/main.ts:31`) pass it.
- `LocalCalendar.timestampOf` and its test are deleted (no remaining consumer).

**Impacted Units.** `domain/backup-name.ts` (new) + `backup-name.test.ts`; `db/database-backup.ts`
(`create`, `freeName` → `BackupName`, `publish`); `db/schema-migrator.ts` (`MigrationBackup`, line 46);
`db/index.ts` (`BACKUP_VERSION`, constructor call); `cli/user-cli.ts` (`BackupWriter`, `backup`, USAGE
text); `cli/main.ts` (constructor call); `domain/local-calendar.ts` (+ test: remove `timestampOf`).

**Test Methodology** (HLD §2.10). Fully automatable, vitest in the server workspace. `backup-name.test.ts`:
the stamp from a UTC instant, a TZ-independent case (`process.env.TZ` set to `Asia/Tokyo`: the same
name), `-2` before `.db`, `unreleased`, a version with `_` or `/` rejected, and **every name the class can
make matches the shipper's `NAME_RE`** (pasted into the test with a comment citing
`push-backups.sh`; the same nine rows as `requirements/examples/backup-names.md`).
`database-backup.test.ts`: complete copy; no `.`-name left after success or failure; `-2` for two in the
same second; a pre-existing final name is not overwritten (the free-name check picks `-2`); mode 0600; the directory's other files
untouched (UC-007-01-S5). `user-cli.test.ts`: `--kind release --version 0.4.0`; default; bad kind → 2;
`✓ <path>` line unchanged. `schema-migrator.test.ts`: the pre-migration file is a `release_` name.

**Data Contract Verification.** Stored: a file name in the staging folder. Writer: `BackupName.fileName`.
Readers: the shipper (`NAME_RE`, `ENC_RE`; `push-backups.sh`, `verified — document`) and `prod-copy.sh`
(F3, globs `periodic_*.db`, `release_*.db`). Each producible name is run through the regex by the test
above; the shipper never sees hidden names (`staged_names` only lists non-dot names, `verified —
document`). Not user-editable data; no update/delete path (the app never deletes).

**Patterns and Conventions.** `.agents/rules/coding-standard.md`: classes, constructor injection, no
free functions or stateless `static`; `BackupName` is a value object. The time comes from the injected
`Clock`.

**File Changes.** Modify: the six files above. Create: `backup-name.ts`, `backup-name.test.ts`.
Delete: `timestampOf` (+ its test). Tests: as listed. Migrate: none.

#### F2 — Backups staged on the host, never deleted by the app

**Current Implementation.** Two PVCs (`templates/pvc.yaml`, both `helm.sh/resource-policy: keep`); the
`backup` sidecar loops with `date -u -d`, runs `pachanguero-admin backup` and then prunes
(`deployment.yaml:61-85`); both containers mount `pachanguero-backups` at `/backups`
(`:44-45, :81-82, :94-96`); the image tag expression is on line 1; no version in the environment.
`values.yaml` has `storage.backupsSize`, `backup.{enabled,hourUtc,keep}`. `deploy.sh` passes `--tag`
unchecked (`:19`). `deployment-settings.test.ts` fails when a variable the server reads is set neither
by the Dockerfile nor the chart (`verified — source`, header and `chartNames`). The staging folder exists,
uid 1000, mode 750 (`study/erebor-state.md`). The sidecar's image has GNU `date`, and the zone data
`/usr/share/zoneinfo/Europe/Madrid` is present in `node:22-trixie-slim` (`verified — invocation`, run
2026-11-07); for `node:26-slim` it is `inferred` (same Debian family), and a task checks it with
`docker run` before the build is pushed.

**Approach.**
- `deployment.yaml`: a template variable `$version := default .Chart.AppVersion .Values.image.tag`
  feeds `$image` and a new `PACHANGUERO_VERSION` env entry on **both** containers. The `backups` volume
  becomes `hostPath: {path: {{ .Values.backup.stagingPath }}, type: Directory}`; the mounts at `/backups`
  stay. `pvc.yaml` loses the second PVC (the existing one stays in the cluster because of `keep`; F9
  deletes it).
- The sidecar polls instead of computing a next date (no date arithmetic across daylight-saving changes):
  every 30 s it reads `TZ=Europe/Madrid date '+%a %H:%M'` (`LC_ALL=C`), and when it equals
  `{{ weekday }} {{ timeMadrid }}` and that minute has not already run, it executes
  `pachanguero-admin backup || echo "backup failed"`. The `ls … | xargs rm` prune line is deleted
  (UC-007-01-S5). Worked by hand: on Tuesday 2026-11-10 at 08:15:10 CET the key is `Tue 08:15`, equal, runs
  once; at 08:15:40 the stored last key equals it, skips; at 08:16 not equal (`not yet run`).
- `values.yaml`: remove `storage.backupsSize` and `backup.{hourUtc,keep}`; add `backup.stagingPath`
  (`/var/backups/erebor/pachanguero`), `backup.weekday` (`Tue`), `backup.timeMadrid` (`08:15`).
- `deploy.sh`: with `--tag`, the value must match `^[0-9]+\.[0-9]+\.[0-9]+$`, else exit 1 before any
  `helm` call (UC-007-01-S7); usage text updated.
- If the folder is missing, `type: Directory` makes the pod stay `ContainerCreating` and nothing creates
  it (UC-007-01-S6).

**Impacted Units.** `deploy/helm/pachanguero/templates/deployment.yaml` (image variable, both `env`, sidecar
script, volumes), `templates/pvc.yaml`, `values.yaml`, `deploy/deploy.sh`; `server/src/deployment-settings.test.ts`
(no change expected: the new variable is set in the chart; a failing run is the check).

**Test Methodology.** `helm lint` and `helm template … -f values.secrets.yaml.example`: the render shows
the hostPath, `type: Directory`, `PACHANGUERO_VERSION` on both containers and one PVC; `deploy.sh --tag
latest` exits non-zero with no `helm` call (run it with `helm` replaced by a stub on `PATH`); `npm test`
(the settings test). **Manual Test Plan:** after the deploy, `ls -a /var/backups/erebor/pachanguero` on
erebor shows no `.`-files; trigger `kubectl exec deploy/pachanguero -c backup -- pachanguero-admin backup`
and see `periodic_<UTC>_<version>.db` (owner uid 1000) appear; the pod survives a restart; the next Tuesday 08:15 Madrid a file appears without action.

**Data Contract Verification.** The chart values `weekday`/`timeMadrid` are read only by the template;
`%a` printed by `date` with `LC_ALL=C` is `Mon|Tue|Wed|…`, so `weekday` must be one of those (a comment
in `values.yaml` says so, and `helm` fails the render if it is not, by a `required`/`has` check, `not yet
run`). The version is the only value crossing from chart to app: chart → env → `BACKUP_VERSION` → name.

**Patterns and Conventions.** Chart: values documented in `values.yaml` comments, the existing template
variable style; no new top-level key outside `backup`.

**File Changes.** Modify: the four files above. Delete: the second PVC document. Create/Migrate: none.
Tests: `helm` checks and the stub run above.

#### F3 — The production copy reads the new names

**Current Implementation.** `prod-copy.sh:50-52` finds the newest backup with
`ls -1t /backups/pachanguero-*.db | head -n 1` in container `backup`; `--fresh` runs
`pachanguero-admin backup` in container `pachanguero` and parses the `✓ ` line; then
`$K cp "$POD:$SOURCE" "$TMP" -c backup` (`verified — source`). The sidecar stays, so `-c backup` and the
`/backups` path remain valid.

**Approach.** Only the glob changes: `ls -1t /backups/periodic_*.db /backups/release_*.db 2>/dev/null | head -n 1`
(`ls -t` sorts all arguments together by modification time; whatever kind is newest wins,
UC-007-01-S8). The `--fresh` branch is unchanged: the command still prints `✓ <path>`, now a
`periodic_` file. Help text and `ai-kit/skills/pachanguero-setup-production-copy/SKILL.md` ("`--fresh`
writes a backup file in the production pod") get the new names and say the file lands in the staging
folder and is shipped.

**Impacted Units.** `scripts/prod-copy.sh` (the `ls` line, usage text); the setup-production-copy skill
(one sentence).

**Test Methodology.** Not fully automatable (it needs the cluster). Automatable part: run the `ls` line
in a temporary folder holding an old `pachanguero-*.db`, a `periodic_…` and a newer `release_…`, and
see the `release_` file chosen. **Manual Test Plan:** `scripts/prod-copy.sh` and `--fresh` against the
real pod; the copy opens (`npm run dev:prod-copy`); with `--fresh`, a new staged file exists afterwards
(the skill asks the user first, as today).

**Data Contract Verification.** Reader of the names is the glob; it matches exactly the two kinds the
writer makes and never a hidden `.part` (leading dot; `ls` without `-a` and the glob skip it).

**Patterns and Conventions.** Shell as the file already is (`set -e`, `$K`).

**File Changes.** Modify: `scripts/prod-copy.sh`, the skill.


#### F8 — The shipper takes pachanguero in

**Current Implementation.** `apps:` in `trade4me-server/k8s/charts/backup-shipper/values.yaml:27-31` lists
`trade4me` (`release: 5`, `periodic: 14`); `cronjob.yaml` renders `APPS` from it, with defaults 5 and
14; the staging hostPath is the whole `/var/backups/erebor` (`values.yaml:18`), so no volume change is
needed; the shipper runs `0 9 * * *` Europe/Madrid (`verified — source`, read 2026-11-07).
`k8s/deploy-backup-shipper.sh` redeploys the chart into namespace `backup` and needs the git-ignored
`k8s/values.secrets.yaml` (`verified — source`). Chart tests under `k8s/charts/backup-shipper/tests`
and a pre-commit chart check exist (`study/shipper-and-restore.md`, `inference` from the hook globs).

**Approach.** One entry, explicit so the retention is visible: `- name: pachanguero`, `release: 5`,
`periodic: 14` (14 weekly copies = about three months). Nothing else in `trade4me-server` changes (the
shipper "is used as it is"). The change is a commit in that repository followed by
`k8s/deploy-backup-shipper.sh`; both are cluster-facing and wait for the user's go-ahead, and the commit
follows that repository's own conventions and its release procedure for a shipper-only change
(`docs/deployment/release.md`, "Backup shipper", read when the task runs; `author decision` pending
nothing here, only a task note).

**Impacted Units.** `trade4me-server/k8s/charts/backup-shipper/values.yaml` (the `apps:` list).

**Test Methodology.** Chart check: `helm template` of the shipper chart shows
`APPS="trade4me:5:14 pachanguero:5:14"`. **Manual Test Plan:** after the redeploy and with a staged file
present, create a job from the CronJob (`kubectl create job --from=cronjob/backup-shipper … -n backup`)
**between 08:00 and 01:00 Madrid time**, read its log: one `pushed <name>` per staged file, no
`papiros does not answer`; run it again: no new `pushed`; `restore-backup.sh --app pachanguero --list`
shows the name on both `staging` and `papiros` sides.

**Data Contract Verification.** The shipper reads names by `NAME_RE` (F1 guarantees them) and writes
`NetBackup/erebor/pachanguero/<name>.enc`; `reach_papiros` creates the app folder (`inference`,
`study/shipper-and-restore.md`; confirmed by the first job's log). Not user-editable data.

**Patterns and Conventions.** Follow the existing entry's shape; no per-app template (none exists).

**File Changes.** Modify: `values.yaml` in `trade4me-server`. Tests: `helm template` check above.

#### F9 — Cutover: the newest old backup adopted, restore drilled, old storage retired

**Current Implementation.** Backups live on the `pachanguero-backups` PVC (`helm.sh/resource-policy:
keep`, so removing it from the chart leaves it in the cluster); the running pod mounts it at `/backups`
in both containers; its files are `pachanguero-<local time>[-before-migration].db`
(`deployment.yaml:44, 81, 94`; `verified — source`). The shipper's restore is the manual
`rsync` + `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000` pair, or the shipper's `fetch` job
(`study/shipper-and-restore.md` Q-06, `verified — document`). `restore-backup.sh` refuses any app but
trade4me except `--list`. The passphrase is in `trade4me-server`'s git-ignored `k8s/values.secrets.yaml`
and the password manager; it is never read or printed in an AI session (`verified — document`). Papiros is
up 08:00–01:00 Madrid time (`author decision`).

**Approach.** This is an operator procedure, not code; each step that touches the cluster or papiros
waits for the user. It lives in this design and in the tasks (one-time, so it is not shipped as a
document that would go stale); what ships is the restore from papiros (F10). The order, with why:

1. **Take a fresh copy with the old pod**: `kubectl exec deploy/pachanguero -c backup -- pachanguero-admin backup`
   (old command, old name), before anything changes. It is the newest backup and the first-release
   pre-deploy copy (the old pod has no `--kind`).
2. **Read its facts**: file name, `stat -c %Y` (epoch of the modification time) in the pod, and the running
   version from the Deployment's image tag.
3. **Copy it out** (`kubectl cp … -c backup`) to a scratch folder, mode 0600, and **into staging** on erebor
   under a hidden name (`.release_<UTC>_<version>.db.part` made by `scp`), then rename to
   `release_<UTC from the epoch>_<running version>.db`. The UTC stamp is `date -u -d @<epoch> +%Y%m%dT%H%M%SZ`
   (worked: epoch `1792061400` → `20261015T105000Z`, run with `date` on 2026-11-07). Check with `ls`.
4. **Deploy** the shipper entry (F8) and the new release (F2, through the release skill).
5. **Ship**: create the shipper job between 08:00 and 01:00 Madrid time; expect `pushed release_…`.
6. **Drill** (once, by the user, who holds the passphrase): fetch the copy from papiros, decrypt in a
   scratch folder (`umask 077`), `PRAGMA integrity_check` answers `ok`, players and games answer through a
   throwaway app instance (`PACHANGUERO_DB=<file>`, another port; the older schema is migrated by the
   app and writes its own `release_…` copy into that instance's backup folder), `cmp` against the staged
   file, delete the scratch folder. Repeat for a `periodic_` copy after the first Tuesday run. Record
   the date of each drill (F10 writes where).
7. **Retire the old storage** only after step 6 and with the user's go-ahead: check the storage class's
   reclaim policy first (`unknown`), then delete the PVC `pachanguero-backups`.

**Impacted Units.** No repository units of its own; the facts in F10's documents; the tasks of the
anatomy carry the steps above as operator tasks.

**Test Methodology.** Manual only (UC-007-02 graduates to `document`). Guidelines: after step 3 the staging
folder holds exactly the one adopted file and no hidden file; after step 5 the job log shows `pushed`
and the second run none; after step 6 the integrity check prints `ok`, a known player and the latest
game are found, and the drill date is written down; after step 7 `kubectl get pvc` no longer lists the
volume, and nothing was lost because the copy exists on papiros.

**Data Contract Verification.** The adopted file must satisfy `NAME_RE` (checked with `grep -E` before
step 5, the regex in `requirements/examples/backup-names.md`); its content is a SQLite file of an older
schema, which the app opens and migrates (`SchemaMigrator`, `schema-migrator.ts:40-47`).

**Patterns and Conventions.** One-time operator work is a recorded procedure with stops for the user, as
the release skill does; secrets are never printed.

**File Changes.** None in the repository (the procedure is in the tasks); the drill's date goes to the
documents in F10.


#### F10 — Everything written down, nothing stale

**Current Implementation.** The doc map in `study/gates-release-docs.md` (Q-12) lists each document and the
sentence that goes stale, with the greps that found them (`-c backup`, `/backups`, `pachanguero-backups`,
`backupsSize`, `backup.keep`, `hourUtc`, `before-migration`, `not automated`, `PACHANGUERO_BACKUPS`,
`node:26`); `verified — document`, re-run when the task starts because the code will have moved by then.

**Approach.** Each fact has one home (`ai-docs-placement`), and every other place links to it:
- *Where backups are written, names, that they reach papiros, restore from papiros, the drill record* →
  `docs/backup_and_restore.md`.
- *The chart, staging precondition, release order and light checks, impact-table rows* →
  `docs/deployment.md`.
- *`backup` flags, `PACHANGUERO_VERSION`, volumes in Docker* → `docs/commands.md`, `.env.example`.
- *What is kept current and the policy* → the 3pp skill (`SKILL.md`, `ecosystems.md`) and, for the decisions taken, `.3pp-management.md`; `AGENTS.md` and
  `docs/deployment.md` carry a one-line pointer only.
- *The light checks tier* → `docs/test-strategy.md`.
- *The shipper and papiros facts* → `home-network-map` (its own `AGENTS.md` rules: one canonical file per
  fact, absolute dates, `TODO` for the unknown, "Last reviewed" updated), and `trade4me-server`'s
  `backup-contract.md` gets pachanguero as a second worked producer.
Nothing written outside the work package names it (no use-case or work-package identifier in any shipped
file). The documents are written with `ai-docs-editor` and, because the author of a changed document may not
review it, read by a separate reviewing agent before the commit.

**Impacted Units.** The documents in section 4.

**Test Methodology.** Automatable part: a search of both repositories and `home-network-map` for the old
names (`pachanguero-*.db`, `before-migration`, "not automated", `backupsSize`, `backup.keep`, `hourUtc`,
`node:26-slim`, `ls /backups/pachanguero-`) finds none outside closed work packages; `format:check` passes
on the edited Markdown. **Manual Test Plan:** a reader (the reviewing agent) looks for each row of
UC-007-05-S1's table and finds it in one place; a change to a backup name is traced to its dependants through
the impact table (UC-007-05-S2).

**Data Contract Verification.** Not relevant (no stored data).

**Patterns and Conventions.** Single source of truth, progressive disclosure, absolute dates, Spanish only
for domain vocabulary and UI copy (the documents are English).

**File Changes.** Modify: the documents of section 4.

## 4. Documentation Impact

#### AGENTS.md
Stops being true: the `server/src/db/` paragraph naming `pachanguero-<time>-before-migration.db`; no pointer to
a currency skill; the `backup` command line mentions no flags. Replaced by: the new file-name grammar and
staging folder in one clause, the `backup --kind/--version` flags in the Commands line, and "Read
`ai-kit/skills/pachanguero-3pp-update/SKILL.md` before updating third-party versions" in Build and deploy.

#### docs/deployment.md
Stops being true: "Data and backups" (two PVCs, daily sidecar keeping `backup.keep`, "not automated yet");
"Releasing" (both-containers success line unchanged, but the before-migration paragraph, the rollback
paragraph and the absence of the pre-deploy backup and the checks); "Restoring a backup on erebor" last
paragraph (`$K cp <pod>:/backups/…`, `-c backup`); the impact table rows listed in 2.8; "Checks"; "One-time
setup". Replaced by: one PVC and the staging hostPath with its precondition; the weekly Tuesday 08:15 Madrid
backup; the release order (backup, push, deploy, `verify-release.sh deployed`); restore from staging or papiros
(link to `backup_and_restore.md`); new impact-table rows (staging hostPath, pinned versions, `PACHANGUERO_VERSION`).

#### docs/backup_and_restore.md
Stops being true: "Two kinds of backup" table and names; "Where the backups are" (sidecar prunes; the app never
deletes, but now the shipper trims staging); "In a container"; restore snippets with `/backups/pachanguero-…db`.
Replaced by: `periodic`/`release` names and the shipper pattern, the staging folder and who trims it, how a copy
reaches papiros and when it is available (08:00–01:00 Madrid), restore from papiros (fetch, decrypt, integrity
check, where the passphrase is kept, never printed), and a "Restore drills" line with the date of each drill.
The Raspberry Pi and `docker run` parts stay.

#### docs/commands.md
Stops being true: the `PACHANGUERO_BACKUPS` row (volume wording), the `backup` row (no options), the Docker
section's volume lines, "A copy of production" (`--fresh` wording). Replaced by: the new options, a
`PACHANGUERO_VERSION` row, the staging meaning of `/backups` on erebor.

#### docs/test-strategy.md
Stops being true: nothing is false; the tiers table lacks the release-checks tier. Replaced by: a row for
`scripts/verify-release.sh` (needs docker, `helm`, the cluster context; gate: every release) and a line that e2e
is not run by the release unless a framework moved.

#### .env.example, Dockerfile header comment, build.sh and deploy.sh usage text
Stop being true: "the data and the backups live on two volumes" wording where the chart no longer uses a
volume for backups; `build.sh` usage ("Builds … from the Dockerfile"); `deploy.sh` usage (accepts any tag).
Replaced by: the staging wording, the refresh/pull note, and the semver-only `--tag`.

#### The three skills
`pachanguero-release`, `pachanguero-deployment-management`, `pachanguero-setup-production-copy`: their changes are
specified in F5 and F3 (steps, the staging check, the new file names); the 3pp skill is new (F7).

#### home-network-map: services/pachanguero, services/backup-shipper, services/rsync-papiros
`pachanguero`: Volumes, Backups ("not automated"), Deployment (sidecar, PVC), Depends on (add the shipper), the
Security row about backups sharing the disk (set `resolved` with the date, keep the row), Howtos Backup and
Restore, Last reviewed. `backup-shipper`: Used by, retention wording (per application), the false "read-only"
staging statement, Status, Last reviewed. `rsync-papiros`: Used by and Last reviewed only if a new directory
appears. Replaced by facts that link to the repository's documents and do not copy them.

#### trade4me-server docs/deployment/backup-contract.md
Stops being true: nothing; its worked example names only trade4me. Replaced by: pachanguero as a second
producer in one paragraph (SQLite `VACUUM INTO`, hidden-then-rename, weekly periodic).

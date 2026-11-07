# Requirements — WP-007-backups-and-currency

## 1. Use Case Audit

Component: pachanguero's backups (`DatabaseBackup` and its three callers: the sidecar, the operator's
`pachanguero-admin backup`, the migrator's before-migration backup), its build and release procedure,
and the pins around it.

**Covered.** The two backup kinds `periodic` and `release` in every environment (k8s, `docker run`,
local development; the staging hostPath only in k8s); the production copy tool; the shipper's opt-in
entry in `trade4me-server`; the restore from papiros; every pin the Study found (base image tag, npm,
`@types/node`, `jose`, `@dnd-kit/core`, the typescript mismatch); the doc map (`study/gates-release-docs.md`, Q-12).

**Not covered.** Pod and network hardening (WP-008-pod-hardening); CVE scanning and image signing;
trade4me's release design; the shipper's code beyond its `apps:` entry; Caddy and numenor; e2e on
every upgrade (it runs only when a framework moved).

| Need (VISION) | Use cases |
|---|---|
| N1 the data survives the loss of erebor | UC-007-01, UC-007-02, UC-007-05 |
| N2 the exposed service runs on current software | UC-007-03, UC-007-04, UC-007-05 |
| N3 a release is a meaningful version | UC-007-01, UC-007-03, UC-007-04, UC-007-05 |

No row is empty.

## 2. Use Cases

### UC-007-01 — The operator keeps every production backup staged for the shipper

Actor: the operator (the backup sidecar, the app container and the release skill act for them).
Goal: every backup of production is one complete file, with a name the shipper takes, in the staging
folder on erebor, never half written and never deleted by the application.
Graduation: `hard requirement` (proposed).
Rests on: Q-01, Q-02, Q-05, Q-11 and `study/decisions.md`.

#### UC-007-01-S1 — A backup is staged, whoever takes it (outline)

Given production runs version 0.3.0 and the staging folder is mounted at `/backups`
When <actor> takes a backup by <trigger>
Then the staging folder holds `<kind>_<UTC timestamp>_<version>.db`, a complete SQLite copy of the live database, readable by its owner only, which was written under a name starting with `.` and renamed when complete

| trigger | actor | kind | version in the name |
|---|---|---|---|
| the daily run at 02:00 UTC | the backup sidecar | `periodic` | 0.3.0, the running version |
| `pachanguero-admin backup` typed by the operator | the operator | `periodic` | 0.3.0, the running version |
| the start of an image 0.4.0 whose schema is newer than the stored one | the app container | `release` | 0.4.0, the version of the code that migrates |
| the step before the deploy of 0.4.0 | the release skill | `release` | 0.4.0, the version about to be deployed |

The timestamp is UTC whatever the process's time zone. The command still prints its result as
`✓ <path>` on one line. Claims: the shipper's pattern accepts these names, `verified — document`
(`study/shipper-and-restore.md`, Q-02); the staging folder exists on erebor, owned by uid 1000, `verified — invocation`
(`study/erebor-state.md`); the migrator today names its backup with a label and in local time, so its name changes, `verified — source`
(`study/backups-in-pachanguero.md`, Q-01 and Q-05).

#### UC-007-01-S2 — The version is not known

Given the application runs without a version in its environment (local development, `docker run`)
When the operator runs `pachanguero-admin backup`
Then the file is named `periodic_<UTC timestamp>_unreleased.db`

#### UC-007-01-S3 — Two backups in the same second

Given `periodic_20261107T020000Z_0.3.0.db` is in the staging folder
When the operator runs `pachanguero-admin backup` in that same second
Then a second file `periodic_20261107T020000Z_0.3.0-2.db` is written (the suffix sits in the version part, before the extension, because the shipper never ships a name that ends after the extension), and the first file is untouched

#### UC-007-01-S4 — The backup cannot be written

Given the staging folder has no free space
When the backup sidecar takes the daily backup
Then no file with a final name exists (the partial one is removed), the command prints `✗ <reason>` and exits 1, the sidecar logs the failure and tries again the next day; and, for the migrator, the server does not migrate (existing behaviour)

#### UC-007-01-S5 — The application never deletes

Given the staging folder holds 20 backups
When the backup sidecar runs its daily backup
Then 21 files are in the folder: nothing was deleted (the shipper trims the folder)

#### UC-007-01-S6 — The staging folder is missing

Given `/var/backups/erebor/pachanguero/` does not exist on erebor
When Kubernetes schedules the pod of a new release
Then the pod does not start, and the application does not create the folder

#### UC-007-01-S7 — A deploy of a floating version is refused

Given the operator runs `deploy/deploy.sh --tag latest`
When the script reads its arguments
Then it exits non-zero saying a version is required, and no `helm` command ran

#### UC-007-01-S8 — The production copy tool reads the new names

Given the staging folder holds `periodic_…` and `release_…` files
When the operator runs `scripts/prod-copy.sh` (or with `--fresh`)
Then the copy starts from the newest file in the folder by modification time, whatever its kind (with `--fresh`, from the path in the `✓` line of a backup taken by the command)


### UC-007-02 — The operator can recover production from papiros

Actor: the operator.
Goal: after the move to off-erebor backups, production can be brought back from papiros alone, and no
backup, today's or earlier, is lost on the way. The shipper itself is used as it is: how it ships,
trims and encrypts is not a requirement here.
Graduation: `document` (proposed).
Rests on: Q-04, Q-06, Q-12.

#### UC-007-02-S1 — A copy opens as the data of its time (outline)

Given a <kind> copy of pachanguero on papiros, and the operator holding what it takes to read it
When the operator restores it into a scratch place
Then it opens as a complete database with the players and games of the moment it was taken

| kind |
|---|
| `periodic` |
| `release` |

#### UC-007-02-S2 — The way is written down

Given the production database is lost
When the operator follows the restore documentation
Then it leads from papiros to the running application without a missing step, and says where what it takes to read a copy is kept (never printing it)

#### UC-007-02-S3 — The backups that exist today are not left behind

Given backups taken before this change exist only in the old backup storage
When the change goes live
Then each of them is among the copies on papiros too

#### UC-007-02-S4 — The old storage is retired only when nothing depends on it

Given every backup is on papiros
When the operator retires the old backup storage
Then no backup exists only there

### UC-007-03 — The operator keeps the stack current

Actor: the operator.
Goal: everything pachanguero is built from and runs on is on the newest LTS release (where there is no LTS, the newest release), majors included, and every build carries current OS packages, so a release says what it ships. An item may stay behind only because the operator decided so, with the reason written.
Graduation: `document` (proposed): it becomes the `pachanguero-3pp-update` skill and the build's behaviour.
Rests on: Q-07, Q-08, Q-09, Q-11 and `study/decisions.md`. Today nothing refreshes OS packages in a build (`verified — source`, `study/gates-release-docs.md`, Q-11).

#### UC-007-03-S1 — The operator sees what is out of date (outline)

Given a pinned <item> that a newer release could replace
When the operator asks what is out of date
Then the report names the item, its current version, the version it would move to and whether that move is a major

| item | moves to |
|---|---|
| the Node base image tag | the newest patch of the newest LTS line |
| an npm dependency | the newest release (the newest LTS where it has one) |
| a dependency pinned exactly | the newest release, still pinned exactly |
| `@types/node` | the major of the Node line the image runs |

#### UC-007-03-S2 — Everything moves on its own, majors included

Given the report lists outdated items, some of them majors
When the operator asks to update
Then every item moves to its target without asking anything, the base image tag with the rest

#### UC-007-03-S3 — The skill asks only when a primary dependency could break the system hard

Given a major of a primary dependency (one the application declares itself, or the runtime) that the skill judges could break the system very hard
When the operator asks to update
Then the skill says what it expects to break and asks before moving that item, while every other item moves without asking; a held item is listed with the reason it was held

#### UC-007-03-S4 — Nothing is left behind unexplained

Given an update finished
When the operator asks what is out of date again
Then nothing is listed except items held by the operator, each with its reason

#### UC-007-03-S5 — Every build is current

Given two builds of the same version made on different days
When each is built
Then each contains the OS packages that were current on its day

#### UC-007-03-S6 — A broken update is not committed

Given an update after which the checks of UC-007-04 fail
When the operator reads the result
Then nothing is committed, the failing check is named, and the operator chooses between restoring the previous pins, holding the offending item and fixing forward

#### UC-007-03-S7 — A passing update is committed

Given an update whose checks pass
When the skill finishes
Then the change is committed as one commit (never pushed) and the release of UC-007-04 is offered


### UC-007-04 — The operator releases an upgrade safely

Actor: the operator.
Goal: an upgrade reaches production only after it was checked, is a version that says what it is, and is checked again once running. Pachanguero is not critical and a bug in production is cheap, so the checks are few and cheap.
Graduation: `document` (proposed): it becomes the steps of the release skill and the checks of the 3pp skill.
Rests on: Q-10, Q-11 and `study/decisions.md`. Today nothing checks the built image or the running service beyond the deploy's own wait and a manual public request (`verified — document`, `study/gates-release-docs.md`, Q-10).

#### UC-007-04-S1 — An upgrade is checked before it is pushed

Given an update committed by UC-007-03 and the operator asking to release it
When the release starts
Then the existing tests, lint, format, build and chart checks pass and the built image runs and answers a login request before anything is pushed or deployed; if one fails nothing is pushed and the failing check is named

#### UC-007-04-S2 — The browser tests run only when a framework moved

Given an update that moved the web framework, the server framework or the browser test tool
When the release is checked before the push
Then the browser tests pass too; for any other update they are not required

#### UC-007-04-S3 — The running service is checked

Given the upgrade was deployed
When the release checks production
Then the pod runs the released version, answers requests and logs no errors, and the public address is confirmed by the operator, since it can only be reached from outside the house

#### UC-007-04-S4 — A failed check in production

Given a check after the deploy failed
When the operator is told
Then the previous version is offered back and nothing is redeployed without the operator's yes, and the failed version is never reused

#### UC-007-04-S5 — An upgrade-only release is a patch

Given the changes since the last release only move pins
When the version is chosen
Then it is a patch version


### UC-007-05 — The information is documented

Actor: a reader: the operator, a maintainer, or an agent working in the repositories.
Goal: what this work package changes is written down, and nothing a reader is told about it is false afterwards. In which document each piece goes is the design's, decided with the documentation skills.
Graduation: `document` (proposed).
Rests on: Q-12 (the doc map in `study/gates-release-docs.md`) and Q-13.

#### UC-007-05-S1 — The information is found (outline)

Given this work package is live
When a reader looks for <information>
Then it is documented, and nothing documented states the old way

| information |
|---|
| where production backups are written, how they are named, that they reach papiros |
| how to restore a backup from papiros, and where what it takes to read one is kept (never printing it) |
| what is kept current, where each version lives, the policy (LTS, else the newest, majors included) and which skill does it |
| how a release is checked and versioned (the backup before it, the checks before and after, the patch for an upgrade-only release) |
| on the infrastructure side: that pachanguero's backups leave erebor, that the shipper serves pachanguero, and that the open issue of the backups sharing the disk is resolved |

#### UC-007-05-S2 — A later change to backups finds what depends on it

Given a developer changes backup file names or their folder
When they look for what depends on them
Then they are told everything that does, including the shipper's accepted name pattern and the staging folder

[Use case diagram](requirements/diagrams/use-cases.puml)

## 3. Interface Examples

The interfaces this work package changes are the backup file names, the environment variable that
carries the version, the operator's backup command (it can take a `release` backup naming a given
version) and the deploy script's refusal of a floating version. The names and the shipper's answer
to each are in [requirements/examples/backup-names.md](requirements/examples/backup-names.md).

## 4. File Locations

Exact paths are the design's and the tasks'; the groups below are what this work package touches.

| kind | where |
|---|---|
| backup code and its tests | `server/src/db/` (`database-backup.ts`, `schema-migrator.ts`, `index.ts`, their tests), `server/src/cli/` (`user-cli.ts`, `main.ts`, their tests), `server/src/domain/` (the UTC timestamp) |
| chart | `deploy/helm/pachanguero/` (`templates/deployment.yaml`, `templates/pvc.yaml`, `values.yaml`, `Chart.yaml`) |
| build and deploy scripts | `Dockerfile`, `build.sh`, `deploy/deploy.sh`, `scripts/prod-copy.sh`, `scripts/bump-version.sh` |
| skills | `ai-kit/skills/pachanguero-release/`, `ai-kit/skills/pachanguero-3pp-update/` (new), the deployment-management and production-copy skills |
| documents of the repository | `docs/*.md`, `AGENTS.md`, `.env.example` (placement decided with the documentation skills) |
| shipper repository | `trade4me-server`: `k8s/charts/backup-shipper/values.yaml` (the entry that takes pachanguero in) |
| infrastructure documents | `home-network-map/services/{pachanguero,backup-shipper,rsync-papiros}/info.md` |

## 5. Success Criteria

| use case | the check that fails if it is unmet |
|---|---|
| UC-007-01 | unit tests of the backup names, the hidden-then-renamed write, the `-2` clash and no deletion; a test that every name the code can make matches the shipper's pattern; `helm template` shows the hostPath and the version variable; `deploy.sh --tag latest` exits non-zero; the production copy tool run against a staging folder with both kinds |
| UC-007-02 | one restore drill from papiros on a real copy: it opens, `PRAGMA integrity_check` answers `ok`, the players and games answer, and the date is recorded; the backups of before the change are listed among the copies on papiros; the old storage is deleted only after that |
| UC-007-03 | the report run twice: the second lists only held items with reasons; two builds on different days differ in their OS layer; a deliberate break is not committed |
| UC-007-04 | the pre-push checks run once and fail on a broken tree; after a deploy the pod's version, a request and the logs are checked; the next upgrade-only release is a patch |
| UC-007-05 | a read of each piece of information in UC-007-05-S1 in the documents, and a search of the repositories for the old names (`pachanguero-*.db`, "not automated") finds none |

## 6. Constraints

- Update everything: LTS preferred, otherwise the newest; majors included; the skill asks the operator only for a major of a primary dependency it judges could break the system very hard.
- Backup names match the shipper's pattern (`release|periodic`, UTC timestamp, version); a file is written under a name starting with `.` and renamed when complete; the application never deletes in staging.
- No lint or format rule is relaxed, and nothing is installed without the user's explicit permission.
- A version already pushed or deployed is never reused; the release skill's stops for the user's go-ahead before the push and the deploy stay.
- Documentation is placed and written with the documentation skills (`ai-docs-placement`, `ai-docs-editor`, `ai-skill-author`); the `home-network-map` pages follow that repository's own `AGENTS.md`.
- The shipper is used as it is; the only change in its repository is the entry that takes pachanguero in.
- Pod and network hardening is WP-008-pod-hardening, not this work package.

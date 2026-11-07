# Shipper and restore (Q-02, Q-06, Q-13 shipper side)

Read-only study. Paths are under `/home/antonio/Workspace/trading/trade4me-server` (T4M) unless stated. No network, cluster or papiros contact. Searched: whole T4M tree for `backup-shipper|push-backups|shipper` (about 30 files), the chart (`k8s/charts/backup-shipper`: `values.yaml`, `files/push-backups.sh`, `templates/{configmap,cronjob,secret}.yaml`, `image/Dockerfile`, `tests/`), `k8s/deploy-backup-shipper.sh`, `k8s/management/{restore-backup.sh,release.sh,release-lib.sh,release-gate.sh}`, `k8s/lib/job-from-cronjob.sh`, `k8s/SECRETS.md`, `docs/deployment/{backup-contract,recovery,release,server-inventory}.md`, the home-network-map pages, and the pachanguero docs.

## Q-02

### Name regexes (`NAME_RE`, `ENC_RE` in `push-backups.sh`)

- `NAME_RE = ^(release|periodic)_[0-9]{8}T[0-9]{6}Z_[A-Za-z0-9.+-]+\.[a-z0-9.]+$`. `ENC_RE` is the same plus a trailing `\.enc`.
- `periodic_20261107T010203Z_0.3.0.db` and `release_..._0.3.0.db` match: the version class allows `.`, `+`, `-`, digits and letters, and the extension `db` is lowercase. The regex backtracks, so a dotted version is fine.
- A `-2` suffix passes only if it sits inside the version part: `periodic_<UTC>_0.3.0-2.db` matches (`-` is in the version class). `periodic_<UTC>_0.3.0.db-2` does NOT match: `-` is not in the extension class `[a-z0-9.]`. Such a file is silently never shipped (no log line; `staged_names` just greps it out). The pachanguero producer must put any collision counter before `.db`.
- Uppercase in the extension, a missing timestamp `Z`, or a `pachanguero-YYYYMMDD-HHMMSS.db` style name never match. Existing app-made names (`pachanguero-<time>.db`, `...-before-migration.db`) are therefore invisible to the shipper.
- `inference`: same-second `-2` sorting. In the C locale `-` (0x2d) sorts before `.` (0x2e), so `..._0.3.0-2.db` sorts before `..._0.3.0.db`, the reverse of creation order. Only matters inside one second and one kind; locale of the image (Debian slim, no `LANG` set in the `Dockerfile` or `cronjob.yaml`) is `inference`, not verified.
- The contract text in `docs/deployment/backup-contract.md` ("Name" row) agrees with the regex and says `NAME_RE` is the authority.

### `.`-prefixed files

- `staged_names` iterates the shell glob `"$STAGING_DIR/<app>"/*`, which does not match dotfiles, and also filters with `NAME_RE` (anchored at `release|periodic`). So `.periodic_...db` or `.x.partial` is ignored twice over. Subdirectories are skipped (`-f` test). Same in `list_backups` (uses `staged_names`).
- `fetch_backup` itself writes `.<name>.partial` into staging, then `mv` to the final name, using the same convention.
- Trimming never touches dot names (it only works from `staged_names`). A dot file left behind by a crashed producer stays forever (nothing cleans it): `inference`, no cleanup code found.

### Encryption, upload, checksum (`push_file`, `encrypt`)

- Per pending file: `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:PASSPHRASE -in <staged> -out $WORK_DIR/out/<name>.enc` (WORK_DIR is an `emptyDir`), then `rsync --timeout=60 <enc> $PAPIROS_URL/<app>/`.
- Verification: `rsync -c --dry-run --itemize-changes` of the same `.enc` against papiros; any output means a difference, logged `ERROR: the copy of <name> on papiros differs`, `push_file` returns 1. So it is a whole-file checksum of the ciphertext, post-upload. It does NOT decrypt, does not check the plaintext, and `openssl enc` is unauthenticated (accepted risk in `home-network-map/services/backup-shipper/info.md`, Security table).
- Pending = staged names whose `<name>.enc` is not in the papiros listing (`push_app`). The `.enc` is removed from scratch after the check.
- The shipper never opens or validates the SQLite file; it ships bytes. A file renamed into place before it is complete would be shipped (hence the write-under-`.`-then-rename rule).

### Trimming

- Per app, per kind, keep the newest N (`release` count, `periodic` count from the `APPS` entry `<app>:<release>:<periodic>`; defaults 5 and 14 from `cronjob.yaml` `default 5 $app.release` / `default 14 $app.periodic`). `surplus` = names of a kind sorted ascending, `head -n -N`: everything but the newest N. Sorting is lexical, so the UTC timestamp orders them chronologically. (`inference`: N = 0 gives `head -n -0`, which prints everything, i.e. keeps all, so 0 does not mean "delete all".)
- Staging (`trim_staging`): for each surplus staged file, `rm -f` it only if `<name>.enc` is on papiros (fresh `remote_names` listing). If papiros does not answer, `trim_staging` returns without deleting. So an unshipped file can never be trimmed from staging, even when surplus; it is pushed first (push loop runs before trim) and trimmed the same run if surplus.
- What is deleted locally: only the surplus staged plaintext files (regular, matching `NAME_RE`) in `/var/backups/erebor/<app>/`. The pod mounts the hostPath read-write (`cronjob.yaml`, no `readOnly`) and runs as uid 1000 (`runAsUser`). Directory must be writable by uid 1000: the pachanguero directory exists, uid 1000, so ok.
- Papiros (`rotate_papiros`): computed from papiros's own listing filtered by `ENC_RE`, never from staging. Surplus `.enc` per kind are deleted oldest first with `rsync -r --delete --include=<name> --exclude='*'` against an empty dir. If the listing fails or is empty: `rotation skipped ... listing failed or empty`, nothing deleted.
- `MAX_DELETIONS=20` per app per run, applied to papiros rotation only (not to staging trimming): at the 20th, logs `rotation of <app> stopped at 20 deletions` and `break`s; the rest goes next run. Relevant when first opting in with a big backlog on papiros (none for a new app).
- Order inside `push_app`: push pending, trim staging, rotate papiros ("staging first: rotation may remove the very copy that confirms an old staged file was sent").
- `inference`: because trim is keyed on staging-vs-papiros, and papiros rotation applies the same counts, the two sides converge to the same newest-N set per kind. A file restored with `fetch` into staging whose `.enc` was already rotated off papiros would count as pending and be re-pushed.

### Papiros off or unreachable

- `reach_papiros` (an `rsync -r` of an empty dir to `<PAPIROS_URL>/<app>/`, which also creates the app folder) fails -> logs `papiros: <last error line>` and `papiros does not answer; N backup(s) of <app> stay in staging`, `push_app` returns 0: the job still succeeds, nothing is trimmed, nothing shipped. They go out on the next run. `REACH_TIMEOUT` 20 s, push timeouts 60 s.
- A failure after reaching papiros (push or checksum mismatch, `push_file` returns 1) sets `failed=1`; the job exits non-zero for that app and continues with the next app. The cronjob has `restartPolicy: Never` and no `backoffLimit` or `activeDeadlineSeconds` set in `cronjob.yaml`, so the Kubernetes default (6 retries) applies (`inference`, default behaviour). `concurrencyPolicy: Forbid`, history 3 success and 3 failed, `ttlSecondsAfterFinished: 86400`.
- Schedule `0 9 * * *` Europe/Madrid, deliberately outside papiros's 01:00-08:00 off window. A backup made at night waits in staging until 09:00. No alerting found in the chart (`unknown` whether anything watches failed jobs).
- A single rsync daemon account `netbackup` writes under `NetBackup/erebor/<app>/`; the module base `NetBackup/erebor/` must pre-exist (daemon lacks `--mkpath`); `<app>` folder is created by `reach_papiros`.

### Schedule and on-demand runs

- Daily 09:00 Europe/Madrid (`values.yaml` `schedule`, `timeZone`).
- On demand: `kubectl --context erebor create job --from=cronjob/backup-shipper <name> -n backup` (printed by `deploy-backup-shipper.sh`, documented in `docs/deployment/release.md` "Backup shipper", "Run it now"). This is exactly what `k8s/management/release.sh` does after the trade4me release backup (step "Ship the release backup", job `backup-shipper-release-<UTC>`, not awaited, only warns on failure). So yes: after a pachanguero release a run can be triggered by that one command (needs the `erebor` context). It ships ALL opted-in apps. A manually created job is not covered by `concurrencyPolicy: Forbid` (that governs CronJob-spawned jobs) so overlapping with 09:00 is possible (`inference`).
- Modes via args (`create_job_from_cronjob ... --args list|fetch ...`): `push` (default), `fetch <app> <name>`, `list <app>`.
- Pachanguero's own release flow lives outside T4M; nothing in T4M triggers the shipper for a pachanguero release (`release.sh` hard-codes the trade4me backup only). A pachanguero release step would need to run the `kubectl create job` itself or wait for 09:00.

### What opting pachanguero in needs in trade4me-server

Mechanism: one list entry in `k8s/charts/backup-shipper/values.yaml`, `apps:`; counts per kind optional.

```yaml
apps:
  - name: trade4me
    release: 5
    periodic: 14
  - name: pachanguero      # directory name under /var/backups/erebor/
    release: <n>           # omit for 5 / 14
    periodic: <n>
```

- `templates/cronjob.yaml` renders `APPS` as `"trade4me:5:14 pachanguero:<r>:<p>"` with a `range`. No chart template creates anything per app: one Secret and one ConfigMap shared by all, one hostPath mount of the whole `/var/backups/erebor`, one CronJob. Passphrase and rsync password are shared across apps (no per-app key).
- `tests/behavioral-tests/test_shipper_template.sh` renders with synthetic `apps[0].name=other` and null counts (default check); it does not read the committed `values.yaml` app list. `tests/script-tests/*` use fixture apps. `management/tests/script-tests/release-fixture.sh` writes its own mini `values.yaml` (no `apps`). So no existing test enumerates the real apps and none needs editing (`inference` from grep for `trade4me`/`apps`/`values.yaml` in those files; I did not execute them).
- `release.sh`, `release-lib.sh`, `release-gate.sh`, `release-changed-services.sh`: no app enumeration. `release-lib.sh` `shipper_chart_changed` diffs the whole chart dir against the last release tag; `shipper_image_changed` only the `image/` dir and a changed `base:` line; `shipper_tag_changed` a changed `tag:` line. So an `apps:` edit needs NO `image.tag` bump and no image rebuild, but the next trade4me `release.sh` will see the chart changed and run `deploy-backup-shipper.sh` again (harmless re-deploy, `inference`). `docs/deployment/release.md` says a release that changes only the shipper "is a patch release"; that applies if done through `release.sh`. Whether a direct `deploy-backup-shipper.sh` outside a release is acceptable under the T4M conventions: `unknown`, read `AGENTDOCS/deployment.md` (it only says deploys go through the Helm scripts, which this is). `docs/deployment/backup-contract.md` "Opt in" says: "The erebor administrator makes that edit and runs `k8s/deploy-backup-shipper.sh`."
- Redeploy: `k8s/deploy-backup-shipper.sh` (`helm upgrade --install backup-shipper ... -n backup -f k8s/values.secrets.yaml --atomic`); needs the `erebor` context, helm, and `k8s/values.secrets.yaml` with a `backupShipper:` section (the existing one). No secrets change.
- Docs that list apps: none enumerate apps in T4M (checked `docs/deployment/{backup-contract,recovery,release,server-inventory,third-party-currency}.md`, `k8s/SECRETS.md`, `README`, `CHEATSHEET`, `HELM_GUIDE`, `DEPLOYMENT_CHECKLIST`, `AGENTDOCS/deployment.md`, skills `t4m-release`, `t4m-3pp-update`). `recovery.md` "Backups" says "Another application opts in by following backup-contract.md", still true. `server-inventory.md` has one generic `backup-shipper` row (no apps). Nothing in T4M mentions pachanguero at all (grep, empty).

**Files in trade4me-server that change in the opt-in commit**

1. `k8s/charts/backup-shipper/values.yaml` (new `apps:` entry). That is the only required file.
2. Optional, not required: `docs/deployment/backup-contract.md` could name pachanguero as a second worked example (it currently says trade4me is the worked example, and `recovery.md` "Restore" is trade4me-only); `docs/deployment/recovery.md` could gain a note that the generic restore lines apply to pachanguero. `unknown` whether the owner wants pachanguero mentioned in T4M docs; leaning no.
3. Nothing else: no chart template, no script, no test, no `releases/*.env`, no secrets file.

Pre-commit (`.githooks/pre-commit`): staged `k8s/charts/*` runs the chart checks (the loop over `k8s/charts/*` staged files at the end, not read in detail); script tests run only for staged `k8s/management/*`, `k8s/lib/*`, `files/*`, deploy scripts, so a values-only commit triggers the chart/manifest checks but not the script tests (`inference` from the hook's path globs).

### Drill: verifying the first shipment

(For the administrator to run; I ran nothing.) Prereqs: files named `periodic_<UTC>_<version>.db` / `release_...db` present in `/var/backups/erebor/pachanguero/` (directory is hostPath `type: Directory` of the whole `/var/backups/erebor`, already exists).

1. Commit the `apps:` entry, `k8s/deploy-backup-shipper.sh`.
2. `kubectl --context erebor create job --from=cronjob/backup-shipper backup-shipper-first-$(date -u +%Y%m%d%H%M%S) -n backup`; `kubectl --context erebor logs job/<name> -n backup`. Expect `pushed <name>` per file, then `dropped ...` / `deleted ...` only for surplus. A `papiros does not answer` line means off-window (01:00-08:00) or unreachable. A staged file with a non-matching name produces no log at all (check this by comparing `ls` with the `pushed` lines).
3. `k8s/management/restore-backup.sh --app pachanguero --list` prints `staging <name>` and `papiros <name>` lines (`--list` exits before the trade4me-only guard, so it works for pachanguero); the name should appear on both sides; `papiros-unreachable` otherwise.
4. Decrypt proof, see Q-06 (fetch one copy, `sqlite3 ... 'PRAGMA integrity_check'`).
5. Re-run the job: expect no `pushed` lines (idempotent), proving the `.enc` listing logic.
6. Trimming check later, when there are more than N files of a kind: surplus staged files drop only after their `.enc` is on papiros.

Signal: expected

## Q-06

### The restore path, generic vs trade4me-specific

`docs/deployment/recovery.md`, section "Backups" and "Restore":

- Script route (from the dev machine, in T4M, `erebor` context): `k8s/management/restore-backup.sh --list`, `--scratch <name>`, `<name>`. Everything after the fetch is trade4me-specific: it rejects `--app` other than `trade4me` with `ERROR: the restore job restores the trade4me database only` (after name validation and after `--list`), and then renders the `trade4me-infrastructure` chart's `templates/backup/restore-job.yaml` (TimescaleDB `pg_restore`, scratch DB `restore_drill_<UTC>`, row counts, key-match check against `encryption.key`). `test_restore_backup.sh` asserts the refusal of other apps.
- Generic parts of `restore-backup.sh`: the `NAME_RE`, `run_shipper_job` (creates a job from the `backup-shipper` CronJob with `--args list <app>` or `fetch <app> <name>`), and `--app`. `list <app>` and `fetch <app> <name>` in `push-backups.sh` are app-agnostic: `fetch` downloads `<app>/<name>.enc` via rsync, decrypts it to `$STAGING_DIR/<app>/.<name>.partial` then renames to `<app>/<name>` in staging.
- Manual route (works for any app, "When the cluster or its scripts are unavailable, papiros is off 01:00-08:00" paragraph, any machine with the passphrase and the `netbackup` rsync password):

```bash
rsync rsync://netbackup@192.168.1.89/NetBackup/erebor/<app>/<name>.enc .
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <name>.enc -out <name>
```

  The first two lines are generic (replace `trade4me` with `pachanguero`; `backup-contract.md` "Restore, and drill it once" says this explicitly). The `createdb`/`psql`/`pg_restore`/`tar` lines are PostgreSQL/trade4me. For pachanguero the decrypted file is already a complete SQLite database (no tar). `openssl` asks for the passphrase; `rsync` asks for the `netbackup` password (or `RSYNC_PASSWORD`).
- Both routes need papiros powered on (not 01:00-08:00) and the `NetBackup` module reachable at 192.168.1.89:873 (LAN).

### Where the passphrase lives

- `backupShipper.passphrase` in the dev-machine `k8s/values.secrets.yaml` (git-ignored; `k8s/SECRETS.md` "Production file" and "Backup shipper" section), and the password manager (`recovery.md` "Backups", `home-network-map/services/backup-shipper/info.md` "Configuration", pointer only). The cluster copy is Secret `backup-shipper` (ns `backup`, keys `RSYNC_PASSWORD`, `PASSPHRASE`), rendered by the chart. The same passphrase encrypts all apps. Losing it makes every papiros copy unreadable. The `netbackup` rsync password is held the same way. Per `AGENTS`/`SECRETS.md` conventions secrets must not be printed in an AI session; the drill must not read them aloud here.

### One-time drill for pachanguero (no cluster changes by the drill-writer)

Run by the administrator on any machine with `rsync`, `openssl`, `sqlite3` (availability of `sqlite3` locally is `unknown`; the pachanguero container has none per `backup_and_restore.md`, so use the app instead):

1. Ensure the first shipment happened (Q-02 drill) and papiros is up (09:00-24:00).
2. Pick a `release_...` and a `periodic_...` copy: `restore-backup.sh --app pachanguero --list`, or `rsync --list-only rsync://netbackup@192.168.1.89/NetBackup/erebor/pachanguero/`.
3. Fetch and decrypt in a scratch directory (outside the repo; the file holds password hashes and the bank session, keep mode 0600, delete afterwards):

   ```bash
   cd "$(mktemp -d)" && umask 077
   rsync rsync://netbackup@192.168.1.89/NetBackup/erebor/pachanguero/<name>.enc .
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <name>.enc -out <name>
   ```

   Alternative via the cluster (creates a Job in ns `backup`, one more cluster interaction, still just a job from the CronJob): `kubectl create job ... --args fetch pachanguero <name>` leaves the decrypted file in `/var/backups/erebor/pachanguero/` on erebor; the `restore-backup.sh` wrapper cannot do this for pachanguero because of its trade4me guard (only `--list` works with `--app pachanguero`). A fetched file in staging is a normal staged file and is later trimmed only when surplus and when its `.enc` is on papiros. File mode of the fetched file: `unknown` (openssl creates with umask).
4. Integrity: `sqlite3 <name> 'PRAGMA integrity_check'` and a few counts (`players`, `games`), or start a throwaway app instance with `PACHANGUERO_DB=<name>` on another port (the rehearsal described at the end of `docs/backup_and_restore.md`, "To rehearse a restore without risk"). Also check `PRAGMA user_version` against the current schema version.
5. Compare against the source: the same copy still in staging (`cmp` the decrypted file with `/var/backups/erebor/pachanguero/<name>`, if it was not yet trimmed) proves the encrypt/decrypt round trip.
6. Optionally exercise the real replacement path in `docs/deployment.md` "Restoring a backup on erebor" on a throwaway namespace; not needed for the drill and it changes the cluster.
7. Delete the scratch directory; record the date of the drill (T4M `recovery.md` itself still says "Restore Status: Not tested" for erebor, so there is no precedent drill record format; `unknown`).

### What it plugs into in pachanguero docs

- `docs/backup_and_restore.md`: sections "Two kinds of backup" (name table must gain `periodic_`/`release_` names and the app-made `pachanguero-*.db` relationship), "Where the backups are" (the shipper's staging dir `/var/backups/erebor/pachanguero/`, mode 0600 and uid 1000 which the shipper uid 1000 can read and delete), and "Restoring a backup" (new first step: "get the file from papiros", ahead of the existing step 3 "replace the database file"; the existing text says "The application never deletes them", while the shipper trims staging, the contract rule is "Never delete in the staging directory").
- `docs/deployment.md`: "Data and backups" (bullet "Copying `/backups` to `papiros` is not automated yet" becomes untrue once opted in) and "Restoring a backup on erebor", where `$K cp <backup>.db restore:/data/restore.db   # a local file` takes the decrypted file from the drill as `<backup>.db`; the new papiros fetch is the step before it. Also the change-impact table row "pachanguero-admin backup, backup file names or folder" lists what depends on the names: it should gain the shipper's `NAME_RE` and the hostPath directory. Line `scripts/prod-copy.sh` takes "the newest `pachanguero-*.db`" by mtime, so new `periodic_/release_` names in a shared directory would break its assumption if it reads that directory (`inference`; check before renaming).
- `AGENTS.md` build/deploy routing and the `pachanguero-release` skill (not read here) are where a "ship after release" step would go (`unknown`).

Signal: expected

## Q-13

Shipper side only: inventory of what lists or serves the shipper and apps, and doc map contributions.

### In trade4me-server

- Serves: one CronJob, one ConfigMap (`backup-shipper-script`), one Secret, namespace `backup`, image `registry.local:5000/trade4me-backup-shipper:1.0.0` built from `image/Dockerfile` (Debian + rsync + openssl). Other apps: none; `apps:` lists only `trade4me` (5 release, 14 periodic).
- Docs mentioning it: `docs/deployment/backup-contract.md` (the app-facing contract; authoritative for naming, directory, opt-in), `docs/deployment/recovery.md` (Backups/Restore), `docs/deployment/release.md` (Backup shipper), `docs/deployment/server-inventory.md` (one generic row), `docs/deployment/third-party-currency.md` (base image `image.base` is a tracked third-party; this is the "currency" half of WP-007: Debian 13.7-slim pin, shipper takes an OS refresh only with a new `image.tag`), `k8s/SECRETS.md`, `k8s/values.secrets.yaml.example`, `AGENTDOCS/deployment.md`, skills `t4m-release` and `t4m-3pp-update`. None lists apps, so none becomes untrue by adding pachanguero, except the `recovery.md` and `backup-contract.md` "worked example: trade4me" framing (still true).

### In home-network-map (`/home/antonio/Workspace/home-network-map`)

Rules from `AGENTS.md` that bind the edit: never probe the network; never invent facts (unknown gets `TODO`, inferred is marked); no secrets (pointers only); each fact lives in exactly one file (service name/host/ports in `services/registry.md`, everything else in the service's `info.md`; never restate); `hardware.md` is hardware-only; one row per real service, no lumping; dates absolute `YYYY-MM-DD`; update "Last reviewed" in each file materially changed; the registry has exactly three columns (service, runs on, ports/URL); each `info.md` keeps the `## Security` table (Issue, Risk, Status, Next step, Found) where `resolved` rows stay with a date in "Next step"; sibling files `howto-*.md` / `backup-restore.md` allowed, linked from `info.md`; the registry row links the info page.

Pages that become untrue or need a contribution:

| Page | Now says | Becomes untrue / needs |
|---|---|---|
| `services/pachanguero/info.md` | "Backups" field: copy to `papiros`: TODO (not automated). Security row "daily backup stored on the same disk ... copy to papiros is not automated", risk high, status open, found 2026-10-17. "Depends on" lacks the shipper. Howto "Restore" points to repo docs only. | Update the Backups field (daily sidecar backup plus shipped via backup-shipper as `NetBackup/erebor/pachanguero/<name>.enc`, link to [backup-shipper]), mark the Security row `resolved` with the date in Next step (do not delete it), add `backup-shipper` to Depends on, restore howto gains the papiros fetch. Bump "Last reviewed". Do not copy the shipper's facts (retention, schedule): link instead. |
| `services/backup-shipper/info.md` | "Used by: Trade4me database backups"; "Keeps the last 5 release and 14 periodic copies per application" (config per app now: pachanguero's counts); Run mode "on demand after a release"; Volumes: "reads staging ... (read-only)"; Status "no real backups staged yet"; Howtos "Restore: TODO". | Used by gains Pachanguero; counts line must say per application, with pachanguero's values (or point to the chart values); Status update after the first shipment; Restore howto can point to `recovery.md`. NOTE surprise: "read-only" is untrue already: the chart mounts `/staging` read-write and the script deletes from it (`trim_staging`). History line for the opt-in with the absolute date. "Last reviewed". |
| `services/registry.md` | backup-shipper row "CronJob, daily 09:00 -> papiros 873/tcp (deployed)"; Pachanguero row `https://pachanguero.duckdns.org` and NodePort. | No change needed in either row: they hold only name/host/ports (rule: three columns only). Update only "Last reviewed" if the file is touched; likely not touched. |
| `services/rsync-papiros/info.md` | "Used by" lists backup-shipper; "`erebor` writes only under `NetBackup/erebor/`"; module list. | Still true (`NetBackup/erebor/pachanguero/` is under it). No change; at most nothing. `inference`: the daemon creates the `pachanguero` folder through `reach_papiros` with the `netbackup` account, whose permissions apply to the whole `NetBackup` module. |
| `services/hyper-backup/info.md` | "general Papiros Backup" backs up `papiros`; Security: no off-site copy. | Not made untrue. `unknown` whether `NetBackup/erebor/` is within the Hyper Backup task's scope (page says scope TODO): if it is, the pachanguero copies reach `alejandria` too; do not claim it. |
| `services/k3s/info.md`, `services/trade4me/info.md` | not read in this study | `unknown` whether they mention the shipper; trade4me's `info.md` may say its backups are copied by the shipper (still true). |
| `network.md`, `hardware.md` | not read | Rule: no service facts in `hardware.md`; no network change from this. `unknown`, grep before editing. |

Doc map contributions (variant inventory for the pachanguero side of the WP): the shipper side contributes (a) the exact name contract (`<kind>_<UTC>_<version>.<ext>`, `.`-first write then rename, shipper trims staging so the producer must not delete there), (b) the `values.yaml` `apps:` entry owned by trade4me-server (cross-repo change: pachanguero cannot opt itself in), (c) the on-demand trigger (`kubectl create job --from=cronjob/backup-shipper -n backup`), (d) the restore path through `restore-backup.sh --app pachanguero --list` plus the generic manual `rsync`+`openssl` lines, (e) the shared passphrase dependency, (f) the per-app staging directory and uid 1000 ownership, (g) home-network-map updates listed above.

Surprises found: `info.md` says staging is read-only (untrue); staged files with a `.db-2` style suffix would be silently unshipped; `restore-backup.sh` refuses non-trade4me apps except `--list`; `/var/backups/erebor/` does not exist on this laptop (expected; it is erebor-only), so nothing local could be verified.

Signal: surprising

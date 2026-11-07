# Deployment on erebor

Production: `https://pachanguero.duckdns.org` on `erebor` (k3s, namespace `pachanguero`), behind
the Caddy on `numenor`. The house network is documented in `home-network-map`
(`services/pachanguero/info.md`). The chart is in [`deploy/helm/pachanguero`](../deploy/helm/pachanguero)
(defaults in its `values.yaml`, NodePort 9400); the DuckDNS name and the Caddy site live in
`machine_setup_numenor` (`docker/duckdns`, `docker/caddy/Caddyfile.enabled`).

## One-time setup

1. Create `pachanguero.duckdns.org` on duckdns.org and add it to the updater, then apply the Caddy site
   (its block is in `Caddyfile.enabled`): "Adding a site to Caddy" in `machine_setup_numenor/docs/docker_gitops_workflow.md`.
2. Give `telperion` `helm`, `kubectl` and a kube context named `erebor`: procedure in the
   `pachanguero-deployment-management` skill (`ai-kit/skills`), section "Refreshing the kubeconfig context".
3. `cp deploy/helm/pachanguero/values.secrets.yaml.example deploy/helm/pachanguero/values.secrets.yaml`
   and set `secrets.jwtSecret` (git-ignored and excluded from the chart by `.helmignore`; a symlink to a file
   outside the repository works).
4. The backup staging folder must exist on `erebor` before the first deploy, owned by uid 1000
   (`/var/backups/erebor/pachanguero`, the chart's `backup.stagingPath`). The chart mounts it with
   `type: Directory`: without it the pod stays in `ContainerCreating` and nothing creates it.
5. After the first release, create the first admin:
   [`commands.md`](commands.md#the-admin-tool) `create … --role admin`, run through the `exec` line of the
   `pachanguero-deployment-management` skill (`-it`, so the password can be typed).

## Releasing

Steps, order and version rules: [`pachanguero-release`](../ai-kit/skills/pachanguero-release/SKILL.md).
In short: verify the tree, bump with `scripts/bump-version.sh <X.Y.Z>` and commit as `Release <X.Y.Z>`,
check the built image, push, tag, take the release backup, deploy, check production.

```bash
./build.sh                         # builds pachanguero:<package.json version>, pulls the base image, upgrades the OS packages
scripts/verify-release.sh image    # the image starts on a throwaway database and answers a login
./build.sh --push                  # pushes it and :latest to 192.168.1.87:30500
kubectl --context erebor -n pachanguero exec deploy/pachanguero -c backup -- pachanguero-admin backup --kind release --version <X.Y.Z>
deploy/deploy.sh --tag <X.Y.Z>     # a version only: `latest` and any other tag are refused
scripts/verify-release.sh deployed --version <X.Y.Z>
```

- Pass the version as `--tag`. `--restart` is for development only: a deployed version is never re-pushed.
- An update that only moves third-party versions is a patch release; the
  [`pachanguero-3pp-update`](../ai-kit/skills/pachanguero-3pp-update/SKILL.md) skill makes the commit
  and hands over to the release skill.
- `telperion` must trust the registry as insecure (`insecure-registries` in `/etc/docker/daemon.json`).
- Every build carries the OS packages of its UTC day: `build.sh` pulls the base image and passes the
  date as a build argument that re-runs the `apt-get upgrade` layer ([Dockerfile](../Dockerfile)).
- The release backup is `release_<UTC>_<X.Y.Z>.db` in the staging folder, taken before the deploy
  changes anything. A release that changes the schema also makes its own `release_…` backup when the
  new version starts ([`backup_and_restore.md`](backup_and_restore.md)).
- Success: `deploy.sh` exits 0, `get pods` (skill) shows the pod Running with both containers ready,
  and `scripts/verify-release.sh deployed` passes (it cannot reach the public address from the house:
  the operator confirms `curl -I https://pachanguero.duckdns.org` from outside, see
  [Checks](#checks)).
- A failed release is rolled back to the previous `--tag`. If it migrated the schema, first restore the
  `release_<UTC>_<new version>.db` taken before the deploy (it holds the data from just before the release) ([procedure](#restoring-a-backup-on-erebor),
  with `<version>` = the previous tag, the backup copied out first as shown there, and without its last
  `scale --replicas=1` line), then run `deploy/deploy.sh --tag <previous>`, which starts the pod with
  the previous image. Check that `get pods` shows it ready; if replicas stayed at 0, run the omitted
  `scale` line. Data entered since the release is lost. A version that was pushed or deployed is never
  reused: fix forward with the next patch.

## Data and backups

- One volume claim (`data-disk` class), kept when the release is uninstalled: `pachanguero-data` (`/data`).
- `/backups` is the host folder `/var/backups/erebor/pachanguero` on `erebor` (chart value
  `backup.stagingPath`, a `hostPath` of type `Directory`): the staging folder of the backup shipper. The
  application never deletes from it; the shipper trims it.
- The `backup` sidecar runs `pachanguero-admin backup` every Tuesday at 08:15 Madrid time
  (`backup.weekday`, `backup.timeMadrid`), a day without a game, 45 minutes before the shipper's
  09:00 run. Names, kinds and the shipper's rules: [`backup_and_restore.md`](backup_and_restore.md#two-kinds-of-backup).
- The shipper (`trade4me-server`, namespace `backup`) encrypts each staged file and copies it to
  `papiros`; pachanguero is one of its `apps:`. Its facts are in `home-network-map`
  (`services/backup-shipper`).
- Restore, including from `papiros`: [`backup_and_restore.md`](backup_and_restore.md#fetching-a-copy-from-papiros).
  The old claim `pachanguero-backups` stays in the cluster (kept on uninstall) until the operator
  deletes it after a restore drill.

## Cutover to staged backups

One-time, for the first release whose backups are staged for the shipper; each step that touches the
cluster or `papiros` waits for the operator's go-ahead. The running pod still has the old chart and the
old backup names. Do anything that needs `papiros` between 08:00 and 01:00 Madrid time.

1. With the old pod, take a fresh copy: `$K exec deploy/pachanguero -c backup -- pachanguero-admin backup`
   (the old command and name), with `K="kubectl --context erebor -n pachanguero"`.
2. Note its file name, its modification time in epoch seconds (`stat -c %Y`) and the running version
   (the Deployment's image tag).
3. Copy it out (`$K cp <pod>:/backups/<file> … -c backup`) and into the staging folder on `erebor` under a
   hidden name (`.release_<UTC>_<version>.db.part`), then rename it to
   `release_<UTC from the epoch>_<running version>.db`; the stamp is
   `date -u -d @<epoch> +%Y%m%dT%H%M%SZ`. Check the name against the shipper's pattern
   ([`backup_and_restore.md`](backup_and_restore.md#two-kinds-of-backup)) with `grep -E`, and that the
   folder holds that file and no hidden one.
4. Add `pachanguero` (`release: 5`, `periodic: 14`) to `apps:` of the `backup-shipper` chart in
   `trade4me-server` and redeploy it with `k8s/deploy-backup-shipper.sh`; then release as usual.
5. Create a shipper job from the CronJob (`kubectl create job --from=cronjob/backup-shipper … -n backup`)
   and read its log: one `pushed <name>` per staged file; a second job pushes nothing.
6. Drill once ([`backup_and_restore.md`](backup_and_restore.md#fetching-a-copy-from-papiros)) and record it
   in its "Restore drills" table; repeat for a `periodic` copy after the first Tuesday run.
7. Only after the drill, and with the operator's go-ahead, delete the old claim `pachanguero-backups`
   (check the storage class's reclaim policy first).

## Deployment impact of a change

When a change touches one of these, update what is listed in the same commit (paths under `templates/` and `values*.yaml` are in the chart, `deploy/helm/pachanguero`). Then run `helm lint deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example` and `helm template pachanguero deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example > /dev/null`. Unsure whether a change is deployment-relevant: grep the chart and the `Dockerfile` for the old name. The settings row is also enforced by [`deployment-settings.test.ts`](../server/src/deployment-settings.test.ts) ([test strategy](test-strategy.md#deployment-settings-test)).

| Change                                                                                                                                         | Also update                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A setting (environment variable) added, renamed or removed, or a new default                                                                   | `.env.example`; the settings table in `docs/commands.md`; if the operator may set it in production, a value in `values.yaml` and an `env:` entry in `templates/deployment.yaml` (today only `PACHANGUERO_PUBLIC_URL`; the Secret carries `JWT_SECRET` and the optional bank secrets); if the container needs a default, the `Dockerfile` `ENV` and the line listing the image's defaults in the Docker section of `docs/commands.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| A new secret                                                                                                                                   | `templates/secret.yaml`, the `secrets:` block in `values.yaml`, `values.secrets.yaml.example`, and the operator's own `values.secrets.yaml` (tell the user)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Port, listen address, health-check path, or the `/data` and `/backups` volumes                                                                 | `Dockerfile` (`PORT`, `EXPOSE`, `HOST`); `containerPort` and both probes in `templates/deployment.yaml`; `port` in `templates/service.yaml`; the `/data` and `/backups` mounts of the app and backup containers; the staging `hostPath` (`backup.stagingPath`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pachanguero-admin backup`, backup file names or folder                                                                                        | the shipper's accepted name pattern (`NAME_RE` in `trade4me-server`'s `backup-shipper` chart, `files/push-backups.sh`) and its staging folder: a name it does not match is never shipped, silently; `server/src/domain/backup-name.ts` and its test (which holds the pattern); `scripts/verify-release.sh` (checks the shape of the names, and hardcodes the `erebor` context and namespace); `AGENTS.md`, `docs/commands.md`, `.env.example` and the release, deployment-management and production-copy skills (they quote the names); `server/src/db/database-backup.test.ts`; `scripts/prod-copy.sh` (takes the newest `periodic_*.db` or `release_*.db` and reads the command's `✓` line); the release skill (the release backup and its check); the `staging` `hostPath` (`backup.stagingPath`) and the folder on `erebor`; `docs/backup_and_restore.md`, `docs/deployment.md#data-and-backups`; `home-network-map` (`services/pachanguero`, `services/backup-shipper`) |
| A new workspace, a changed `dist` layout or entry point, the `pachanguero-admin` command name, or the container user                           | `Dockerfile` (the `COPY …/package.json` lines, `CMD`, the admin wrapper, `USER`); for the user, `securityContext` in `templates/deployment.yaml`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Node version or a native dependency                                                                                                            | the single `NODE_IMAGE` pin of the `Dockerfile` and `.nvmrc`; the `@types/node` major; the backup sidecar runs the same image and needs GNU `date` and the `Europe/Madrid` zone data; the [`pachanguero-3pp-update`](../ai-kit/skills/pachanguero-3pp-update/SKILL.md) skill moves these, with the exact `jose` and `@dnd-kit/core` pins and the npm dependencies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| The version the app reports (`PACHANGUERO_VERSION`, set in `templates/deployment.yaml` for both containers from the image tag or `appVersion`) | the backup names carry it; `.env.example`, the settings table in `docs/commands.md`, `scripts/verify-release.sh deployed`, `scripts/bump-version.sh`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| The registry, host, namespace, NodePort, pod label or container names                                                                          | `build.sh`, `deploy/deploy.sh`, `values.yaml`, `docs/deployment.md`, `scripts/prod-copy.sh`, and the `--context`/`-n` lines of the two skills in `ai-kit/skills/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## The bank connection

The app can read the organiser's bank account to settle Bizum payments. It is optional: without the
settings below the app starts and everything else works, and the Banco panel (Manage) names what is
missing.

| Setting                      | Where                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `PACHANGUERO_PUBLIC_URL`     | `publicUrl` in `values.yaml`, the `env:` entry in `templates/deployment.yaml`   |
| `ENABLE_BANKING_APP_ID`      | `secrets.enableBankingAppId` in the operator's `values.secrets.yaml`            |
| `ENABLE_BANKING_PRIVATE_KEY` | `secrets.enableBankingPrivateKey` in `values.secrets.yaml`, a YAML block (`\|`) |

- **Both secrets are optional in the chart** (no `required`); `JWT_SECRET` stays required.
  `values.secrets.yaml.example` shows the entries, and how to make the key and certificate.
- **The redirect address** `<publicUrl>/api/bank/callback` (production:
  `https://pachanguero.duckdns.org/api/bank/callback`) must be listed, exactly, as an allowed redirect
  URL of the production application at the Enable Banking Control Panel; the certificate made with
  the key is uploaded there.
- **The operator's own `values.secrets.yaml`** is not in the repository: add the two entries to it
  before the release that first carries the bank connection.
- **Check after a release:** `helm template` shows `PACHANGUERO_PUBLIC_URL` under `env:` and the two
  keys in the Secret, and the Banco panel names no missing setting.
- **The connection** lasts at most 180 days (179 are asked for); the app warns 14 days before the end
  and the organiser renews it from the panel. The session id is kept in the database, so the
  backups hold it too: see [`backup_and_restore.md`](backup_and_restore.md).
- `ENABLE_BANKING_API_URL` is not in the chart: the real host is the default, and only the
  end-to-end tests point it elsewhere.

## Restoring a backup on erebor

How to restore a backup, and how a database from another machine becomes production. The generic rules
are in [`backup_and_restore.md`](backup_and_restore.md#restoring-a-backup); here the application is
stopped by scaling to 0, and a throwaway pod reaches the data volume. `<version>` is the tag now
deployed (in a rollback, the previous tag); delete a leftover `restore` pod first.

```bash
K="kubectl --context erebor -n pachanguero"
$K scale deploy/pachanguero --replicas=0
$K wait --for=delete pod -l app=pachanguero --timeout=120s
$K run restore --image=registry.local:5000/pachanguero:<version> --restart=Never --overrides='{
  "spec": {"securityContext": {"runAsUser": 1000, "runAsGroup": 1000, "fsGroup": 1000},
    "containers": [{"name": "restore", "image": "registry.local:5000/pachanguero:<version>",
      "command": ["sleep", "3600"], "volumeMounts": [{"name": "data", "mountPath": "/data"}]}],
    "volumes": [{"name": "data", "persistentVolumeClaim": {"claimName": "pachanguero-data"}}]}}'
$K wait --for=condition=Ready pod/restore
$K cp <backup>.db restore:/data/restore.db   # a local file
$K exec restore -- sh -c 'rm -f /data/pachanguero.db-wal /data/pachanguero.db-shm && mv /data/restore.db /data/pachanguero.db'
$K delete pod restore
$K scale deploy/pachanguero --replicas=1
```

A backup that lives on the cluster is first copied out of the running pod, before scaling to 0:
`$K cp <pod>:/backups/<file>.db <file>.db -c backup` (the sidecar stays up even if the app container
crash-loops), or, with the pod gone, from the staging folder on `erebor` or from `papiros`
([`backup_and_restore.md`](backup_and_restore.md#fetching-a-copy-from-papiros)).

The pod runs as uid 1000, so the restored file has the application's owner. Check that you can log in
and that the data is the expected data. Keep the replaced database until a newer backup exists.

## Checks

Pods, services and logs: the `pachanguero-deployment-management` skill. The release runs
`scripts/verify-release.sh` before the push (`image`) and after the deploy (`deployed`); what each
checks and how it is tested: [`test-strategy.md`](test-strategy.md#tiers-time-and-gate). The public
address is reachable only from outside the house: with the Caddy toggle enabled,
`curl -I https://pachanguero.duckdns.org` answers `200` over a valid certificate, and the operator
confirms it.

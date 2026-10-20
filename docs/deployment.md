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
4. After the first release, create the first admin:
   [`commands.md`](commands.md#the-admin-tool) `create … --role admin`, run through the `exec` line of the
   `pachanguero-deployment-management` skill (`-it`, so the password can be typed).

## Releasing

Bump with `scripts/bump-version.sh <X.Y.Z>` and commit as `Release <X.Y.Z>` (version rules and order:
[`pachanguero-release`](../ai-kit/skills/pachanguero-release/SKILL.md)); then:

```bash
./build.sh --push        # builds pachanguero:<package.json version>, pushes it and :latest to 192.168.1.87:30500
deploy/deploy.sh --tag <version>
```

- Pass the version as `--tag`. `--restart` is for development only: a deployed version is never re-pushed.
- `telperion` must trust the registry as insecure (`insecure-registries` in `/etc/docker/daemon.json`).
- A release that changes the schema migrates the database on start-up, after a
  `…-before-migration.db` backup ([`backup_and_restore.md`](backup_and_restore.md)).
- Success: `deploy.sh` exits 0, `get pods` (skill) shows the pod Running with both containers ready, and
  the Checks below pass.
- A failed release is rolled back to the previous `--tag`. If it migrated the schema, first restore its
  `…-before-migration.db` ([procedure](#restoring-a-backup-on-erebor), with `<version>` = the previous
  tag, the backup copied out first as shown there, and without its last `scale --replicas=1` line),
  then run `deploy/deploy.sh --tag <previous>`, which starts the pod with the previous image. Check
  that `get pods` shows it ready; if replicas stayed at 0, run the omitted `scale` line. Data entered
  since the release is lost.

## Data and backups

- Two PVCs (`data-disk` class), kept when the release is uninstalled: `pachanguero-data` (`/data`)
  and `pachanguero-backups` (`/backups`).
- The `backup` sidecar runs `pachanguero-admin backup` daily at `backup.hourUtc` and keeps the last
  `backup.keep` of them; `…-before-migration.db` files are never pruned.
- Both volumes are on `erebor`'s disk, so a backup there does not survive losing the disk. Copying
  `/backups` to `papiros` is not automated yet.
- Restore: [`backup_and_restore.md`](backup_and_restore.md).

## Deployment impact of a change

When a change touches one of these, update what is listed in the same commit (paths under `templates/` and `values*.yaml` are in the chart, `deploy/helm/pachanguero`). Then run `helm lint deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example` and `helm template pachanguero deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example > /dev/null`. Unsure whether a change is deployment-relevant: grep the chart and the `Dockerfile` for the old name. The settings row is also enforced by [`deployment-settings.test.ts`](../server/src/deployment-settings.test.ts) ([test strategy](test-strategy.md#deployment-settings-test)).

| Change                                                                                                               | Also update                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A setting (environment variable) added, renamed or removed, or a new default                                         | `.env.example`; the settings table in `docs/commands.md`; if the operator may set it in production, a value in `values.yaml` and an `env:` entry in `templates/deployment.yaml` (today only `PACHANGUERO_PUBLIC_URL`; the Secret carries `JWT_SECRET` and the optional bank secrets); if the container needs a default, the `Dockerfile` `ENV` and the line listing the image's defaults in the Docker section of `docs/commands.md` |
| A new secret                                                                                                         | `templates/secret.yaml`, the `secrets:` block in `values.yaml`, `values.secrets.yaml.example`, and the operator's own `values.secrets.yaml` (tell the user)                                                                                                                                                                                                                                                                          |
| Port, listen address, health-check path, or the `/data` and `/backups` volumes                                       | `Dockerfile` (`PORT`, `EXPOSE`, `HOST`); `containerPort` and both probes in `templates/deployment.yaml`; `port` in `templates/service.yaml`; the `/data` and `/backups` mounts of the app and backup containers                                                                                                                                                                                                                      |
| `pachanguero-admin backup`, backup file names or folder                                                              | the backup sidecar script in `templates/deployment.yaml` (its retention globs depend on the names), `docs/backup_and_restore.md`, `docs/deployment.md#data-and-backups`                                                                                                                                                                                                                                                              |
| A new workspace, a changed `dist` layout or entry point, the `pachanguero-admin` command name, or the container user | `Dockerfile` (the `COPY …/package.json` lines, `CMD`, the admin wrapper, `USER`); for the user, `securityContext` in `templates/deployment.yaml`                                                                                                                                                                                                                                                                                     |
| Node version or a native dependency                                                                                  | both `FROM` lines of the `Dockerfile`; the backup sidecar runs the same image and needs GNU `date -d`                                                                                                                                                                                                                                                                                                                                |
| The registry, host, namespace or NodePort                                                                            | `build.sh`, `deploy/deploy.sh`, `values.yaml`, `docs/deployment.md`, and the `--context`/`-n` lines of the two skills in `ai-kit/skills/`                                                                                                                                                                                                                                                                                            |

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
crash-loops).

The pod runs as uid 1000, so the restored file has the application's owner. Check that you can log in
and that the data is the expected data. Keep the replaced database until a newer backup exists.

## Checks

Pods, services and logs: the `pachanguero-deployment-management` skill. From outside the house, with the Caddy toggle enabled,
`curl -I https://pachanguero.duckdns.org` answers `200` over a valid certificate.

CODENAME: SD-DEPLOYMENT-321

# Deployment on erebor

How pachanguero reaches production and the rules every release follows, for whoever ships it or
changes something that ships with it. Release steps and their order are in `skill: pachanguero-release`, `skill: pachanguero-deployment-management` and
`skill: pachanguero-3pp-update`; this document does not repeat them. What a change owes the deployment is
the rule [`deployment-impact.md`](../.agents/rules/deployment-impact.md); the bank setup is in
[`bank-connection.md`](bank-connection.md).

## What runs where

- **Production** is the `publicUrl` of the chart's `values.yaml`, on `erebor` (k3s, namespace `pachanguero`), reached
  through the Caddy on `numenor`. The DuckDNS name and the Caddy site live in `machine_setup_numenor`
  (`docker/duckdns`, `docker/caddy/Caddyfile.enabled`); the network is in `home-network-map`
  (`services/pachanguero`). There is no staging copy.
- **One image** serves the SPA and the API on one port. It is built on `telperion` and pushed to the registry
  on `erebor` (`registry` in `values.yaml`, `REGISTRY` in `build.sh`).
- **One pod, one replica** ([`architecture.md`](architecture.md)), deployed with the chart's `Recreate` strategy. The pod holds the app and a `backup` sidecar running the same image.
- **The chart** is [`deploy/helm/pachanguero`](../deploy/helm/pachanguero) (defaults in `values.yaml`). Secrets are in the operator's `values.secrets.yaml`, never in the repository.

## One-time setup

What must exist before the first deploy; none of it recurs per release.

- **`telperion`**, the machine that builds and deploys, has `helm`, `kubectl`, a kube context named `erebor` and the registry trusted as insecure (`insecure-registries` in `/etc/docker/daemon.json`).
- **The operator's `values.secrets.yaml`**, made from `values.secrets.yaml.example`, sets at least `secrets.jwtSecret`. It is git-ignored and excluded from the chart by `.helmignore`; it may be a symlink to a file outside the repository.
- **The backup staging folder** (the chart's `backup.stagingPath`) exists on `erebor`, owned by uid 1000. The chart mounts it as `type: Directory`: without it the pod stays in `ContainerCreating` and nothing creates it.
- **The first admin** is created after the first release with the admin tool ([`commands.md`](commands.md#the-admin-tool)).

## Releasing

- **A version is immutable.** The version in `package.json` is the image tag and the chart's `appVersion`,
  and changes only through `scripts/bump-version.sh`. `deploy/deploy.sh` accepts only an `X.Y.Z` tag, never
  `latest`. A version that was pushed or deployed is never re-pushed, moved or reused: a fix is the next
  patch. `--restart` is for development only.
- **Rollback is a redeploy of the previous tag** (`deploy/deploy.sh --tag <previous>`). If the release migrated the schema, the release backup taken before it is restored first ([`backup_and_restore.md`](backup_and_restore.md#restoring-a-backup)). Data entered since the release is lost.

## Data and backups

- **Data** is one volume claim (`data-disk` class), `pachanguero-data` at `/data`, kept when the release is uninstalled.
- **Backups** go to `/backups`, the host folder set by the chart value `backup.stagingPath`, written by the app and the `backup` sidecar. Schedule, names, retention, the shipper and restores: [`backup_and_restore.md`](backup_and_restore.md).

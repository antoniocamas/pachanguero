# Decisions of interview 2 (Q-05, Q-11)

## Q-05 — the version in a backup name

- The name carries the version being deployed (the new one), as the shipper's contract says for `release`.
- The release skill takes, before the deploy, a backup of the running pod into staging as
  `release_<UTC>_<new version>.db`. The in-pod before-migration backup stays and is also a `release`
  file, named with the version of the code that runs the migration.
- `deploy.sh` refuses `--tag latest`, so no file is ever named `latest`.
- The version reaches the app as an environment variable set by the chart from
  `default .Chart.AppVersion .Values.image.tag`; unset, the name carries `unreleased`.

## Q-11 — how the 3pp skill and the release hand over

- An upgrade-only release is a patch. The 3pp skill commits (after the author's yes) and hands over to
  `pachanguero-release`.
- OS patches: an `apt-get upgrade` layer in both Dockerfile stages, re-run by a date build argument that
  `build.sh` sets, and `build.sh` builds with `--pull` (as trade4me's `OS_REFRESH`).
- Pins: the base image is the exact tag `26.13.0-trixie-slim`, kept in one place (a `build.sh` build
  argument with the Dockerfile default). The 3pp skill moves that tag as part of its update, like every
  other pin. npm keeps caret ranges and the lockfile; `jose` and `@dnd-kit/core` stay exact;
  `@types/node` follows the runtime major.
- The first run of the 3pp skill also settles the typescript mismatch (root lock 6.0.3, workspaces 7.0.2).

Signal: surprising (no release backup exists today).

# 02 — Backups named for the shipper and staged on the host

## Type
Feature · Iteration 1 · Absorbs: F1, F2, F3 · Depends on: none (run after 01 only to keep the Dockerfile edits apart)

## Mandatory Reading
- `specs/active/WP-007-backups-and-currency/DESIGN_PLAN.md`: section 2 (HLD) and the LLD of each absorbed element
- `specs/active/WP-007-backups-and-currency/REQUIREMENTS.md`: the use cases cited above
- `AGENTS.md`, `docs/test-strategy.md`
- The implementor also discovers, through the project's documentation-routing rule (`AGENTS.md`), the guidelines covering the specific files touched.
- `.agents/rules/coding-standard.md`
- `requirements/examples/backup-names.md`
- `study/shipper-and-restore.md`, `study/erebor-state.md`, `study/backups-in-pachanguero.md`, `study/decisions.md`
- `.agents/rules/coding-standard.md`, `deploy/helm/pachanguero/`, `scripts/prod-copy.sh`
- Helm documentation for `hostPath` volumes and template variables

## Description
One scenario family (UC-007-01): every backup is a complete file named `<kind>_<UTC>_<version>[-n].db` in the staging folder, never deleted by the app, and the production copy tool reads it. F1 writes the names (new `BackupName`, `DatabaseBackup`, migrator seam, CLI `--kind`/`--version`, `PACHANGUERO_VERSION`). F2 mounts the host staging folder at `/backups`, sets the version in both containers, runs the weekly Tuesday 08:15 Madrid backup with no prune, and makes `deploy.sh` refuse non-semver tags. F3 teaches `prod-copy.sh` the new names. They are one task because F2 and F3 are meaningless without F1's names.

## Guidelines
1. [x] **F1** (LLD in the design, §3): create `server/src/domain/backup-name.ts` and test; modify `database-backup.ts`, `schema-migrator.ts`, `db/index.ts`, `cli/user-cli.ts`, `cli/main.ts`; delete `LocalCalendar.timestampOf` and its test. Classes only, no free functions or stateless static (`coding-standard.md`). Copy the shipper's name regex into the test with a comment citing `push-backups.sh`.
2. [x] **F2** (LLD in the design, §3): `deployment.yaml` (version variable, `PACHANGUERO_VERSION` on both containers, hostPath `type: Directory`, 30-second polling sidecar on `TZ=Europe/Madrid`, prune line deleted), `pvc.yaml` (second PVC document removed), `values.yaml` (new `backup.stagingPath/weekday/timeMadrid`; remove `storage.backupsSize`, `backup.hourUtc/keep`; validate the weekday in the template), `deploy.sh` (semver-only `--tag`, usage text). Before relying on the zone data, check it exists in the image: `docker run --rm <base image> ls /usr/share/zoneinfo/Europe/Madrid`; if absent, stop and report (adding `tzdata` is an installation in the build and needs the user's decision).
3. [x] **F3**: only the `ls` glob and usage text in `scripts/prod-copy.sh`; one sentence in `ai-kit/skills/pachanguero-setup-production-copy/SKILL.md`.
4. [x] Keep `deployment-settings.test.ts` green (the variable is set in the chart).

## Tests
- Unit (vitest, server): `backup-name.test.ts` (stamp from a UTC instant, `TZ=Asia/Tokyo` gives the same name, `-2` before `.db`, empty version becomes `unreleased`, a version with `_` or `/` rejected, every producible name matches the shipper regex, the nine rows of the examples file); `database-backup.test.ts` (complete copy, no `.`-name left after success or failure, `-2` in the same second, an existing final name untouched, mode 0600, other files untouched, nothing deleted with 20 files present); `user-cli.test.ts` (`--kind release --version 0.4.0`, default, bad kind exits 2, bad version exits 1, `✓ <path>` line unchanged); `schema-migrator.test.ts` (the pre-migration file is a `release_` name).
- Chart: `helm lint`; `helm template ... -f values.secrets.yaml.example` shows hostPath with `type: Directory`, `PACHANGUERO_VERSION` on both containers, one PVC, no prune; a bad weekday fails the render.
- Script: `deploy.sh --tag latest` exits non-zero with a stub `helm` on PATH never called; a semver tag reaches the stub.
- Script: the `prod-copy.sh` listing line run on a temporary folder holding an old `pachanguero-*.db`, a `periodic_…` and a newer `release_…`: the `release_` file is chosen.

## Manual Test Plan
1. After the real deploy (task 06), `ls -a /var/backups/erebor/pachanguero` on erebor shows no `.`-files.
2. Run `kubectl exec deploy/pachanguero -c backup -- pachanguero-admin backup`; a `periodic_<UTC>_<version>.db` owned by uid 1000 appears.
3. Restart the pod; it comes back. The next Tuesday 08:15 Madrid a file appears without action.
4. Run `scripts/prod-copy.sh` and with `--fresh` against the real pod; the copy opens with `npm run dev:prod-copy`.
These steps run during task 06, which records the outcome.

## Definition of Done
- [x] All tests above pass: `npm test`
- [x] `helm lint` and the `helm template` checks pass; the `deploy.sh` stub run passes; the `prod-copy.sh` glob run picks the `release_` file
- [x] The zone data check ran: `/usr/share/zoneinfo/Europe/Madrid` exists in `node:26-slim` and `TZ=Europe/Madrid date` works (2026-11-07)
- [x] **Hard requirement**: the tests carrying UC-007-01 (names match the shipper pattern; hidden-then-rename; no deletion; `-2` clash) exist, with the UC id in their names and a `hard requirement` marker in the describe title, so they can be found after the work package closes
- [x] **Graduation**: UC-007-01-S1…S8 → `hard requirement` (unit tests above, chart and script checks)
- [x] **Documentation**: `Dockerfile`/`.env.example`/`deploy.sh` usage lines that this task makes untrue are corrected in place; `docs/*`, `AGENTS.md` and the infrastructure documents are written in task 05 (anatomy order)
- [x] **Tests**: `npm test`
- [x] **Regression**: `npm test`
- [x] **Code checks**: `npm run lint`, `npm run format:check`, `npm run build`

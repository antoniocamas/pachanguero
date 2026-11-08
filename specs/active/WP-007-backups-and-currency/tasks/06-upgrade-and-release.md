# 06 — The real upgrade and release, with the cutover

## Type
Feature · Iteration 1 · Absorbs: F8, F9 · Depends on: 01–05 (uses only what they built: code, skills, documents)

## Mandatory Reading
- `specs/active/WP-007-backups-and-currency/DESIGN_PLAN.md`: section 2 (HLD) and the LLD of each absorbed element
- `specs/active/WP-007-backups-and-currency/REQUIREMENTS.md`: the use cases cited above
- `AGENTS.md`, `docs/test-strategy.md`
- The implementor also discovers, through the project's documentation-routing rule (`AGENTS.md`), the guidelines covering the specific files touched.
- `ai-kit/skills/pachanguero-release/SKILL.md`, `ai-kit/skills/pachanguero-deployment-management/SKILL.md`, `ai-kit/skills/pachanguero-3pp-update/SKILL.md`, `docs/deployment.md`, `docs/backup_and_restore.md`
- `study/shipper-and-restore.md`, `study/erebor-state.md`; `trade4me-server` `docs/deployment/release.md` ("Backup shipper") and `k8s/deploy-backup-shipper.sh`

## Description
This task builds nothing new; it uses what 01–05 left. Operator work with a stop for the user's go-ahead before every step that touches the cluster, papiros, another repository or a push. Order (design F9): (1) take a fresh backup with the old pod's own command; (2) read its file name, modification epoch and the running version; (3) copy it into the staging folder as `release_<UTC from the epoch>_<running version>.db` through a hidden name, check with `ls` and the shipper regex; (4) commit the shipper `apps:` entry (`pachanguero`, `release: 5`, `periodic: 14`) in `trade4me-server` and redeploy the shipper (F8); (5) run the 3pp skill for real (report, update, checks, one commit), then the release skill: patch version, `release` backup first (one-time exception: the old pod has no `--kind`), image checks, push, deploy, deployed checks (including the public address, confirmed by the user); (6) create a shipper job between 08:00 and 01:00 Madrid time and read `pushed` per staged file, none on a second run; (7) the restore drill by the user, who holds the passphrase, never printed; repeat for a `periodic_` copy after the first Tuesday run; (8) retire the old PVC `pachanguero-backups` only after the drill and with the user's go-ahead, after checking the storage class's reclaim policy.

## Guidelines
1. Read the three skills and `docs/deployment.md` first; follow them as written. Where a skill is wrong or missing a step, stop and tell the user: do not improvise around it.
2. Never read or print the passphrase or any secret. No force-push; nothing pushed or deployed without the user's explicit yes.
3. The only file this task writes in the repository: the drill date in the "Restore drills" line of `docs/backup_and_restore.md`; and the second 3pp report's standing decisions, if any, in `.3pp-management.md`.
4. Also carry out the manual plans of tasks 02 and 03 (staging folder content, manual backup, restart, `prod-copy.sh` with and without `--fresh`, `deployed` mode) and the 3pp acceptance checks of task 04 (second report lists only held items; a deliberate break on a scratch copy is not committed).

## Tests
- Full regression before the release: `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `helm lint`; `npm run test:e2e` only if a framework moved (UC-007-04-S2).
- Operator checks: see Manual Test Plan.

## Manual Test Plan
1. After step (3), the staging folder holds exactly the one adopted file and no hidden file.
2. After step (6), the shipper job log shows `pushed release_…`, none on the second run; `restore-backup.sh --app pachanguero --list` shows the name on both sides.
3. After the deploy, `kubectl` shows the pod on the released version, `verify-release.sh deployed` passes and the user confirms the public address.
4. The drill: fetch, decrypt in a scratch folder (`umask 077`), `PRAGMA integrity_check` prints `ok`, a known player and the latest game answer in a throwaway instance (`PACHANGUERO_DB`, another port), `cmp` against the staged file, scratch folder deleted, date recorded.
5. After retirement, `kubectl get pvc` no longer lists `pachanguero-backups`; a copy exists on papiros.

## Definition of Done
- [ ] Full regression passes (commands above)
- [ ] The released version is a patch, pushed once, deployed, both containers ready, deployed checks pass
- [ ] The adopted backup is on papiros and the `pushed` lines are in the task notes
- [ ] One drill from papiros recorded with its date in `docs/backup_and_restore.md`: `ok` integrity, players and games answer (and a `periodic_` drill after the first Tuesday run)
- [ ] The old PVC is retired after the drill, with the user's go-ahead
- [ ] The second 3pp report lists only held items with reasons
- [ ] **Graduation**: UC-007-02-S1…S4 → `document` (drill record, restore chapter); UC-007-03-S4, S6, S7 and UC-007-04-S1…S5 → `document` (confirmed by the real run); UC-007-01 → `hard requirement` (confirmed live)
- [ ] **Documentation**: the drill date in `docs/backup_and_restore.md` and, if the run showed a step wrong, that step in the skill or document
- [ ] **Tests**: `npm test`, `npm run test:e2e` if a framework moved
- [ ] **Regression**: `npm test`
- [ ] **Code checks**: `npm run lint`, `npm run format:check`

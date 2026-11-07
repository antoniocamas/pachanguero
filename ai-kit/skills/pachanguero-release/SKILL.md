---
name: pachanguero-release
description: Cut a pachanguero release - choose the version, verify, bump and commit, check the built image, push it, tag, back up production, deploy to erebor and verify production. Use when the user says release, bump the version or deploy a new version.
---

# Pachanguero release

Registry, success checks and rollback are in [`docs/deployment.md`](../../../docs/deployment.md#releasing);
cluster commands are the `pachanguero-deployment-management` skill.

The version lives in `package.json`, `package-lock.json` and the chart's `version` and `appVersion`;
change it only with `scripts/bump-version.sh`.

Invoking this skill is the user's request for the release commit and the tag, nothing more. The
commit message is exactly `Release X.Y.Z`, with no `Co-Authored-By` or `Claude-Session` trailer, and
never `--no-verify` (the pre-commit hook runs the server tests). **Never push** to a git remote.
**Stop for the user's go-ahead** before `./build.sh --push` and before `deploy/deploy.sh`.
The release backup, the image check and the deployed check are part of the flow, not extras:
`scripts/verify-release.sh` runs them (`image` before the push, `deployed` after the deploy).

## Steps

1. **Start clean.** `git status` shows nothing. If it does, stop and ask the user to commit or
   stash; do not commit it yourself.
2. **Choose the version** from the changes since the last tag (`git log vX.Y.Z..`; no tag yet: the
   whole history). Patch: fixes, docs, and a change that only moves pins (the commit of
   `pachanguero-3pp-update`). Minor: new behaviour, or a schema change (a new `MigrationStep`).
   Major: existing data or a manual operator step breaks. Say which and why. If it equals the
   current version (first release, or the release commit already exists), skip only step 4's bump
   and commit; run its checks. If tag `vX.Y.Z` already exists, stop: that version is released.
3. **Verify the tree**: `npm test`, `npm run lint`, `npm run format:check`.
   Also `npm run test:e2e` when the changes moved the web framework (`react`, `vite`), the server
   framework (`express`) or the browser test tool (`@playwright/test`); any other release does not
   need it.
   If the release touches the bank feed, also run `npm run test:sandbox` when the standing session
   is configured (it skips otherwise), and ask the user to run the guided checklist in
   [`docs/test-strategy.md`](../../../docs/test-strategy.md#guided-checklist-for-a-release-that-touches-the-bank-feed);
   report it as not run until they confirm.
4. **Bump, check, commit.** `scripts/bump-version.sh X.Y.Z` (it fails unless the three places
   agree), then
   `helm lint deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example` and
   `./build.sh` (image only, nothing pushed). If anything in steps 3-4 fails, stop and report: the
   user commits any fix, and the skill restarts at step 1. Only when all pass, commit
   `package.json`, `package-lock.json` and `deploy/helm/pachanguero/Chart.yaml` as `Release X.Y.Z`.
5. **Check the built image.** `scripts/verify-release.sh image`: the image starts on a throwaway
   database, takes an account and answers a login. For a release that changes the schema, prefer a
   scrubbed copy of production (`scripts/prod-copy.sh`, then
   `scripts/verify-release.sh image --db data/prod-copy/pachanguero.db`) so the migration is tried
   on real data. If a check fails, nothing is pushed: report the failing check and stop.
6. **Ask, then publish.** `./build.sh --push`. If it fails partway, report it: re-running is allowed
   only while the version is untagged and undeployed.
7. **Tag** HEAD (on the first release, any commit) once the push succeeded: `git tag -a vX.Y.Z -m "Release X.Y.Z"`.
8. **Back up production.** In the running pod, before the deploy changes anything:
   `kubectl --context erebor -n pachanguero exec deploy/pachanguero -c backup -- pachanguero-admin backup --kind release --version X.Y.Z`
   (the version about to be deployed). It prints `✓ <path>`; check that
   `release_<UTC>_X.Y.Z.db` is in the staging folder:
   `kubectl --context erebor -n pachanguero exec deploy/pachanguero -c backup -- ls -l /backups`.
   If the backup fails, stop: do not deploy. The shipper takes the file to papiros at its next run.
   _One-time exception:_ the first release after backups were named for the shipper runs on a pod
   whose `backup` has no `--kind`. Take the backup with the old command and adopt it into the staging
   folder as the cutover procedure in [`docs/deployment.md`](../../../docs/deployment.md) says.
9. **Ask, then deploy.** `deploy/deploy.sh --tag X.Y.Z` (a version only: `latest` is refused).
10. **Verify production.** `scripts/verify-release.sh deployed --version X.Y.Z` (both containers
    ready, the pod runs X.Y.Z, `GET /` answers 200, no error in either log), plus, after a schema
    change, the new `release_<UTC>_X.Y.Z.db` the migration took, in the same `ls -l /backups`.
    The public `curl` check runs outside the house: ask the user for it and report it as unverified
    until they confirm. If any check fails, go to "When production fails".
11. **Report** the version, the commit, the tag and the results. The commit and the tag are local; the
    user pushes them.

## When production fails

Name the failed check, then **offer** the previous version back: rollback is in
`docs/deployment.md#releasing`. Nothing is redeployed without the user's yes (the first release has no
previous tag: ask). If the failed release migrated the schema, the copy taken in step 8 is the data
from just before it. A version whose image was pushed to the registry or deployed is never reused:
no re-push, no moved or deleted tag. Fix forward with the next patch version.

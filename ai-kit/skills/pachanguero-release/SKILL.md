---
name: pachanguero-release
description: Cut a pachanguero release - choose the version, verify, bump and commit, check the built image, push it, tag, back up production, deploy to erebor and verify production. Use for "release", "cut a version", "bump the version", "deploy", "what needs bumping".
---

CODENAME: SKILL-PACHANGUERO-RELEASE-628

# Pachanguero release

Registry, success checks and rollback are in [`docs/deployment.md`](../../../docs/deployment.md#releasing);
cluster commands are the `pachanguero-deployment-management` skill.

The version lives in `package.json`, `package-lock.json` and the chart's `version` and `appVersion`;
change it only with `scripts/bump-version.sh`.

- **Ask before** the release commit, the tag, `./build.sh --push` and `deploy/deploy.sh`, each
  separately.
- Only `./build.sh --push` and `deploy/deploy.sh` reach production; never `docker push` or `helm` by
  hand.
- No release while an erebor upgrade window (`t4m-server-upgrade`) is open: ask.
- The commit message is exactly `Release X.Y.Z`, with no `Co-Authored-By` or `Claude-Session`
  trailer, and never `--no-verify`. **Never push** to a git remote.

## Steps

1. **Start clean.** `git status` shows nothing. If it does, stop and ask the user to commit or
   stash; do not commit it yourself.
2. **Read the 3pp decisions.** Run **Read the decisions** of **Report** of
   `skill: pachanguero-3pp-update`. If a `workaround` is no longer applied, stop.
3. **Choose the version** from the changes since the last tag (`git log vX.Y.Z..`; no tag yet: the
   whole history). Patch: fixes, docs, and a change that only moves pins (the commit of
   `pachanguero-3pp-update`). Minor: new behaviour, or a schema change (a new `MigrationStep`).
   Major: an API route the web app or a user relies on, existing data (a migration that changes
   it) or a manual operator step breaks. Say which and why. If it equals the current version (first
   release, or the release commit already exists), skip **Bump** and **Commit**. If tag `vX.Y.Z`
   already exists, stop: that version is released.
4. **Verify the tree.** Run the **Tree checks** of `skill: pachanguero-3pp-update`.
5. If the release touches the bank feed, run `npm run test:sandbox` when the standing session is
   configured (it skips otherwise), and ask the user to run the guided checklist in
   [`docs/test-strategy.md`](../../../docs/test-strategy.md#guided-checklist-for-a-release-that-touches-the-bank-feed);
   report it as not run until they confirm.
6. **Bump.** `scripts/bump-version.sh X.Y.Z` (it fails unless the three places agree).
7. **Commit.** Show the changes and ask; on yes, commit `package.json`, `package-lock.json` and
   `deploy/helm/pachanguero/Chart.yaml` as `Release X.Y.Z`.
8. **Check the image.** Run the **Image checks** of `skill: pachanguero-3pp-update`. For a release
   that changes the schema, also run `scripts/prod-copy.sh`, then
   `scripts/verify-release.sh image --db data/prod-copy/pachanguero.db`.
9. If anything in **Verify the tree** to **Check the image** fails, stop and report: nothing is
   pushed; the user commits any fix, and the skill restarts at **Start clean**.
10. **Ask, then publish.** `./build.sh --push`. If it fails partway, report it: re-running is allowed
    only while the version is untagged and undeployed.
11. **Ask, then tag** HEAD (on the first release, any commit) once the push succeeded:
    `git tag -a vX.Y.Z -m "Release X.Y.Z"`.
12. **Back up production.** In the running pod, before the deploy changes anything:
    `kubectl --context erebor -n pachanguero exec deploy/pachanguero -c backup -- pachanguero-admin backup --kind release --version X.Y.Z`
    (the version about to be deployed). It prints `✓ <path>`; check that `release_<UTC>_X.Y.Z.db`
    is in the staging folder:
    `kubectl --context erebor -n pachanguero exec deploy/pachanguero -c backup -- ls -l /backups`.
    If the backup fails, stop: do not deploy.
13. **Ask, then deploy.** `deploy/deploy.sh --tag X.Y.Z` (a version only: `latest` is refused).
14. **Verify production.** `scripts/verify-release.sh deployed --version X.Y.Z`, plus, after a schema
    change, the new `release_<UTC>_X.Y.Z.db` the migration took, in the same `ls -l /backups`. Ask
    the user for the public `curl` check, run from outside the house; report it as unverified until
    they confirm. If any check fails, go to [When production fails](#when-production-fails).
15. **Report** the version with its level and why, the commit, the tag, the results, what stays
    unverified, and each entry of `.3pp-management.md` with its reason and `Lifts when` result. The
    commit and the tag are local; the user pushes them.

## When production fails

1. Name the failed check and show its output.
2. Offer the previous version back: rollback is in `docs/deployment.md#releasing`. If the release
   migrated the schema, the rollback first restores the **Back up production** copy. Nothing is
   redeployed without the user's yes (the first release has no previous tag: ask).
3. The version stays tagged and is never reused: no re-push, no moved or deleted tag. Fix forward
   with the next patch version.
4. When the cause is a 3pp bug, finish with **Record** of `skill: pachanguero-3pp-update`.

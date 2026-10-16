---
name: pachanguero-release
description: Cut a pachanguero release - choose the version, verify, bump and commit, build and push the image, tag, deploy to erebor and verify production. Use when the user says release, bump the version or deploy a new version.
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

## Steps

1. **Start clean.** `git status` shows nothing. If it does, stop and ask the user to commit or
   stash; do not commit it yourself.
2. **Choose the version** from the changes since the last tag (`git log vX.Y.Z..`; no tag yet: the
   whole history). Patch: fixes and docs. Minor: new behaviour, or a schema change (a new
   `MigrationStep`). Major: existing data or a manual operator step breaks. Say which and why. If it
   equals the current version (first release, or the release commit already exists), skip only
   step 4's bump and commit; run its checks. If tag `vX.Y.Z` already exists, stop: that version is
   released.
3. **Verify the tree**: `npm test`, `npm run lint`, `npm run format:check`.
4. **Bump, check, commit.** `scripts/bump-version.sh X.Y.Z` (it fails unless the three places
   agree), then
   `helm lint deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example` and
   `./build.sh` (image only, nothing pushed). If anything in steps 3-4 fails, stop and report: the
   user commits any fix, and the skill restarts at step 1. Only when all pass, commit
   `package.json`, `package-lock.json` and `deploy/helm/pachanguero/Chart.yaml` as `Release X.Y.Z`.
5. **Ask, then publish.** `./build.sh --push`. If it fails partway, report it: re-running is allowed
   only while the version is untagged and undeployed.
6. **Tag** HEAD (on the first release, any commit) once the push succeeded: `git tag -a vX.Y.Z -m "Release X.Y.Z"`.
7. **Ask, then deploy.** `deploy/deploy.sh --tag X.Y.Z`.
8. **Verify production** with the Success and Checks of `docs/deployment.md`, plus, after a schema
   change, a new `…-before-migration.db` in `kubectl --context erebor -n pachanguero exec deploy/pachanguero -c pachanguero -- ls /backups`.
   The public `curl` check runs outside the house: ask the user for it and report it as unverified
   until they confirm.
9. **Report** the version, the commit, the tag and the results. The commit and the tag are local; the
   user pushes them.

## When production fails

Rollback is in `docs/deployment.md#releasing`; ask before deploying the previous tag (the first
release has none: ask). A version whose image was pushed to the registry or deployed is never reused:
no re-push, no moved or deleted tag. Fix forward with the next patch version.

# Vision — WP-007-backups-and-currency

## 1. Problem Statement

Pachanguero's production backups sit on the same disk as its database, so losing erebor's disk loses both. Nothing keeps the OS image, Node, npm dependencies or the Helm chart's pins current, so a release says little about what software it ships.

## 2. Key Stakeholder or User Needs

The organiser, who is also the operator, needs the group's data to survive the loss of erebor, and needs the exposed service to run on current software. They want each release to be a meaningful version: rebuilt on current pins and backed up before it deploys.

## 3. Scope

In:
- Backups leave erebor through the `backup-shipper`: scheduled ones as `periodic`, the before-migration one as `release`, and the `/backups` PVC dropped.
- Whatever the shipper needs to take pachanguero in, including a commit in `trade4me-server` (the `apps:` entry and its redeploy).
- A `pachanguero-3pp-update` skill in the style of `t4m-3pp-update`, covering the OS base image, Node, npm and the chart's pins, with pins copied from trade4me: exact tags, no digests.
- Quality gates: a light verification run after an upgrade, made of the existing tests, the image build, a deploy to erebor and a few checks of the running service. Pachanguero is not critical and a bug in production is cheap, so the gates are much smaller than trade4me's and need no local k3d.
- Updating home-network-map (the pachanguero, backup-shipper and rsync pages and whatever else this work makes stale).

Out: CVE scanning, image signing, copying trade4me's release design (`pachanguero-release` stays the release procedure), and hardening of the pod and its network, which is WP-008-pod-hardening.

## 4. Quality Ranges

A production backup can be restored from papiros, drilled once end to end. After the 3pp skill runs, nothing is left that a newer LTS (or the latest, where no LTS exists) could replace, and its report says so. After an upgrade, the tests pass, the image builds, the deployed pod answers and the checks of the running service pass; anything beyond that is not required.

## 5. Constraints

Always update everything: LTS preferred, otherwise the latest; a major moves only where the skill says why. Backup names must match the shipper's pattern (`release|periodic`, UTC timestamp, version), written under a `.` name and renamed, and the application never deletes in staging. No lint or format rule is relaxed, and nothing is installed without the user's explicit permission. A version already pushed or deployed is never reused.

## 6. Assumptions and Dependencies

- The shipper accepts `periodic_<UTC>_<version>.db` and `release_<UTC>_<version>.db`, and runs as uid 1000, like the pachanguero pod: `verified` (its `push-backups.sh` and `values.yaml`).
- `/var/backups/erebor/pachanguero/` (owner uid 1000) exists before the new chart is deployed: `unverified`.
- Trade4me pins exact tags only, with no digests, and that is the model to copy: `verified` (agents' reading of both repos).
- The backup passphrase stays outside this repository, in the shipper's secrets and the password manager: `verified`.
- The hardening work (WP-008) does not block this one, and this one does not block it: `unverified`.

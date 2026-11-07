# 03 — A release backs up first, is checked and can roll back

## Type
Feature · Iteration 1 · Absorbs: F4, F5 · Depends on: 02 (the `--kind`/`--version` backup command and the staging folder)

## Mandatory Reading
- `specs/active/WP-007-backups-and-currency/DESIGN_PLAN.md`: section 2 (HLD) and the LLD of each absorbed element
- `specs/active/WP-007-backups-and-currency/REQUIREMENTS.md`: the use cases cited above
- `AGENTS.md`, `docs/test-strategy.md`
- The implementor also discovers, through the project's documentation-routing rule (`AGENTS.md`), the guidelines covering the specific files touched.
- `ai-kit/skills/pachanguero-release/SKILL.md`, `ai-kit/skills/pachanguero-deployment-management/SKILL.md`, `scripts/bump-version.sh`, `build.sh`, `deploy/deploy.sh`
- `study/gates-release-docs.md` (Q-10, Q-11), `study/decisions.md`
- `ai-kit/skills` authoring rules: skill `ai-skill-author`

## Description
UC-007-04. The design has an HLD only for F4 and F5 (no LLD). F4: a light script `scripts/verify-release.sh` with an `image` mode (the built image runs on a scrubbed copy of production, or a throwaway database, and answers a login request) and a `deployed` mode (pod runs the released version, answers a request, logs no errors; the public address is confirmed by the operator). F5: the release and deployment-management skills gain the order backup (`--kind release --version X` in the running pod) → checks → push → deploy → deployed checks, the patch rule for upgrade-only releases, the rollback offer on a failed check, and the one-time exception for the first release (the old pod has no `--kind`). They are one task because F5 runs F4's script and both realise UC-007-04.

## Guidelines
1. [x] Write a short LLD into the task's notes before coding. It must settle what the design left open: where the JWT secret for the throwaway container comes from (a generated throwaway value, never the real one), how the scrubbed copy is obtained (`scripts/prod-copy.sh` and the scrubber exist; a plain throwaway database is the fallback), the exit codes and the usage text (`set -e`, as `build.sh`).
2. [x] Create `scripts/verify-release.sh` with the two modes; failure names the failing check and exits non-zero.
3. [x] Add the row for it to `docs/test-strategy.md` (needs docker, `helm` and the cluster context; gate: every release; e2e only when a framework moved: UC-007-04-S2).
4. [x] Edit the release skill (steps in the order above, stops for the user before push and deploy stay) and the deployment-management skill. Follow `ai-skill-author`: short SKILL.md, detail in `references/`.
5. [x] Never print or log secrets; never reuse a pushed or deployed version.

## Tests
- Script (image mode): passes on a good tree; fails and names the check on a deliberately broken tree (for example a bad start command or missing JWT secret); no push or deploy happens in image mode.
- Script (deployed mode): run with a stub `kubectl` for a wrong version, a failing request, and an error log line; each fails with its name. Run against the real pod is task 06.
- Skill: read-through of each step against UC-007-04-S1…S5 (a table in the task notes mapping each scenario to the step that holds it).

## Manual Test Plan
1. With a good tree, run `scripts/verify-release.sh image`; it passes and starts no deployment.
2. Break the tree (revert after); the same command fails and names the check.
3. Task 06 runs the `deployed` mode on the real release and records the result.

## Notes (written during implementation)

**LLD settled.** `scripts/verify-release.sh image [--image NAME:TAG] [--db FILE]` runs the built image under the host uid on a temporary `/data` and `/backups`, with a JWT secret generated for the run, creates the throwaway account `verify-release` through `pachanguero-admin create` (password on stdin) and checks `POST /api/auth/login` answers 200 with an `accessToken` and a wrong password 401. `--db` starts it on a copy of a scrubbed production copy, so the migration runs on real data (the account is created in the copy only). `deployed --version X.Y.Z` checks both containers ready, image tags and `PACHANGUERO_VERSION` equal X.Y.Z, `GET /` is 200 (run with `node` inside the pod: the image has no curl), no `error|fatal|unhandled|exception|backup failed` in either log; it ends by saying the public address is not verified. Exit 0, or `FAIL <check>: <reason>` and exit 1. `KUBECTL` overrides the kubectl command. The deployed mode is tested by `server/src/verify-release-script.test.ts` (stub `kubectl`).

**Runs recorded (2026-11-07).** Good tree: `image` passed (also with `--db data/prod-copy/pachanguero.db`). Broken: `--image node:26-slim` failed with `FAIL image starts: no answer on / within 60 s`; `--image nope:1` failed with `FAIL image exists`. No push or deploy exists in image mode.

**Scenario to step.**

| Scenario | Where it is held |
|---|---|
| UC-007-04-S1 tests, lint, format, build, chart checks, image answers a login before push | release skill steps 3, 4, 5; `verify-release.sh image` |
| UC-007-04-S2 e2e only when a framework moved | release skill step 3; `docs/test-strategy.md` Limits |
| UC-007-04-S3 running service checked, public address by the operator | release skill step 10; `verify-release.sh deployed` last line |
| UC-007-04-S4 failed check: previous version offered, nothing redeployed without yes, failed version never reused | release skill "When production fails" |
| UC-007-04-S5 pins-only release is a patch | release skill step 2 |
| UC-007-01-S1 row 4 release backup before the deploy | release skill step 8 (and the one-time exception) |

## Definition of Done
- [x] `scripts/verify-release.sh image` passes on a good tree and fails on a broken one (both runs recorded in the task notes)
- [x] The stubbed `deployed` runs fail on each of the three faults
- [x] The scenario-to-step table for UC-007-04-S1…S5 and UC-007-01-S1 (row 4) shows each in a step of the skill
- [x] **Graduation**: UC-007-04 → `document`: the steps of the release skill and the checks of the script
- [x] **Documentation**: `docs/test-strategy.md` row (this task); the two skills (this task); `docs/deployment.md`, `AGENTS.md` and the rest in task 05
- [x] **Tests**: `npm test`
- [x] **Regression**: `npm test`
- [x] **Code checks**: `npm run lint`, `npm run format:check`; shell scripts pass `bash -n` (and `shellcheck` if already installed; do not install it)

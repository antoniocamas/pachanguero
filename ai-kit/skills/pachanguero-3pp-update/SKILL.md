---
name: pachanguero-3pp-update
description: Report and update every pinned third-party version of pachanguero - the Node base image tag, npm dependencies (exact pins included), @types/node - and gate the update on the checks. Use for "update dependencies", "update everything", "what is outdated", "bump jose", "move to a new Node".
---

CODENAME: SKILL-PACHANGUERO-3PP-UPDATE-627

# Pachanguero 3pp update

Run from the repo root. Pins, targets and held items: [pins.md](references/pins.md). Report layout:
[report.md](references/report.md). Never pushes, tags, bumps or deploys; hands over to
`pachanguero-release`. Invoking this skill is the user's request for the one commit of step 8.

Two modes. Use **Update** unless the user asks only what is outdated (**Report**).

## Report

1. `git status` must be clean. If not, stop and ask the user to commit or stash.
2. Collect every pin of [pins.md](references/pins.md) with the commands it gives. Change no file.
3. Show the report in the layout of [report.md](references/report.md).

## Update

1. Run **Report** steps 1-3.
2. Move every listed item to its target, majors included, without asking, except:
   - a major of a primary dependency (a `dependencies` entry, `vite`, or the Node runtime) that you
     judge could break the system very hard: say what you expect to break and ask first. If the user
     declines, hold it ([pins.md](references/pins.md#held)).
3. Run `npm install`, then the [Checks](#checks) once.
4. If a check fails, go to [On failure](#on-failure).
5. If `@playwright/test` moved, tell the user the browsers need `npx playwright install` and ask
   before running it (it installs software).
6. Run **Report** step 2-3 again. Only held items may remain; if others do, say why.
7. Show the changed files.
8. Commit all of them as one commit `Update third-party versions`, with no trailer and never
   `--no-verify`. Never push.
9. Offer `skill: pachanguero-release`; an update that only moves pins is a patch.

## Checks

1. `npm test`, `npm run lint`, `npm run format:check`, `npm run build`
2. `helm lint deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example`
3. `./build.sh`, then `scripts/verify-release.sh image`
4. `npm run test:e2e` only if `react`, `vite`, `express` or `@playwright/test` moved.

## On failure

Commit nothing and restore nothing yet.

1. Name the failing check and show its output.
2. Show the changed files and the item most likely at fault.
3. Ask the user: restore the previous pins, hold the offending item (write its reason), or fix forward.
4. To restore: `git restore` each changed file, then `npm ci`.

---
name: pachanguero-3pp-update
description: Report and update every pinned third-party version of pachanguero - the Node base image tag, npm dependencies, @types/node - and gate the update on the checks. Use for "update dependencies", "update everything", "what is outdated", "move to a new Node".
---

CODENAME: SKILL-PACHANGUERO-3PP-UPDATE-627

# Pachanguero 3pp update

Run from the `pachanguero` repo root. Never push, tag, bump the app version or deploy. Two modes; use **Update**
unless the user asks only what is outdated.

Policy: move each item to the newest LTS release; with no LTS, the newest. Majors included. A
deviation needs a recorded decision in `.3pp-management.md`.

## Update

1. Run **Report** steps 1-15.
2. Delete each lifted entry from `.3pp-management.md`.
3. An item whose target is a choice (a major of a primary dependency that could break the system, a
   peer range that blocks it, LTS against current; never a dev tool or `@types/node`): follow
   [decisions.md](references/decisions.md) and wait for the user's choice.
4. Move each other item to its target.
5. Edit an exact pin's version in `package.json` and keep it exact.
6. Never run `npm install <pkg>@x` without `--save-exact`.
7. Run `npm install`.
8. Run the [Checks](#checks) once.
9. If a check fails, go to [On failure](#on-failure).
10. If `@playwright/test` moved, ask before running `npx playwright install`.
11. Run **Report** steps 2-15 again. Only items with a standing decision may remain.
12. Explain any other item that remains.
13. Show the changed files.
14. Ask to commit.
15. On yes, commit them as one commit `Update third-party versions`.
16. Add no trailer and never pass `--no-verify`.
17. Offer `skill: pachanguero-release`.

## Report

1. `git status` must be clean. If not, stop and ask the user to commit or stash.
2. Run the `Lifts when` command of each entry in `.3pp-management.md`. List each entry
   whose result ends the decision. Edit nothing.
3. Find every pin the repo carries: base image tags in the `Dockerfile`, runtime version files such
   as `.nvmrc`, and package manifests.
4. For each runtime and base image, read its vendor's published release and end-of-life data.
5. Target the newest patch of the newest LTS line, on an operating-system release not past end of
   life.
6. Write the target as an exact tag (no digest, no `latest`).
7. A version file that holds the major only gets the major. It moves with its image tag.
8. Confirm the tag with `docker manifest inspect`. If it does not exist, skip it and say so.
9. Run `npm outdated` at the root and in each workspace.
10. Target `latest`; rewrite the range when `latest` is outside it.
11. Keep the file's pinning style.
12. `@types/node`: run `npm view @types/node versions`. Target the newest of the Node major the
    image runs.
13. `typescript`: run `npm ls typescript`. Target one version everywhere; say so when the lock holds
    two.
14. `@playwright/test`: run `npm ls @playwright/test`. The browsers follow it.
15. Show one table, one row per outdated item, sorted by home:

    | Item | Home | Now | Moves to | Major? | Note |
    | ---- | ---- | --- | -------- | ------ | ---- |
    - `Major?`: `yes` when the first non-zero number changes (`0.0.3` to `0.0.4` is `yes`).
    - `Note`: `exact pin`, `LTS`, `asks first`, `needs playwright install`, `no LTS: newest`.
    - Below it, each standing decision with its reason and its `Lifts when` result.
    - Then one line per finding that is not an update: a line past end of life or within 90 days of it.
    - Nothing outdated and no decision: `Everything is current.`

## Checks

Before `helm lint`, call `skill: pachanguero-deployment-management`.

1. `npm test`, `npm run lint`, `npm run format:check`, `npm run build`
2. `helm lint deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example`
3. `./build.sh`
4. `scripts/verify-release.sh image`
5. `npm run test:e2e` only if `react`, `vite`, `express` or `@playwright/test` moved.

## On failure

1. Show the failing check's output.
2. Show the changed files and the item most likely at fault.
3. Follow [decisions.md](references/decisions.md) with the alternatives: restore the previous pins,
   hold the item, fix forward.
4. Only on the user's yes to restore: `git restore` each changed file, then `npm ci`.

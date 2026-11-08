---
name: pachanguero-3pp-update
description: Report and update every pinned third-party version of pachanguero - the Node base image, npm dependencies, @types/node - gate the update on the checks, and record in .3pp-management.md why an item stays behind. Use for "update dependencies", "update everything", "what is outdated", "bump <package>", "move to a new Node".
---

CODENAME: SKILL-PACHANGUERO-3PP-UPDATE-627

# Pachanguero 3pp update

Run from the `pachanguero` repo root. Never push, tag, release, bump the app version or deploy. Only
**Record** writes `.3pp-management.md`.

Modes: **Update** (default), **Report** (the user asks only what is outdated), **One item** (the
user names one), **Requires-plan item** (an item that needs a manual operator step), **Record**
(write, change or delete an entry; called by the other modes, by `pachanguero-release`,
`pachanguero-upgrade-plan` or the user).

## Update

1. Run **Report**.
2. Lift each lifted entry with **Record**.
3. Sort each item behind its target:
   - Moves: patches, minors; majors of dev tools, `@types/node` and `@playwright/test`.
   - A choice: a major of `react`, `express`, `vite`, `better-sqlite3` (native, tied to the Node
     ABI), the Node line or the Debian suite; a peer range that blocks the target; LTS against
     current. Say what you expect to break, then run **Record**.
   - Requires plan: a move that needs a manual operator step (production data by hand, a change on
     erebor). Offer **Requires-plan item**; the item gets its entry through **Record**.
4. **Move the pins.** Keep each file's pinning style: the exact pins (`jose`, `@dnd-kit/core`) stay
   exact (`--save-exact`); rewrite a range only when the target is outside it.
5. **Move the Node image.** Move the image tag and `.nvmrc` together. Confirm the tag with
   `docker manifest inspect node:<tag>`; if it does not exist, skip it and say so.
6. **Install.** Run `npm install`.
7. Run the [Checks](#checks) once. A failure goes to [On failure](#on-failure).
8. If `@playwright/test` moved, ask before running `npx playwright install`.
9. Run **Report** again. Only items with an entry may remain behind; explain any other.
10. Show the files this run changed. Ask to commit; stage only those files, never `git add -A`.
11. On yes, one commit `Update third-party versions`, with the `.3pp-management.md` changes in it.
    No trailer, never `--no-verify`.
12. Offer `skill: pachanguero-release`.

## Report

1. `git status` must be clean. If not, stop and ask the user to commit or stash.
2. **Read the decisions.** For each entry of `.3pp-management.md`, run its `Lifts when` command; for
   a `manual:` one, show it with its link and ask the user. For a `workaround`, run its `Applied`
   command. Edit nothing.
3. Collect each item:

   | Item                     | Home                                                         | Read with                                                           | Target                                                                                                           |
   | ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
   | Node base image          | `ARG NODE_IMAGE` in `Dockerfile`                             | `curl -s https://endoflife.date/api/nodejs.json`, `.../debian.json` | newest patch of the newest LTS line on the current Debian stable: `<x.y.z>-<suite>-slim`, no digest, no `latest` |
   | Local Node               | `.nvmrc`                                                     | same                                                                | the image's major                                                                                                |
   | npm packages             | `package.json` of the root, `server`, `web`, `e2e`; one lock | `npm outdated --json --workspaces --include-workspace-root`         | `latest`                                                                                                         |
   | `@types/node`            | `server`, `e2e`                                              | `npm view @types/node versions`                                     | newest of the image's Node major                                                                                 |
   | `typescript`             | `server`, `web`, the root lock (hoisted)                     | `npm ls typescript`                                                 | `latest` in every copy; say so when the lock holds two                                                           |
   | Playwright browsers      | cache of `@playwright/test`                                  | `npm ls @playwright/test`                                           | follow `@playwright/test`                                                                                        |
   | OS packages of the image | `apt-get upgrade` layer of the `Dockerfile`                  | none: `./build.sh` refreshes them each UTC day                      | `refreshed at build`                                                                                             |

4. Give each a status: `current`; `behind`; `eol-soon` (its line ends within 90 days); `eol` (past
   end of life, moved first); `refreshed at build`; `unknown (<reason>)`, never counted as
   `current`.
5. Show one table, one row per item not `current`: `Item | Home | Now | Moves to | Major? | Note`.
   `Major?` is `yes` when the first non-zero number changes. `Note`: `exact pin`, `LTS`, `a choice`,
   `needs playwright install`, `no LTS: newest`.
6. Below it: each entry with its reason and its `Lifts when` result; each workaround no longer
   applied; each `eol` or `eol-soon` line.
7. Nothing outdated and no entry: `Everything is current.`

## One item

Move that item (**Move the pins**, or **Move the Node image**), then continue at **Install** of
**Update**. A major the user names is their choice: run **Record** only if a peer range blocks it.

## Requires-plan item

Run `skill: pachanguero-upgrade-plan`, then stop.

## Record

1. Read [3pp-management.md](references/3pp-management.md).
2. New or changed entry: follow its decision procedure. Write the entry exactly in its layout.
3. Lifted entry: delete it.
4. Commit nothing: the caller commits the file with the change it explains.

## Checks

Run both groups. A check that cannot run is reported as not run, never as passed. A staging deploy
is not applicable: pachanguero has no staging copy.

### Tree checks

1. `npm test`, `npm run lint`, `npm run format:check`, `npm run build`
2. `npm run test:e2e` only if `react`, `vite`, `express` or `@playwright/test` moved.

### Image checks

Before `helm lint`, call `skill: pachanguero-deployment-management`.

1. `helm lint deploy/helm/pachanguero -f deploy/helm/pachanguero/values.secrets.yaml.example`
2. `./build.sh`
3. `scripts/verify-release.sh image`

## On failure

1. Show the failing check's output. Commit nothing, restore nothing yet.
2. Show the changed files and the item most likely at fault.
3. Offer: restore the previous pins; fix forward; hold the item or a workaround (only for a 3pp bug,
   with its `Evidence`), both through **Record**.
4. Only on the user's yes to restore: `git restore` each changed file, then `npm ci`.

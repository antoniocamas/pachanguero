# Pins

Policy: move each item to the newest LTS release; where it has no LTS, the newest release. Majors
included. A held item stays only with a reason written under [Held](#held).

## Where each pin lives

| Item                                | Home                                                                          | Report with                                                                                                                                                   | Target                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node base image tag                 | `ARG NODE_IMAGE` in `Dockerfile` (the one place; both stages use it)          | `curl -s https://endoflife.date/api/nodejs.json` and `https://endoflife.date/api/debian.json`; `docker manifest inspect node:<tag>` to confirm the tag exists | newest patch of the newest LTS line, exact tag (`<x.y.z>-<debian suite>-slim`, no digest, no `latest`); the Debian suite is the current stable   |
| Local Node                          | `.nvmrc`                                                                      | same                                                                                                                                                          | the major of the image                                                                                                                           |
| npm dependencies, ranges            | `package.json` of the root, `server`, `web`, `e2e`; one `package-lock.json`   | `npm outdated --json --workspaces --include-workspace-root`                                                                                                   | `latest`; rewrite the range when `latest` is outside it                                                                                          |
| Exact pins: `jose`, `@dnd-kit/core` | `server/package.json`, `web/package.json`                                     | `npm outdated --json` (`wanted` equals current)                                                                                                               | `latest`, still exact: edit the version, never `npm update`                                                                                      |
| `@types/node`                       | `server/package.json`, `e2e/package.json`                                     | `npm view @types/node versions`                                                                                                                               | newest release of the major of the Node line the image runs                                                                                      |
| `typescript`                        | `server`, `web` (nested) and the root lock (hoisted, for `typescript-eslint`) | `npm ls typescript`                                                                                                                                           | one version everywhere: when the lock holds two, say so in the report and align them if `typescript-eslint` allows it, else hold with the reason |
| Playwright browsers                 | cache of `@playwright/test`                                                   | `npm ls @playwright/test`                                                                                                                                     | follows `@playwright/test`; installing needs the user's yes                                                                                      |

Move the image tag and `.nvmrc` together. A new image tag must exist on Docker Hub, else skip it
and say so. The backup sidecar uses the app image, so it follows the tag.

Ask before moving (step 2 of Update) when: the Node major, `better-sqlite3` (native module, tied to
the Node ABI), or a framework major (`react`, `express`, `vite`) could break the system very hard.
A major of a dev tool or of `@types/node` does not need asking.

## Held

Written by the skill when the user holds an item; read by every run. A held item is listed in the
report with its reason, and moved no further until the user lifts it (delete the row).

| Item | Held at | Would move to | Reason | Since |
| ---- | ------- | ------------- | ------ | ----- |

# Currency study (Q-07, Q-08, Q-09)

Searched: pachanguero root (`Dockerfile`, `.nvmrc`, `package.json` x4, `package-lock.json`, `build.sh`, `deploy/deploy.sh`, `deploy/helm/pachanguero/*`, `scripts/*`, `docs/deployment.md`, `ai-kit/skills/*`, `e2e/playwright.config.ts`, no `.github`); `home-network-map` (`hardware.md`, `services/k3s`, `services/docker-registry`, `services/pachanguero`); trade4me `t4m-3pp-update` skill, `docs/deployment/third-party-currency.md`; trading-monolith `third_party_runner.py`, the `third_party/` package, `build-pins.env`, `build-images.sh`, `docs/build-system.md`, Dockerfiles. Live queries run 2026-11-07 (`npm outdated`, `npm view`, endoflife.date API, Docker Hub API).

## Q-07

Where each versioned/pinned thing lives and how it changes today (all changes are by hand; no tool, no CI).

| Thing | Where | Value now | How changed today |
|---|---|---|---|
| Build stage base | `Dockerfile`, first `FROM node:26-slim AS build` | `node:26-slim` (floating major tag, no digest) | edit by hand |
| Runtime stage base | `Dockerfile`, second `FROM node:26-slim` | same | edit by hand; `docs/deployment.md` "Deployment impact of a change" row "Node version or a native dependency" says both `FROM` lines change together, and the backup sidecar (same image) needs GNU `date -d` |
| Local Node | `.nvmrc` | `26` (added in commit "Fix software versions"); used by `scripts/setup-devel-environment.sh` and `scripts/setup-claude.sh` via `nvm use` | edit by hand |
| `engines` | none in root, server, web, e2e `package.json` (searched). Only dependencies carry engines (better-sqlite3 13.0.3 `>=22`, vitest 5.0.3 `^22.12 \|\| ^24 \|\| >=26`, vite 8.3.3 `^20.19 \|\| >=22.12`, eslint 10.10.0 `^20.19 \|\| ^22.13 \|\| >=24`) | n/a | n/a |
| Root devDependencies | root `package.json` | caret ranges: @eslint/js ^10.0.1, eslint ^10.10.0, eslint-plugin-react-hooks ^7.1.1, eslint-plugin-react-refresh ^0.5.6, globals ^17.12.0, husky ^9.1.7, lint-staged ^17.5.1, prettier ^3.9.6, typescript-eslint ^8.70.0 | edit range / `npm update` by hand |
| server deps | `server/package.json` | better-sqlite3 ^13.0.3, express ^5.2.1, **jose 6.2.12 (exact)**; dev: @types/better-sqlite3 ^9.6.0, @types/express ^5.0.6, @types/node ^22.20.2, tsx ^4.23.13, typescript ^7.0.2, vitest ^5.0.0 | by hand |
| web deps | `web/package.json` | **@dnd-kit/core 6.3.1 (exact)**, react/react-dom ^19.3.0; dev: @types/react(-dom) ^19.3.0, @vitejs/plugin-react ^6.1.1, typescript ^7.0.2, vite ^8.3.0, vitest ^5.0.3 | by hand |
| e2e deps | `e2e/package.json` | @playwright/test ^1.56.1 (installed 1.63.0), @types/node ^22.20.2 | by hand |
| Lockfile | root `package-lock.json`, lockfileVersion 3, one lock for all three workspaces; `Dockerfile` uses `npm ci --ignore-scripts` | root hoists typescript 6.0.3 (for typescript-eslint); server and web each nest typescript 7.0.2 | rewritten by `npm install`/`npm update`; commit "Fix software versions" regenerated it |
| Playwright browsers | not pinned anywhere except via the @playwright/test version; local cache `~/.cache/ms-playwright` holds chromium-1243, chromium_headless_shell-1243, ffmpeg-1011. No doc or script runs `playwright install` (searched docs, e2e, README, ai-kit). `retries: process.env.CI` in `e2e/playwright.config.ts` is the only CI hint; no CI exists | n/a | `npx playwright install` is manual and unrecorded (inference: needed after a Playwright bump; this needs a user decision because installing software is gated) |
| Image tag handling | `build.sh`: tags `pachanguero:<version>` and `:latest` plus both under `192.168.1.87:30500`, version read from `package.json`. Chart `values.yaml`: `registry: registry.local:5000`, `image.tag: ''` meaning `.Chart.AppVersion` (`templates/deployment.yaml` builds `$image` with `default .Chart.AppVersion .Values.image.tag`); both containers use `imagePullPolicy: Always`. `deploy/deploy.sh --tag` sets `image.tag`, `--restart` rolls the pod | n/a | release skill |
| App version | `package.json` `version` 0.3.0 (root only; workspaces have none), root of `package-lock.json`, `Chart.yaml` `version: 0.3.0` and `appVersion: '0.3.0'` | 0.3.0 | only `scripts/bump-version.sh X.Y.Z` (runs `npm version --no-git-tag-version`, seds Chart.yaml, then `--check`; refuses an existing tag `vX.Y.Z`). The release skill `ai-kit/skills/pachanguero-release/SKILL.md` says change it only with this script |
| Tool versions assumed | helm, kubectl, docker are only checked for presence (`deploy/deploy.sh` `command -v helm`); no minimum version is stated anywhere (searched `docs`, `ai-kit`, `scripts`). Local: helm v3.17.3, kubectl client v1.35.10, docker 29.9.3, node v26.8.2, npm 11.19.1 | unpinned | n/a |
| Chart/CLI | `Chart.yaml` `apiVersion: v2`, no dependencies | | |
| GitHub/CI | no `.github/` directory; pre-commit hook (`.husky/pre-commit`: lint-staged + server tests) is the only automated gate | | |
| erebor facts (home-network-map) | `hardware.md`: erebor = Chuwi Ubox, Ryzen 5 6600H, 12 Gi usable, **Ubuntu Server 24.04.4 LTS** (not Debian), user `smaug`. `services/k3s/info.md`: k3s plus Helm, installed natively by the trade4me deployment repo's `install-server` module `07-k3s.sh`; **no k3s version recorded** (ports TODO, runtime details TODO); config `/etc/rancher/k3s/`. `services/docker-registry/info.md`: registry:2 on a 20Gi PVC, NodePort 30500, mirror `registry.local:5000` to `http://<erebor IP>:30500` in `/etc/rancher/k3s/registries.yaml`, `insecure_skip_verify`, `deleteEnabled: true`. `services/pachanguero/info.md`: deployed 2026-10-16 | | the map is edited by hand; its facts are dated "Last reviewed" |

Notes:
- The only Debian in the picture is inside the `node:26-slim` image (see Q-09: trixie). No apt upgrade layer or `OS_REFRESH` exists in the pachanguero `Dockerfile` (searched; `grep` for `apt`, `OS_REFRESH` finds nothing), so OS patches arrive only when the base tag is re-pulled; `build.sh` does not pass `--pull` (inference: a cached local `node:26-slim` can go stale on a dev machine).
- `AGENTS.md` and `docs/deployment.md` do not mention Node 26 specifically; `.nvmrc` and the Dockerfile agree today.
- Version pins are mixed: caret ranges plus two exact pins (`jose`, `@dnd-kit/core`); trade4me pins exact tags, so "pins are exact tags like trade4me" applies to images, and for npm the policy question is open (inference: keep ranges, lock is the pin, as trade4me does with `npm update`).

Signal: surprising (erebor is Ubuntu, not Debian; the k3s version is not recorded anywhere; `.nvmrc` and floating `node:26-slim` are the only Node pins; no playwright-browser procedure).

## Q-08

Source: `t4m-3pp-update/SKILL.md`, `third-party-currency.md`, `third_party_runner.py` and the `third_party/` package (`inventory.py`, `currency_report.py`, `third_party_updater.py`, `end_of_life_source.py`, `docker_hub_tags_source.py`, `pypi_source.py`, `npm_outdated.py`, `uv_lock_updates.py`, `os_package_lag.py`, `debian_suites.py`, `docker_images.py`, `pin_changes.py`, `image_tag.py`, `version_key.py`), `build-pins.env`, `build-images.sh`, `docs/build-system.md` "Base images, one OS, and the OS upgrade layer".

### What it is
A skill (`t4m-3pp-update`) driving the console script `t4m-3pp` (`third_party_runner.py`, argparse dispatch only; logic in `trade4me_test.third_party`, about 800 lines of small classes). Commands: `report [--images]`, `update all|python|npm|image <item> <tag>|os <suite>`, `remove-images <ref>...`. Run from `trading-monolith` root. The skill never releases.

### Skill steps (mode "All")
1. `uv run t4m-3pp report`, show it.
2. `uv run t4m-3pp update all`.
3. On `REFUSED`: show the reason; if `git status` shows changed files go to On failure, else stop.
4. Show the `skipped` lines.
5. If `backup-shipper/values.yaml` changed, raise its `image.tag` (the shipper only takes a refreshed base with a new tag).
6. Run Checks once: `uv run t4m-test`; `./build-images.sh --all`; `uv run t4m-check-images os` for the five service images; deploy to local k3d (`t4m-local-cluster`). Only one npm package changed: checks 1 and 2 only.
7. A failed check goes to On failure.
8. `t4m-3pp remove-images <each unused image>` (the updater prints `unused image:` lines for pins it replaced; it removes nothing itself).
9. Show changed files; ask whether to commit; stop unless yes; commit in each changed repo.
10. Invoke `skill: t4m-release`.
Mode "One item": the matching `update python|npm|image|os` command, then continue from step 3.

### Report tool
- Sources: endoflife.date (`EndOfLifeSource`: python, nodejs, nginx, redis, prometheus, grafana, postgresql, debian; matches the pinned cycle by first 1 or 2 version numbers, gives newest in cycle, newest overall, EOL date), PyPI (`PypiSource`, uv), Docker Hub tags API (`DockerHubTagsSource`, timescale/timescaledb-ha release tags `pgN.M-tsX.Y.Z`, family = PG major), `npm outdated --json` (`NpmOutdated`: `wanted` = newest in range, `latest` = newest; exit codes 0 or 1 accepted), `uv lock --dry-run --upgrade` (`UvLockUpdates`, parses Update/Add lines), `UnknownSource` for ib-gateway (always `unknown`), `docker manifest inspect` (`DockerImages.exists`) to confirm an image tag exists.
- Statuses (`CurrencyReport`): `current`, `behind` (pinned numbers below newest-in-family), `eol-soon` (EOL within 90 days), `eol`, `unknown` (source failed; reason shown). EOL outranks behind. A provider that cannot list gives one `unknown` row.
- `--images`: `OsPackageLag` runs `docker run --rm --user root --entrypoint sh <image> -c "apt-get update -qq; apt-get -s upgrade | grep -c '^Inst'"` for each built service image and prints "N OS packages pending upgrade".

### Update rules
- Majors skipped by default: Python packages move only when `VersionKey.release_line()` (major, or major.minor below 1.0) is unchanged; npm uses `npm update` (within ranges); image pins move to `newest_in_family` (same cycle), not `newest`. Majors move on purpose, one at a time (`update image <item> <tag>`, `update npm <pkg>` which installs `@latest`).
- LTS preference: prefer LTS to the newest; newest only when the operator chooses it or the LTS is poorly maintained (`third-party-currency.md` Rules). In code, "family" = the pinned cycle, so LTS is implicit in the chosen pin (inference: the tool does not itself know what LTS is; the operator picks the cycle).
- EOL rule: nothing past end of life stays in production; `eol`/`eol-soon` flagged.
- One Debian release: Python, node, nginx bases and shipper base move together with `update os <suite>` (`DebianSuites` maps suite to point release such as 13.7; `_with_suite` rewrites the suite word in the tag; each new reference must exist in the registry).
- Refuses to run on files with uncommitted changes (`_refuse_dirty`); an image whose newer tag does not exist is skipped and printed as `skipped <item>: no image <ref>`; a bare-tag pin (ib-gateway) is moved by its own builder, not by this tool.

### OS patches
Dockerfiles declare `ARG OS_REFRESH` then `RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*` (Python images and front's nginx runtime stage). `build-images.sh` sets `OS_REFRESH=$(date -u +%F)` and passes `--build-arg OS_REFRESH`, so the layer re-runs on a new UTC day and is cached within a day. Builds use `docker build --pull`. The backup shipper's Dockerfile gets the same arg from `k8s/management/build-shipper-image.sh`, but its chart only takes it with a new `image.tag`. Consequence (documented): same commit built on different days differs in OS packages. `release.sh` runs an `os` check on the release images before deploy (`t4m-check-images os`).

### Where versions live ("pin homes")
`PinHome(name, path, section, key, sources)` in `inventory.py`; one home per item, "change a version in its home only": `uv.lock`; `trade4me-front/package-lock.json`; `build-pins.env` (PYTHON_BASE, UV_IMAGE, NODE_BASE, NGINX_BASE; full reference with exact tag, no `latest`, no digest; `build-images.sh` fails on a missing key and passes them as build args declared before the first `FROM` with no default); chart values for redis, timescaledb, prometheus, grafana (`trade4me-infrastructure/values.yaml`), ib-gateway (`image.tag`), backup shipper (`image.base`). `PinFile` locates and rewrites the pin text in place.

### Failure handling
"On failure": change nothing yet; show failing check and output, show changed files and likely culprit; ask the user restore-all or fix. Restore: `git -C <dir> restore <file>` per changed file, then `uv sync` and `npm ci` in the front. The tool itself exits 1 with `REFUSED:` on `AssertionError`, `LookupError`, `SourceUnavailable`.

### Handover and approvals
Handover: after commit, `skill: t4m-release` (decides bumps, judges interface impact, hands to `release.sh`); this skill never bumps, tags, pushes or deploys to erebor. User approves: restore vs fix on failure; whether to commit (default stop); majors and any non-LTS choice (by naming the item); the release itself in the release skill.

### Capability classification for pachanguero
| Capability | Class | Why |
|---|---|---|
| Procedure "report, update all, show skipped, checks, ask commit, hand to release" | needed | the skill's backbone |
| Pin homes table (single home per item) | needed | pachanguero has Dockerfile (2 FROM lines), `.nvmrc`, 4 package.json plus lock, Playwright; adapt homes |
| Report from endoflife.date for nodejs and debian | adaptable | only Node line and Debian suite matter; a few `curl` calls can replace the Python tool (inference) |
| Report via `npm outdated` (per workspace, from root) | needed | works as is; only package source |
| PyPI, `uv lock --dry-run`, uv image, Python pins | not needed | no Python |
| Docker Hub tags source (timescaledb), redis/prometheus/grafana/ib-gateway pins | not needed | single image |
| nginx, redis, etc. | not needed | none |
| `update all` within family, majors skipped | adaptable | `npm update` respects ranges (caret = no majors) but would not move `jose`/`@dnd-kit` exact pins and the Node line; majors must be listed from `npm outdated` `latest` vs `wanted` |
| LTS preference rule | needed | Node (even lines) is the main case; plus TypeScript/others have no LTS, so "latest" |
| EOL rule and 90-day `eol-soon` | adaptable | apply to the Node line and Debian suite only |
| `update os <suite>` moving all bases together | adaptable | one image, two FROM lines; the suite can ride in the tag (`26-trixie-slim`), which also makes the Debian suite visible; moving the Node line and suite together is a manual edit of two lines |
| Exact image tags, no digest, no `latest` | adaptable | policy says exact tags like trade4me: `node:26.13.0-trixie-slim` instead of `node:26-slim`; both `FROM` lines identical |
| Refuse on dirty files | needed (cheap) | a `git status` check in the skill text |
| `docker manifest inspect` existence check | adaptable | confirm the new tag exists before editing |
| `OS_REFRESH` + `apt-get upgrade` layer; `build.sh` `--pull`; dated arg in `build.sh` | adaptable | the question is open: node slim images are rebuilt by upstream on each Debian update, so with an exact `x.y.z-trixie-slim` tag the OS can still lag; an apt layer plus `OS_REFRESH` mirrors trade4me, tradeoff is more Dockerfile; decision for the user (inference) |
| `report --images` OS package lag via `apt-get -s upgrade` | adaptable | the same one-liner works on the built image; optional |
| Checks (`t4m-test`, build images, `check-images os`, local k3d deploy) | adaptable | pachanguero equivalent: `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`, `./build.sh` (docker build); k3d deploy: not needed (no local cluster) |
| `remove-images` of replaced local images | adaptable / optional | a local `docker image rm` of old node tag; low value |
| Shipper `image.tag` raise rule | not needed | no shipper in the chart (the backup sidecar uses the app image, so a new image tag covers it) |
| On failure (ask restore vs fix, `git restore` + `npm ci`) | needed | adapt: restore `package.json`, `package-lock.json`, `Dockerfile`, `.nvmrc`, then `npm ci` |
| Handover to `pachanguero-release` and no release inside the skill | needed | the release skill already requires the version bump via `scripts/bump-version.sh` and the deploy via `deploy.sh` |
| A Python CLI tool (`t4m-3pp`, 30 small classes) | not needed | skill text plus a few shell/`npm`/`curl` commands suffices for a small app (inference; also no Python/uv here) |
| Playwright browser refresh | needed (new, not in trade4me) | a Playwright bump needs `npx playwright install` locally, which is an install and needs user approval |
| Helm/kubectl/docker client versions | not needed (note only) | report nothing; not pinned |
| erebor OS/k3s currency | not needed here | outside the repo and the trade4me installer owns it (inference) |

Signal: expected (the tool is a thin report/update CLI over pin files; the policy maps cleanly, only the Python/multi-image parts drop out).

## Q-09

Read-only queries only (`npm outdated`, `npm view`, endoflife.date, Docker Hub API); nothing installed or changed. Today 2026-11-07.

### Node schedule (endoflife.date `nodejs.json`)
- Node 26: released 2026-05-05, **became LTS 2026-10-28** (so `node:26-slim` is LTS now, no longer Current), EOL 2029-04-30, latest 26.13.0.
- Node 24: LTS since 2025-10-28, EOL 2028-04-30, latest 24.22.2 (support ended 2026-10-20, now maintenance).
- Node 22: LTS, EOL 2027-04-30, latest 22.23.4. Node 25 EOL 2026-06-01. Node 20 EOL 2026-04-30.
- Local node is v26.8.2 and `.nvmrc` is 26.

### Docker tag forms (Docker Hub API, library/node)
`26-slim`, `26.13-slim`, `26.13.0-slim` and the same with `-trixie-slim` or `-bookworm-slim` all exist. `26-slim` and `26-trixie-slim` have the identical digest (sha256:5adad64f...), so `node:26-slim` is Debian 13 trixie today; `-bookworm-slim` is a different digest. Debian 13 trixie: point release 13.7 (2026-09-12), EOL 2030-06-30 (endoflife.date `debian.json`); Debian 12 bookworm 12.15, EOL 2028-06-30. Exact-tag target for the Dockerfile (inference of the policy): `node:26.13.0-trixie-slim` in both `FROM` lines. Floating `26-slim` tag last updated 2026-11-05.

### `npm outdated` (root, workspaces; installed vs wanted vs latest)
All outdated items are within their caret ranges ("wanted" = "latest") except where noted; `npm update` would move them without touching a package.json range.

| Item | Current | Target (wanted / latest) | Major? | Risk |
|---|---|---|---|---|
| node (Dockerfile x2, `.nvmrc`) | `26-slim` / 26 (26.8.2 local) | 26.13.0-trixie-slim (LTS line, stay on 26) | no | low; 26 is now LTS. Moving to 24 would be a downgrade; not recommended. better-sqlite3 13.0.3 declares `node >=22` and its npm view shows no Node-26-specific constraint (inference: it ships prebuilt binaries per Node ABI, the Dockerfile comment relies on that; unverified for 26.13 until a Docker build runs, as the Dockerfile uses `--ignore-scripts`; the existing 0.3.0 image already runs on 26) |
| debian suite | trixie (implicit) | trixie 13.7 | no | none; trixie is the current stable |
| @playwright/test (e2e) | 1.63.0 | 1.65.0 | no (minor) | moderate: new Playwright needs matching browsers (`npx playwright install`, an install needing approval); cached browsers are build 1243 |
| @types/node (server, e2e) | 22.20.2 | wanted 22.20.5; latest 26.6.6 | latest is major (22 to 26) | policy gap: types for Node 22 while the runtime is 26; moving to 26.x matches the runtime and `.nvmrc` (inference: recommended, but may surface type errors; run `tsc` via `npm run build`); caret range `^22.20.2` blocks it, needs a `package.json` edit |
| @vitejs/plugin-react (web) | 6.1.1 | 6.2.1 | no | low |
| eslint (root) | 10.10.0 | 10.14.0 | no | low; new rules could add lint findings, and the project forbids relaxing rules without asking |
| eslint-plugin-react-refresh | 0.5.6 | 0.5.7 | no (0.x patch) | low |
| express (server) | 5.2.1 | 5.3.0 | no | low (5.x minor); route and middleware tests cover it; `latest-4` tag exists but we are on 5 |
| globals | 17.12.0 | 17.14.0 | no | low |
| jose (server) | 6.2.12 exact pin | 6.2.15 | no (patch) | low, but exact pin: `npm update` will not move it; needs an explicit edit; security-sensitive (JWT), `TokenService` tests |
| lint-staged | 17.5.1 | 17.6.0 | no | low |
| prettier | 3.9.6 | 3.9.10 | no | low; may reformat files (`format:check` should pass everywhere) |
| react, react-dom (web) | 19.3.0 | 19.3.1 | no | low |
| tsx (server) | 4.23.13 | 4.23.15 | no | low |
| typescript-eslint (root) | 8.70.0 | 8.72.1 | no | low; it uses the hoisted typescript 6.0.3 while workspaces use 7.0.2 (inference: peer range lag; unchanged by this update) |
| vite (web) | 8.3.3 | 8.3.6 | no | low |
| vitest (server, web) | 5.0.3 | 5.1.0 | no (minor) | low; engines `^22.12 \|\| ^24 \|\| >=26` fits Node 26 |
| @dnd-kit/core (web) | 6.3.1 exact | 6.3.1 | none | current; exact pin |
| better-sqlite3 | 13.0.3 | 13.0.3 (latest) | none | current; native module, the only one that ties to the Node line |
| typescript (server, web) | 7.0.2 | 7.0.2 (latest; 7.1.0-beta exists) | none | current |
| @types/express | 5.0.6 | not reported outdated | none | current |
| @types/better-sqlite3 | 9.6.0 | not reported outdated | none | current (types major 9 vs library 13: mismatch is inherent in DefinitelyTyped, unchanged) |
| husky, @eslint/js, eslint-plugin-react-hooks, @types/react(-dom) | | not reported outdated | none | current |

Summary of what "update all" does today: with `npm update` only in-range updates (about 17 packages, no major). Majors found: only `@types/node` 22 to 26 (and no other tool major pending; react 19, vite 8, vitest 5, eslint 10, typescript 7, express 5 are all already on their newest major). Not moved by `npm update` because exact-pinned: `jose` (6.2.12 to 6.2.15). Not moved because floating: nothing in npm; the Node image floats on `26-slim` and would move on a rebuild.

Signal: surprising (Node 26 turned LTS on 2026-10-28, so the current pin is already the LTS line; the only major pending is `@types/node`; installed typescript is 6.0.3 at root vs 7.0.2 in workspaces).

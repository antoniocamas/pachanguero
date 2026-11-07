# 01 — Pin the base image tag in one place

## Type
Refactor · Iteration 1 · Absorbs: R1 · Depends on: none

## Mandatory Reading
- `specs/active/WP-007-backups-and-currency/DESIGN_PLAN.md`: section 2 (HLD) and the LLD of each absorbed element
- `specs/active/WP-007-backups-and-currency/REQUIREMENTS.md`: the use cases cited above
- `AGENTS.md`, `docs/test-strategy.md`
- The implementor also discovers, through the project's documentation-routing rule (`AGENTS.md`), the guidelines covering the specific files touched.
- `Dockerfile`, `build.sh`, `study/gates-release-docs.md` (Q-11)

## Description
Both Dockerfile stages are `FROM node:26-slim` and the tag is repeated wherever it is read. Make the base image tag live in exactly one place, so the currency task (04) moves one pin. The built image content does not change.

## Guidelines
1. [x] Read `Dockerfile` and `build.sh`; list every place that names the Node base tag (grep `node:`, `26` in the repo outside `node_modules`, `specs/`).
2. [x] Choose the single home (for example one build argument at the top of the Dockerfile used by both `FROM` lines, with `build.sh` not repeating it) and make every other place read it. Do not add digests; exact tag only.
3. [x] Do not touch the `apt` layer or `--pull` (task 04).
4. [x] Update the Dockerfile header comment and `build.sh` usage text only where they state the tag.

## Tests
- Manual check (build): `./build.sh` builds; `docker run --rm <image> node -v` shows the pinned line. Compare `docker history` layers before and after: same content.
- `grep` finds the tag in one file only.

## Definition of Done
- [x] The tag appears in one place (`grep -rn "node:26" . --exclude-dir=node_modules --exclude-dir=specs` lists one definition)
- [x] `./build.sh` builds; `docker run --rm <image> node -v` prints the pinned major
- [x] **Graduation**: UC-007-03-S1, UC-007-03-S2 (the pin the skill moves) → `document`: lands in the 3pp skill's pins reference (task 04)
- [x] **Documentation**: the `Dockerfile` comment above the `ARG` says it is the one pin (the header's volume wording is task 02/05; `build.sh` names no tag, so no usage change); other documents are task 05
- [x] **Tests**: `npm test`
- [x] **Regression**: `npm test`
- [x] **Code checks**: `npm run lint`, `npm run format:check`

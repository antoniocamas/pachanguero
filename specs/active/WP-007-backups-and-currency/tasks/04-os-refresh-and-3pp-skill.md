# 04 — Every build is current, and a skill keeps the stack current

## Type
Feature · Iteration 1 · Absorbs: F6, F7 · Depends on: 01 (one pin), 03 (checks the skill gates on)

## Mandatory Reading
- `specs/active/WP-007-backups-and-currency/DESIGN_PLAN.md`: section 2 (HLD) and the LLD of each absorbed element
- `specs/active/WP-007-backups-and-currency/REQUIREMENTS.md`: the use cases cited above
- `AGENTS.md`, `docs/test-strategy.md`
- The implementor also discovers, through the project's documentation-routing rule (`AGENTS.md`), the guidelines covering the specific files touched.
- `Dockerfile`, `build.sh`
- `study/currency.md`, `study/gates-release-docs.md`, `study/decisions.md`
- The sibling skill `t4m-3pp-update` (find it in the `trade4me-*` repository; read its SKILL.md and references to copy the style); skill `ai-skill-author`

## Description
UC-007-03. F6: every build carries current OS packages: `build.sh` builds with `--pull` and passes a date build argument that busts an `apt-get update && apt-get upgrade` layer. F7: new skill `ai-kit/skills/pachanguero-3pp-update/` that reports every outdated pin (base image tag, npm dependencies including exact-pinned ones, `@types/node`), updates all of them without asking including majors, asks only for a major of a primary dependency it judges could break the system very hard, lists held items with reasons, runs the checks (`verify-release.sh`, tests), commits as one commit on pass (never pushes) and hands a patch release to the release skill, and commits nothing on a failure. One task: the skill rebuilds with F6's mechanism and gates on F4's script.

## Guidelines
1. **F6**: add the `apt` upgrade layer and a date build argument to the Dockerfile and `build.sh`; nothing is installed on this machine. Keep the single pin of task 01.
2. **F7**: SKILL.md short; the pins and the policy (LTS, else newest; majors included; held items need a reason) in `references/pins.md`; the report format in a reference. Every pin the study found is listed: base image tag, npm, `@types/node`, `jose`, `@dnd-kit/core`, the typescript mismatch (`study/currency.md`).
3. A held item and its reason are written where the next run reads them (a section of `pins.md`), so the second report lists only held items.
4. Do not run the skill for real here; that is task 06.

## Scenario map

| Scenario | Where in `pachanguero-3pp-update` |
|---|---|
| UC-007-03-S1 report | Report steps 2-3; `references/pins.md` (table: home, report command, target); `references/report.md` |
| UC-007-03-S2 everything moves | Update step 2 (majors included, no asking) |
| UC-007-03-S3 asks only for a risky primary major | Update step 2 exception; `pins.md` list of what asks; declined item goes to Held |
| UC-007-03-S4 nothing left unexplained | Update step 6; `pins.md#held`; `report.md` Held table |
| UC-007-03-S6 broken update not committed | Update step 4; On failure (no commit, three choices) |
| UC-007-03-S7 passing update committed | Update steps 8-9 (one commit, never pushed, release offered) |

## Tests
- F6: two builds a day apart (or with two different date arguments) differ in the apt layer: compare `docker history` output. `./build.sh` still builds.
- F7: read-through of UC-007-03-S1…S4, S6, S7 against the skill (table in the task notes). A dry run of the report against the repo lists the known outdated items without changing files.

## Manual Test Plan
1. Run the report step only; it names each outdated item, its target and whether it is a major, and changes no file.
2. Task 06 runs the skill for real, twice, and records that the second report lists only held items; and checks that a deliberate break is not committed (done on a scratch copy, then discarded).

## Definition of Done
- [x] Two builds with different date arguments differ in the apt layer
- [x] `ai-kit/skills/pachanguero-3pp-update/SKILL.md` and references exist, in the style of the sibling skill, and the scenario table maps UC-007-03-S1…S4, S6, S7 to steps
- [x] The report-only dry run lists the outdated items and changes no file
- [x] **Graduation**: UC-007-03 → `document`: the skill and the build's behaviour
- [x] **Documentation**: Dockerfile header comment and `build.sh` usage (this task); `AGENTS.md` pointer, `docs/deployment.md` and the rest in task 05
- [x] **Tests**: `npm test`
- [x] **Regression**: `npm test`
- [x] **Code checks**: `npm run lint`, `npm run format:check`

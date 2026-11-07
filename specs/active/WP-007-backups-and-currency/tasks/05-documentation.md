# 05 — Everything written down, nothing stale

## Type
Feature · Iteration 1 · Absorbs: F10 · Depends on: 02, 03, 04

## Mandatory Reading
- `specs/active/WP-007-backups-and-currency/DESIGN_PLAN.md`: section 2 (HLD) and the LLD of each absorbed element
- `specs/active/WP-007-backups-and-currency/REQUIREMENTS.md`: the use cases cited above
- `AGENTS.md`, `docs/test-strategy.md`
- The implementor also discovers, through the project's documentation-routing rule (`AGENTS.md`), the guidelines covering the specific files touched.
- `study/gates-release-docs.md` (Q-12, the doc map and its greps), `study/shipper-and-restore.md`
- Skills `ai-docs-placement`, `ai-docs-editor`; `home-network-map`'s own `AGENTS.md`; `trade4me-server/docs/deployment/backup-contract.md`
- Design §4 (Documentation Impact), one entry per document

## Description
UC-007-05. Write every document for the state tasks 02–04 built, before anything is released. Each fact has one home and the others link to it. Repository: `AGENTS.md`, `docs/deployment.md`, `docs/backup_and_restore.md`, `docs/commands.md`, `.env.example`. Infrastructure: `home-network-map/services/{pachanguero,backup-shipper,rsync-papiros}/info.md`, and a paragraph in `trade4me-server/docs/deployment/backup-contract.md`. Describe the shipper entry and the cutover as the procedure that task 06 will run, in the restore document leave a "Restore drills" line with the date to be filled by task 06. Nothing outside the work package names a use case or work-package identifier.

## Guidelines
1. Re-run the greps of the doc map (`-c backup`, `/backups`, `pachanguero-backups`, `backupsSize`, `backup.keep`, `hourUtc`, `before-migration`, `not automated`, `PACHANGUERO_BACKUPS`, `node:26`) because the code has moved.
2. Decide placement with `ai-docs-placement`, write with `ai-docs-editor`, per the design's §4. Absolute dates; `TODO` for the unknown; update "Last reviewed" in the `home-network-map` pages; set the backups-share-the-disk security row to `resolved` with the date and keep the row.
3. The restore chapter says where the passphrase is kept and never prints it.
4. Edits in `home-network-map` and `trade4me-server` are separate repositories: edit the files, show the diffs, and commit nothing there without the user's go-ahead.
5. After writing, a separate reviewing agent reads the changed documents for the rows of UC-007-05-S1's table.

## Tests
- Search (automatable): the old names (`pachanguero-*.db`, `before-migration`, "not automated", `backupsSize`, `backup.keep`, `hourUtc`, `node:26-slim` as a literal in docs, `ls /backups/pachanguero-`) find nothing outside closed work packages, across the three repositories.
- `npm run format:check` passes on the edited Markdown.

## Manual Test Plan
1. The reviewing agent finds each row of UC-007-05-S1's table in exactly one document and reports any it cannot.
2. Change a backup name in a thought experiment and trace its dependants through `docs/deployment.md`'s impact table, ending at the shipper pattern and the staging folder (UC-007-05-S2).

## Definition of Done
- [ ] The search finds no old name
- [ ] The reviewing agent's report lists each UC-007-05-S1 row with its document; gaps fixed
- [ ] The impact table names the staging hostPath, the pinned versions and `PACHANGUERO_VERSION`; the shipper's name pattern and staging folder are reachable from it
- [ ] "Restore drills" line exists with an empty date for task 06
- [ ] **Graduation**: UC-007-05 → `document` (the documents themselves); UC-007-02-S2 → `document` (restore chapter)
- [ ] **Documentation**: the documents of design §4, one by one, as the task's output
- [ ] **Tests**: `npm test`
- [ ] **Regression**: `npm test`
- [ ] **Code checks**: `npm run format:check`, `npm run lint`

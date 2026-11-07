# Anatomy — WP-007-backups-and-currency

**Status:** approved

## Cut

One iteration.

| # | Iteration | Elements | Deferred | Order | Why the cut is here |
|---|-----------|----------|----------|-------|---------------------|
| 1 | Backups and currency | R1, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10 | none | R1 first (refactor before features), then F1 → F2 → F3 (names before chart before readers), F4 → F6 → F5 → F7, then F10 (documents precede the release), then F8 → F9 (shipper before cutover) | One deliverable: the group's data is backed up to papiros and the stack stays current. No deferral, so no resolve-task. |

## Partition check

Inventory (design 2.6, 2.7): R1, F1–F10 = 11 elements.

- In no iteration: none.
- In two iterations: none.

## Sizing test

- **Estimated tasks: 6, below the 10–15 band**, so one iteration. Grouped by bond, not one per element:
  1. R1 (refactor, alone: type bound).
  2. F1 + F2 + F3: one scenario family (UC-007-01); F2 and F3 have no value without F1's names (inseparable dependency).
  3. F4 + F5: the release flow and its checks (UC-007-04); F5 runs F4's script.
  4. F6 + F7: currency (UC-007-03); the 3pp skill rebuilds with F6's OS refresh and gates on F4's checks.
  5. F10: all documents, repository and infrastructure, written against what 1–4 built, before anything is released.
  6. F8 + F9, the final task: the real upgrade and release. It only uses what 1–5 built (code, skills, documents): run the 3pp skill for real, release the result with the release skill (also the cutover: adopt the old backup, shipper entry, ship, drill, retire the old PVC). Its only writing is the drill date in the restore document. It is also the full regression.
- **No split proposed.** The candidate boundary is *code and chart (R1, F1–F7)* vs *cutover (F8–F10)*. Cancellation test: if the cutover iteration were cancelled, the new names, hostPath and checks would sit unused, with nothing shipping them to papiros, so the first half has no value alone. If the code half were cancelled, the cutover has nothing to adopt. It fails, so it stays one iteration.
- The design's component grouping (Backup writer, Chart, Build…) is not a delivery boundary and was not used as one.

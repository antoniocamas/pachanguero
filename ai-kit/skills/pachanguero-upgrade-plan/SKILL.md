---
name: pachanguero-upgrade-plan
description: Write the plan for a pachanguero third-party upgrade that requires one: a move the operator runs by hand. Use for "plan the upgrade of <item>", "write an upgrade plan", "plan this item".
---

CODENAME: SKILL-PACHANGUERO-UPGRADE-PLAN-629

# Pachanguero upgrade plan

Run from the `pachanguero` repo root. Called by **Requires-plan item** of
`skill: pachanguero-3pp-update`, the owning skill; it reuses its procedures. Change no file but the
plan.

1. Name the item, its from and to versions.
2. Run **Report** of `skill: pachanguero-3pp-update`. Copy the item's row and any entry for it.
3. Read the item's release notes. Keep only what applies here.
4. Read the current state read-only: `Dockerfile`, `package.json` files, the chart, and, with
   `skill: pachanguero-deployment-management`, what runs on erebor. List the facts that decide a
   risk (config, services, data, network).
5. Write **Prerequisites**: a clean tree; a fresh release backup as in **Back up production** of
   `skill: pachanguero-release`; the files to save.
6. Write **Rehearsal**: the **Checks** of `skill: pachanguero-3pp-update`, and the image on a
   scrubbed copy of production (`scripts/prod-copy.sh`, then
   `scripts/verify-release.sh image --db data/prod-copy/pachanguero.db`). Name the risks it cannot
   cover.
7. Write **Steps**: one action per line, tagged operator or assistant, each ending with a check of
   the owning skill.
8. Write **Way back**: restore the previous pins as in **On failure** of
   `skill: pachanguero-3pp-update`; in production, the rollback of `pachanguero-release`.
9. Write **Report**: the **Report** of `skill: pachanguero-3pp-update` after the upgrade.
10. Ask where to save the plan.
11. Add a checklist whose first unchecked box is the position.
12. Show the plan. Nothing runs before the user confirms; then it runs in the order of
    **Update** of `skill: pachanguero-3pp-update`.
13. Anything the plan leaves behind on purpose (a workaround, an item kept back): run **Record** of
    `skill: pachanguero-3pp-update`.

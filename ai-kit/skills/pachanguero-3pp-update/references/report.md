# Report layout

One table, one row per outdated item, sorted by home. Columns:

| Item | Home | Now | Moves to | Major? | Note |
| ---- | ---- | --- | -------- | ------ | ---- |

- `Major?` is `yes` when the first number of the version changes (the first non-zero number below 1.0).
- `Note` carries what the reader needs: `exact pin`, `LTS`, `asks first`, `needs playwright install`,
  `no LTS: newest`.
- Under the table, a second one: **Held**, each held item of [pins.md](pins.md#held) with its
  reason. Held items never appear in the first table.
- Then one line per finding that is not an update: the typescript mismatch, a tag that does not
  exist, a line past end of life or within 90 days of it.
- Nothing outdated and nothing held: say `Everything is current.`

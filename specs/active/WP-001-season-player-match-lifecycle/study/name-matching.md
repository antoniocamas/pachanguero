# Q-05 — Canonical name / alias / nickname matching

`players.name` (schema.sql) is `TEXT NOT NULL UNIQUE` — one name per player, used both as display
name and as the sole matching key (`addPlayer`'s `INSERT OR IGNORE ... WHERE name = ?`, `repo.ts`).
There is no alias, nickname, or normalized-form table anywhere in `schema.sql`, and no text-parsing
or normalization code exists in the repository at all — no emoji-stripping, no fuzzy matching, no
"parse a pasted list" module under `server/src` or `server/scripts`. `import-season.ts` reads
structured CSV columns keyed by the exact sheet name already used in `players`, not free text.

This confirms the WhatsApp-paste flow (canonical name plus nickname/emoji-tolerant matching, with a
resolve-ambiguity UI per Vision §4) is new work with nothing existing to build on beyond the plain
`players.name` uniqueness constraint.

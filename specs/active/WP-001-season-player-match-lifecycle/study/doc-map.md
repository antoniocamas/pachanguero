# Q-07 — Doc map: what this WP makes untrue

- **`docs/domain-model/glossary.md`** — "Temporada" and the "Jugón" entry describe today's
  season/player coupling; the "Convocatoria" and "FueraDeConvocatoria" entries describe only the
  pre-game algorithmic step, with no post-game/attendance/team-split vocabulary. This WP will need
  new glossary entries (candidate, reserve, occasional/guest player, final convocatoria,
  Claros/Oscuros) and a correction to "Convocatoria" once a candidate/final distinction exists.
- **`docs/domain-model/convocatoria.md`** — describes `buildConvocatoria`'s algorithm itself, which
  Vision §3 puts out of scope; stays accurate as a description of the ranking/mercy logic, but its
  framing of "apuntados" as the whole story (step 1, "Reunir a los apuntados") will need a pointer
  to wherever candidate-vs-final is now documented, since post-commit `played` no longer means
  "final."
- **`docs/domain-model/points.md`** — not yet read in full; likely documents `computePoints` and
  the attendance/exclusion/seniority formula, which Vision keeps as-is, but any doc text implying
  `played` is set once and is final will go stale once a real post-game correction step exists.
- **`docs/domain-model/README.md`, `data-quality.md`, `legacy-*.md`** — describe the legacy
  spreadsheet and known data-quality issues; likely untouched by this WP since they're historical
  record, not current-system description — worth a pass in Design to confirm none assert the
  current schema is final.

No code changes have been made yet; this is a forward-looking map for the Design phase's doc-map
citation, not a list of already-broken docs.

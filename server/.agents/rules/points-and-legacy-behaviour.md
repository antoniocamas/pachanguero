CODENAME: DC-POINTS-LEGACY-311

# Points and legacy behaviour

The points formula is in `docs/domain-model/points.md`; the legacy background in `docs/domain-model/legacy-script-review.md`.

- Count _payments_, never appearances, towards points.
- Score only exclusions of kind `points` or `demoted`; a `mercy` seat does not score.
- Keep seniority a log curve (`seniority.ts`); never replace it with a table.
- Default behaviour reproduces the legacy Apps Script, bugs included. With `mercy_resets_counter = 0` a mercy seat _subtracts_ from the wait counter and it can go negative: deliberate, and tests assert it. The flag switches to the organiser's stated rule (reset to zero).
- Any change away from legacy behaviour is opt-in per season, never a default.

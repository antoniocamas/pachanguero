# What a convocatoria stores, and how exclusions follow from it (Q-02, Q-03)

Searched: `ConvocatoriaService`, `ExclusionRepository`, `FinalListResolutionService`, the `convocatorias` / `convocatoria_entries` tables, `docs/domain-model/convocatoria.md`.

## Q-02 — what `commit` freezes

- One `convocatorias` row per game (`rules_json`, a previous one is deleted and rewritten on re-commit) and one `convocatoria_entries` row per **real** player: `position`, `points`, `wait_counter`, `outcome` (`called_up`, `excluded`, `mercy`, `demoted`) and `playing` (1/0).
- Anonymous guests (negative ids) are never stored. A named guest is stored like any player.
- `playing` already says who is in. So **"who played" can be read from the convocatoria today**; no new field is needed for that.
- Nothing allows editing an entry: the only way to change a convocatoria is to run `commit` again, which regenerates it from the apuntados and **discards any manual change**. A hand edit has nowhere to live.
- `preview` ignores `played` and any stored convocatoria; it always recomputes from `signed_up` and the guest rows.

## Q-03 — exclusions today

- `commit` writes an exclusion row for `excluded` (`points`), `mercy` and `demoted`.
- `FinalListResolutionService.reconcileExclusions` removes the row for an `excluded` or `demoted` player who is on the pasted list, and puts it back if they are not. **`mercy` is never retracted** and a `called_up` player who then did not play is **never penalised**.
- Rule that scores (AGENTS.md): only exclusions of kind `points` or `demoted` count.

## What "apuntados vs convocatoria" would give

Computed from the two lists, "signed up and not in the convocatoria" is exactly the set of `excluded`/`demoted`/`mercy` entries a fresh `commit` writes. They differ in three cases the requirements must decide:

1. A **hand edit that swaps** an `excluded` player in: today's reconcile retracts their point; a derivation must too.
2. A `called_up` player swapped **out**: today no point; a pure difference rule would give one. Decision needed.
3. A `mercy` player who plays: today the mercy mark is kept and never scores; under the decision below they are in the convocatoria, so they earn the attendance point on paying and nothing else.

## Decision (author)

The point rules do not change, and settle the three cases above:

- **Signed up and not in the convocatoria** earns an exclusion point, including a called-up player swapped out by hand.
- **In the convocatoria** earns the attendance point **only once they pay**.

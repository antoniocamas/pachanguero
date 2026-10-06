# What the legacy sheet does that the app does not (Q-06)

Searched: `docs/domain-model/legacy-spreadsheet.md`, `legacy-script-review.md`, `convocatoria.md`.

- The sheet has no separate final list. `Pagos` is a player × week grid where one cell (`*` or a number) is at once "signed up", "played and owe" and "no points yet". The `Convocatoria` tab is the algorithm's output for the **next** game only.
- So the sheet's "apuntados" and "convocatoria" are what the app now calls the same; its end of week state is payment, not a list.
- Not present in the app: nothing the sheet did is missing, but its one-cell design is what the app deliberately separated (`signed_up`, `played`, `paid_cents` + `paid_on`, AGENTS.md). Any new rule must keep them separate.
- The imported history is the sheet's `Pagos`, so it records payment and signup per game, never a convocatoria.

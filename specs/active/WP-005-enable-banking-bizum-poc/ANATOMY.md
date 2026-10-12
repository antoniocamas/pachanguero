# Anatomy — WP-005-enable-banking-bizum-poc

**Status:** approved

One iteration. Elements are the rows of `DESIGN_PLAN.md` §2.7 (no refactors). The design has **2 deferrals** (F4, F7).

## Iteration 1 — The PoC and its two guides

- **Elements:** F1, F2, F3, F4, F5, F6, F7
- **Deferred:** F4, F7
- **Order:** F1 → F2 → F3 → F4 (resolved by the real Bizums) → F5 → F6 → F7. F6 runs last of the commands because it probes the rate limit on purpose. F7 follows once the commands have produced their findings.
- **Why the cut is here:** there is no cut. See the sizing test below.

## Partition check

| Check                         | Result                                                  |
| ----------------------------- | ------------------------------------------------------- |
| Element in **no** iteration   | none — all 7 rows of §2.7 (F1–F7) are in iteration 1    |
| Element in **two** iterations | none                                                    |

## Sizing test (shown, not assumed)

**Estimated task count: 6–7**, below the 10–15 band, so one iteration. Cancellation test: there is no boundary proposed, so none to pass. The deferrals do not need their own iteration: F4's resolver (the real Bizum payloads) and F7's resolver (the results of running F1–F6) are produced by tasks of this same iteration, so they are task order, not a boundary.

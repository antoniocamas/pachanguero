# Anatomy — WP-005-enable-banking-bizum-poc

**Status:** approved

Two iterations. Elements are the rows of `DESIGN_PLAN.md` §2.7 (no refactors). The design has **3 deferrals** (F4, F7, and F8, since resolved into F8–F11).

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

## Iteration 2 — Sandbox testing experiments

- **Elements:** F8, F9, F10, F11, F12
- **Deferred:** none (F8 was deferred; the iteration's requirements resolved it into F8–F12, and the scoped design was skipped by the author)
- **Order:** F8 first (its questions decide whether a sandbox run can be unattended and from a known state, hence whether the rest can be scripted); then F9, then F10, then F11 (the two documents, with a placeholder where the limits go), then F12 (the limits, last, after iteration 1's task 03, because it probes a rate limit on purpose; it fills the placeholder).
- **Why the cut is here:** raised later by WP-006 (2026-10-17), needs a Sandbox application and not the real account, so it neither depends on iteration 1's task 03 (waiting on the rate-limit recovery times) nor blocks it. Cancellation test: if iteration 2 were cancelled, iteration 1's PoC and guides stand complete; if iteration 1 were cancelled, the sandbox answers still stand.

## Partition check (re-cut)

F1–F7 stay in iteration 1, F8–F12 are in iteration 2: no element in no iteration, none in two. Iteration 1 is not renumbered.

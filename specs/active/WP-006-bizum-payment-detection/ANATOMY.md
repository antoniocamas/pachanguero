# Anatomy — WP-006-bizum-payment-detection

**Status: approved**

The design's 18 elements (`DESIGN_PLAN.md` 2.6, 2.7), as delivery slices. All are `terminal`; no iteration carries a deferral.

## Iterations

| # | Iteration | Elements | Deferred | Why the cut is here |
| - | --------- | -------- | -------- | ------------------- |
| 1 | Bizum payment detection | R1, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, F17 | — | One slice: no part delivers value without the others that justifies an iteration of its own (author's ruling, 2026-10-19: no tiny iterations). |

Every manual step of the work package is in its last task (author's condition, 2026-10-19): the earlier tasks are verified by automated tests only.

Task order (not boundaries): R1 → F1 → F2 with F3 → F15 with F5 and F14 → F4 with F6 → F7 → F8 with F9 → F10 with F11 → F12 with F13 → F16 → F17.

- The refactor comes first.
- F1 lands the first migration of the live database before the bank's.
- F2's model and ports come before everything built on them.
- F15's fixtures and contract come with F5 and before F4.
- The real-data rehearsal F17 comes last.

## Partition check

| Check | Result |
| ----- | ------ |
| An element in no iteration | none: R1, F1–F17 all placed (18) |
| An element in two iterations | none |

## Sizing test

**Estimated tasks: about 18**, including the closing regression. That is above the 10–15 band.

A cut after R1 and F1 passed the cancellation test, but the author rejected it as too small an iteration (2026-10-19). Every cut inside the bank feed fails the test:

- without the screens, nobody can connect the bank or see the waiting list;
- a connected bank with no rules reads nothing of value;
- the rehearsal validates the rest and stands alone in nothing.

So the work package is one iteration.

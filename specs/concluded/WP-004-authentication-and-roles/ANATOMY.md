# Anatomy — WP-004-authentication-and-roles

Status: approved

Inventory: the Refactors and New Functionality tables of [`DESIGN_PLAN.md`](DESIGN_PLAN.md) (2.6, 2.7):
R1, R2, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F13, F14 (15 elements; F12 is retracted and its
identifier is not reused). No element is deferred.

## Iteration 1 — Authentication and roles, end to end

- **Elements:** R1, R2, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F13, F14
- **Deferred:** none
- **Why one iteration:** about 6 tasks, well under the 10-15 band, and no cut passes the test below as a
  delivery boundary.

Order inside the iteration (task order, not a boundary). Whatever could invalidate the rest first:

1. R1 (versioned schema and backup) and R2 (shells): the two refactors, first.
2. F1, F2, F3, F4, F8, F13: an admin can log in and everything else is closed, with the test harness
   and the E2E fixture landing in the same change as the guard.
3. F5, F6, F7, F9: the player's own side.
4. F10, F11, F14: backup at will, the image, the documents.

## The partition check

Every element appears in exactly one iteration: 15 of 15 in iteration 1, none in two, none in none.

## The sizing test

**Estimated task count: about 6** (R1; R2; F1+F2+F3+F4+F8+F13; F5+F6+F7+F9; F10+F11+F14; a closing
regression). Far below the 10-15 band, so the default (one iteration) stands. The boundaries that
could still be proposed, with the cancellation test:

| Boundary                                            | If the other side were cancelled, would the rest make sense?                                                                      | Verdict                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Server \| web                                       | Cancel the web: F3 makes every `/api` route answer 401 to the existing admin app, which has no login screen.                      | Fails                                                             |
| Core auth \| the player's own side (F5, F6, F7, F9) | The core stands alone, but the own side has nothing to log in with without it, and the work package exists for the player's view. | Passes one way only; ships nothing the author asked to ship alone |
| Packaging and docs (F10, F11, F14) \| the rest      | F11 needs F2's `JWT_SECRET` check and F4's CLI to be testable; F14 documents everything.                                          | Fails                                                             |

The pre-drawn design agenda (deleted at the end of the design phase) is not used as a boundary.

## How the F13 order problem is closed

F13's server half (`ManualClock`, `AuthTestApp`) is used by the route tests of F2 and F3, and its E2E
half needs F4's CLI and F8's login screen. Grouping F1, F2, F3, F4, F8 and F13 into one task closes it
without splitting F13: they are bonded by scenario (F2, F3, F8 and F13 realise UC-004-01..03) and by
inseparable dependency (F13's seeding runs F4's CLI; F1 has no value without F2). Inside the task the
harness is written first and the E2E part last. It also removes the stretch in which the guard is on
and `npm run test:e2e` is red, because the guard and the E2E fixture land together. F5-F7 and F9 then
write their tests with the harness that already exists.

Risk the author weighs at the tasks gate: the second task is large (six elements). It is one coherent
change (an authenticated admin, end to end), but it is the one to cut first if it proves too big.

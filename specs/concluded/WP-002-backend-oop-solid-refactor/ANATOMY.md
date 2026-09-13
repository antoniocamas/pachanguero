# Anatomy — WP-002-backend-oop-solid-refactor

## Iteration 1 — The whole rewrite

**Elements:** E1-E15 (all of them). **Deferred:** none — every element is `terminal` in
`DESIGN_PLAN.md`.

**Why one iteration:** no deferral exists to justify a split (the only reason a second iteration
would earn its overhead), the whole change is behind one existing test suite that verifies it in
seconds, and every element depends on at most a few others in the same short dependency chain
(domain classes → repositories → services → composition root/call sites) — splitting it would not
let the rest still make sense if the other iteration were cancelled, which is the test for whether
a split is real.

| Element                                           | Realizes             | Status   |
| ------------------------------------------------- | -------------------- | -------- |
| E1 `PointsCalculator`                             | UC-002-01            | terminal |
| E2 `SeniorityCurve`                               | UC-002-02            | terminal |
| E3 `ExclusionHistory`                             | UC-002-03 (supports) | terminal |
| E4 `ConvocatoriaBuilder`                          | UC-002-03            | terminal |
| E5 `SeasonRepository`                             | UC-002-04            | terminal |
| E6 `PlayerRepository`                             | UC-002-04            | terminal |
| E7 `GameRepository`                               | UC-002-04            | terminal |
| E8 `ParticipationRepository`                      | UC-002-04            | terminal |
| E9 `ExclusionRepository`                          | UC-002-04            | terminal |
| E10 `ConvocatoriaService`                         | UC-002-04-S2         | terminal |
| E11 `StandingsService`                            | UC-002-04            | terminal |
| E12 Composition root + `routes/api.ts` call sites | UC-002-05            | terminal |
| E13 `import-season.ts` call sites                 | UC-002-04-S3         | terminal |
| E14 `README.md` §Estructura                       | UC-002-07-S1         | terminal |
| E15 `AGENTS.md` §Architecture, §Coding standard   | UC-002-07-S2         | terminal |

Partition check: every element above appears in exactly one row, and every design element (E1-E15)
appears above — none missing, none duplicated.

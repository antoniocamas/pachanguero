# Backend Oop Solid Refactor

The backend (server/src/domain/*.ts, repo.ts) is written as free functions; the new .agents/rules/coding-standard.md mandates OOP/SOLID with no free functions and no stateless static methods, and WP-001 is blocked from writing conforming server/src code until this lands.
Rewrite points.ts, seniority.ts, convocatoria.ts, types.ts and repo.ts into classes (PointsCalculator, SeniorityCurve, ConvocatoriaBuilder, per-aggregate repositories behind interfaces), with routes/api.ts calling into them instead of free functions.
Pure behavior-preserving refactor: no functional change, existing domain tests keep passing unchanged in behavior (moved/adapted to the new class shapes). Unblocks WP-001 and every future work package from having to choose between conforming to the standard and matching the existing style.

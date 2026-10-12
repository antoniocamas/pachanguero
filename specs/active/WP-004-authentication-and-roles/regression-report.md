# Full regression report — 2026-10-12

Run on a throwaway database (`PACHANGUERO_DB` in the job's tmp directory), not on `data/pachanguero.db`,
so the working database and its accounts were not touched.

## Timings

| Step                   | Command                | Tests         | Time        | Result                     |
| ---------------------- | ---------------------- | ------------- | ----------- | -------------------------- |
| Seed                   | `npm run seed`         | —             | 3.9 s       | pass                       |
| Build                  | `npm run build`        | —             | 4.5 s       | pass                       |
| Server tests           | `npm test` (1st half)  | 868 in 70 files | 20.0 s    | pass                       |
| Web tests              | `npm test` (2nd half)  | 132 in 15 files | 2.7 s     | pass                       |
| **`npm test` total**   |                        | **1000**      | **26.5 s**  | pass                       |
| E2E                    | `npm run test:e2e`     | 40 in 4 specs | 303.6 s (5.1 min) | pass                 |
| Lint                   | `npm run lint`         | —             | 22.5 s      | pass                       |
| Format check           | `npm run format:check` | —             | 26.0 s      | pass after ignoring `specs` (19.1 s) |

E2E per spec file: `the-game-screen` 22 tests, `season-and-player` 9, `the-own-view` 6, `login` 3.
Average ≈ 7.6 s per E2E test; ≈ 26 ms per unit/integration test.
Whole regression ≈ 6.9 min, of which E2E is 74 %.

## Findings

1. `format:check` failed on 14 files, all under `specs/`. Ruled by the author: `specs` is now in
   `.prettierignore`. Re-run: passes, 19.1 s.
2. An extra check of the server on an old database found it crashes when the file is not in WAL mode.
   Ruled by the author: old databases are not supported, so this is not a bug and the check was
   dropped from the task.

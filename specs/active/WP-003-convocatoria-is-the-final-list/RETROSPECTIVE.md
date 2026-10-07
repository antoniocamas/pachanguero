# Retrospective — WP-003-convocatoria-is-the-final-list

## What Worked

- 2026-10-07: [testing] The `GameFlow` test helper (a real in-memory database wired like production, built for the played-derivation task) was reused unchanged by the payments, teams and query-cost tests of the next tasks; each new effect only had to be added to one place.

## What Didn't Work

- R-001: 2026-10-07: [testing] A named guest could never be saved through the HTTP API: the request reader dropped the `introduced` flag the screen sends, while every earlier test exercised the service directly. It surfaced only when the game-screen end-to-end test needed a host with a named guest, and cost a diagnosis round and a fix outside that task's scope.
- R-002: 2026-10-07: [tools] Adding a second end-to-end spec file broke the first-season journey: the runner executed files on parallel workers against the one shared database, a fact the test strategy only implied. Cost a full-suite re-run to find.

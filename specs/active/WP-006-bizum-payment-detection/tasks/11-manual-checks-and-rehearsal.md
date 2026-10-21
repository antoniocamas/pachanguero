# Task 11 — Every manual check, and the real-data rehearsal

## Type

**Study.** Iteration 1. Elements absorbed: **F17**; it also runs the manual test plans of **F4, F5, F7, F12, F13, F14** and the guided checklist of **F15/F16** (the author's condition, 2026-10-19: every manual step of the work package is in this last task). Depends on: tasks 01–10.

## Mandatory Reading

- `DESIGN_PLAN.md`:
  - section 3 `#### F17`, in full;
  - the "Manual Test Plan guidelines" of `#### F4`, `#### F5`, `#### F7`, `#### F12`, `#### F13`, `#### F14`;
  - 2.10 (the tiers).
- `REQUIREMENTS.md`: Success Criteria, the rehearsal row.
- `docs/test-strategy.md` (as rewritten by task 10): the guided sandbox checklist.
- `ai-kit/skills/pachanguero-deployment-management/SKILL.md`, before any `kubectl` call (fetching the backup).
- `ai-kit/skills/pachanguero-release/SKILL.md`, before the production steps (part E).
- WP-005 guide `enable-banking-revolut-integration.md` §2, §4.

## Description

Verify by hand what no automated test can show, then run the one-time rehearsal on a copy of production with the real Revolut account. The checks:

- the layout of the screens at phone width;
- the real Revolut consent, renewal and disconnection;
- a real read compared with the guide's rule;
- the bank's redirect, with the organiser signed in and signed out;
- the production settings after release.

The answer this task must give: **does the complete solution, on real data, ever record a wrong payment, and is every waiting or discarded Bizum explainable?** It is complete when the report's counts and the pass/fail of every step below are recorded in `RETROSPECTIVE.md` (counts only: no names, amounts or references).

Write the throwaway tool and its procedure as F17 describes: `rehearsal/rehearsal.ts` (`reset`, `report`, guards and marker) and `rehearsal/README.md`. Check the tool on a copy of the local database before using it on the production copy.

## Guidelines

Run the parts in order. **Stop at any failure:**

- a wrong payment, or a step that does not behave as written, is an escalation (`skill: auctor-impact`);
- a refused `localhost` redirect (C3) needs the author's decision.

## Manual Test Plan

**A. Regression and the sandbox (tiers 1–5)**

1. Run `npm test`, `npm run test:e2e`, `npm run lint` and `npm run format:check`. All pass; record the times.
2. If the standing sandbox session is configured in the local `.env`, run `npm run test:sandbox`. It passes; record the time. If it is not configured, record "sandbox suite not run" and why.
3. Follow the guided sandbox checklist of `docs/test-strategy.md` (a fresh consent through the callback on `localhost`, an entry added after a read, a pending entry booked). Each item behaves as written there.

**B. Screens at phone width (F12, F13), with the fake bank**

4. Start the app locally with the fake bank as the E2E does, and set the browser to 375 px wide.
5. Compare Ajustes › Banco in each state with frames 1–4 of `requirements/examples/screens.html`: no horizontal scroll, and the account shown only as type, currency and last 4.
6. Compare Deudas with frames 5 and 6, and each dialog with frames 7, 8, 9 and 12. Every button is reachable with a thumb, and the dialogs fill the screen.
7. With the setup incomplete (no start date), Deudas offers no "Leer ahora", and the panel says what is missing.
8. Switch to "Ver como jugador". Deudas is not reachable, no banner shows, and no Bizum data appears anywhere.

**C. The rehearsal on a copy of production, with the real account (F17, F4, F5, F7, F12, F13)**

9. Through the deployment-management skill, fetch the latest daily backup into `~/pachanguero-rehearsal/`. This is read-only on production.
10. Run `rehearsal reset --db <copy> --from 2026-09-01`. `ground-truth.json` is written, and the payments since 2026-09-01 are back as debts.
11. Start the app built for production on the copy: `PACHANGUERO_DB` = the copy, `PACHANGUERO_BACKUPS` = `~/pachanguero-rehearsal/backups`, `PACHANGUERO_PUBLIC_URL=http://localhost:8787`, and the production Enable Banking id and key in the local `.env`. The log shows the migration to version 5, and a `…-before-migration.db` exists in the backups folder.
12. In the Enable Banking Control Panel's production application, add `http://localhost:8787/api/bank/callback` as an allowed redirect URL. **If it is refused, stop and ask the author.**
13. Sign in, open Ajustes › Banco, press "Conectar con Revolut" on the desktop, and approve in the Revolut app. The panel shows "Conectado hasta <about 179 days ahead>" and the four accounts, summarised.
14. Choose the EUR account and set the start date to 2026-09-01.
15. Press "Leer ahora" in Deudas. The read ends with counts. Bizums appear as Bizum payments or in "Bizums en espera". Pressing again at once says "Espera unos minutos".
16. Compare the number of Bizums kept plus discarded since 2026-09-01 with the guide's rule over the same days (the PoC's `fetch` and `recognise`, read-only). They are equal (F4).

*Checkout point to come back to this step after bug found*
Data
 To come back to this moment
  1. Stop the server (Ctrl+C in its terminal).
  2. Run:
  cp ~/pachanguero-rehearsal/snapshots/20261021-001229/pachanguero.db ~/pachanguero-rehearsal/pachanguero-20261020-020000.db
  rm -f ~/pachanguero-rehearsal/pachanguero-20261020-020000.db-wal ~/pachanguero-rehearsal/pachanguero-20261020-020000.db-shm
  3. Start the server again as before.

  The two rm lines clear the live database's journal files so the restored copy isn't mixed with stale ones.
  
  The earlier safety copy ~/pachanguero-rehearsal/before-adam-reset.db is also still there. It's the state just before the Adam reset,
  with Adam paired and paid.




17. Go through "Bizums en espera": pair senders, helped by the suggestions, and note each pairing; rule or dismiss only where the organiser really would. Pairing settles what then qualifies.
18. After 5 minutes, press "Leer ahora" in the Banco panel. Every entry is counted as known, and nothing new is listed or paid.
19. Signed-out return: start a renewal ("Renovar"), sign out in another tab, approve in Revolut. The login appears; after signing in, the panel shows the new end date (F12). The previous session shows closed in the Control Panel (F5).
20. The banner: with `sqlite3` on the **copy**, set `bank_connection.valid_until` to 10 days ahead and reload. The banner reads "La conexión con el banco caduca en 10 días" on every admin tab, and not in "Ver como jugador".
21. Run `rehearsal report`. Read `report.md` with the organiser.
22. Press "Desconectar" and confirm: "Sin conexión", and the session shows closed in the Control Panel. Remove the `localhost` redirect URL from the production application.
23. The server log of the whole run holds no key, token, code, state, session id, sender, subject or amount: `grep` the log for the session id, a sender seen in the report and the word `Bizum payment from`. Nothing is found.

**D. Record**

24. Copy the report's counts (agreed, disagreed, extra, open, waiting by reason, discarded by rule) and the pass/fail of steps 1–23 into `RETROSPECTIVE.md`. Keep `~/pachanguero-rehearsal/` local, or delete it; nothing of it is committed.

**E. After the release that carries this work package** (when the author releases, per the release skill)

25. `helm template` with the operator's values, or `kubectl get secret pachanguero -o jsonpath='{.data}'` showing **key names only**, shows `PACHANGUERO_PUBLIC_URL`, `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY` (F14).
26. In production, Ajustes › Banco names no missing setting. Connect with the real account as in step 13, and see "Conectado hasta …" (F5, in production).

## Definition of Done

- [x] Steps 1–24 done and passed, or each failure escalated and resolved.
- [x] The rehearsal report has **no disagreed payment**, and every extra payment is explained (F17's pass condition).
- [x] `RETROSPECTIVE.md` holds the counts and the pass/fail of each step, with no personal data.
- [x] Steps 25–26 done after the release, or recorded as owed in `PROGRESS.md`'s open items if the release comes later.
- [x] The localhost redirect is removed from the production application, and the rehearsal's bank session is closed.
- [x] Nothing under `~/pachanguero-rehearsal/` is in the repository (`git status` clean of it).
- [x] **Graduation:** the rehearsal success criterion → `throwaway` (a one-time check whose counts stay in the retrospective).
- [x] **Hard requirements:** none new.
- [x] **Documentation:** none outside the work package; the tool and its README live in `rehearsal/` inside it.
- [x] **Tests:** `npm test`; `npm run test:e2e` (step 1).
- [x] **Regression:** `npm test` (step 1).
- [x] **Code checks:** `npm run lint`, `npm run format:check` (step 1); the tool follows the coding standard, though it lives outside `server/src`.

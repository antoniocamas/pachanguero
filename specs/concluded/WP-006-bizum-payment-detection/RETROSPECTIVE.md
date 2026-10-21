# Retrospective — WP-006-bizum-payment-detection

## What Worked
- 2026-10-21: [testing] The rehearsal on a copy of production, read through the real account, found what no fake-bank test had: the Adam case (a Bizum booked before the games it pays, one sender text shared by several Bizums) and the misleading ruling dialogs. Driving the real UI with Playwright against a copy of the checkpoint, instead of arguing from tests, is what located each defect.
- 2026-10-21: [process] A named checkpoint of the rehearsal database (clean state, every Bizum waiting) made each retest start from the same place and separated the user's own testing from the snapshot.

## Rehearsal results (task 11, no personal data)

Hand-recorded payments since 2026-09-01: 67.

| Agreed | Disagreed | Extra | Open debts | Waiting |
|--------|-----------|-------|------------|---------|
| 51 | 1 | 0 | 15 | 0 |

Bizum entries: kept 45, discarded by rule 4, dismissed by the organiser 8, not a Bizum 89. The repeat read counted all 146 entries as known and found nothing new.

The one disagreement is the payer only: same game, share, amount, date and holder; the system records the account holder who sent the Bizum, the hand record names the guest the share was for. No amount or game differs.

| Step | Result |
|------|--------|
| 1 | passed: server 1685, web 260, E2E 46 (6.7 min), lint, format |
| 2–3 | passed |
| 4–8 | passed |
| 9–16 | passed |
| 17 | passed after the Adam fixes |
| 18 | passed |
| 19 | passed |
| 20 | passed: banner shown with `valid_until` set 10 days ahead |
| 21 | report written; the one disagreed payment (payer only) accepted by the organiser as a recording convention |
| 22 | passed: disconnected; redirect removed |
| 23 | log of the final server run (319 bytes) holds no session id, sender, subject, amount or `Bizum payment from`; logs of earlier runs were not kept |
| 25 | passed in production (release 0.2.0): the Secret holds `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` and `JWT_SECRET`; the deployment's env holds `PACHANGUERO_PUBLIC_URL` |
| 26 | passed in production: the real account connected; the first read returned 4 entries since the start date and missed Bizums that the account held two days earlier; reading again brought them in. Cause not found (no read of the bank was repeated to see the raw answer) |

## What Didn't Work

## Root Cause Analysis

## Action Items Summary
| Id | Action | Type | Status | Where it landed |
|----|--------|------|--------|-----------------|

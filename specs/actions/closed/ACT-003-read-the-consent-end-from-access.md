# ACT-003: Read the end of the consent from `access.valid_until`

**Status:** done
**Raised:** 2026-10-20
**Origin:** WP-006-bizum-payment-detection, task 11 (the rehearsal: connecting the real Revolut account ended in `?bank=fail`)
**Target:** `server/src/bank/enable-banking-connector.ts` and the fake Enable Banking server it is tested against

## Action

Make `EnableBankingConnector.complete` read the consent's end where the real API puts it, and make
the fake answer as the real API does, so the connector's contract test fails on the old reading.

## Root cause

`complete` read `valid_until` at the top of the `GET /sessions/{id}` answer. The real answer has no
such field: the end of the consent is `access.valid_until` (keys seen: `status`, `accounts`,
`accounts_data`, `aspsp`, `psu_type`, `psu_id_hash`, `access`, `created`, `authorized`, `closed`).
The date was invalid, the connector threw `BAD_SESSION`, and the callback answered `fail`. The
fake server had the same wrong top-level field, so the contract suite passed against it; only the
sandbox suite, which was not run, would have disagreed. The server also logs nothing about why a
callback failed, which made the cause invisible.

## What it cost

Two failed consents at the rehearsal, and a probe outside the app to find the cause. Without the
fix the bank could never be connected to the real Revolut account.

## Resolution

The connector now reads `access.valid_until`, and the fake answers `access: { valid_until }`
instead of a top-level field. With the fake corrected and the connector unchanged, the connector's
contract test and three fake-server tests failed with `BAD_SESSION`; with the connector fixed they
pass. Checked against the real API with the rehearsal's application: `POST /sessions` returns the
accounts as objects, each account's details answer, and `describeAccount` gives the currency and
type; only the validity was wrong.

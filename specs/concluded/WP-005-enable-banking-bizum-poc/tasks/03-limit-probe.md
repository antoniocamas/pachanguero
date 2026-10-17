# Task 03 — The limit probe

## Status note

**Cancelled by the author, 2026-10-17.** The real-account probe was never run: a burst of calls could get the real account's access blocked, and the organiser prefers not to risk it. The `limits` and `depth` commands stay in `poc/ebpoc.py` (checked against the sandbox only). UC-005-06-S1–S3 are answered in the guide as `not determined`. Its definition-of-done items below are not met and are not to be met.

## Type

**Feature.** Iteration 1. Elements absorbed: **F6**. Depends on task 02.

## Mandatory Reading

- `DESIGN_PLAN.md` §2 (HLD), F6 row of §2.7, and its risk "a rate limit locks us out for hours" in §2.9
- `study/enable-banking-docs.md` (Q-06)

## Description

Add `limits` to `poc/ebpoc.py` (**written and checked against the sandbox; the real run is pending**), which repeats the same fetch with timestamps until the first `ASPSP_RATE_LIMIT_EXCEEDED`, and a `depth` command that records the earliest booking date a `longest` fetch returns. Run this task **after** every other command has been tried, once.

## Guidelines

1. `limits --max N`: fetch the same small range (the last 7 days) repeatedly with no PSU headers, stopping at the first 429 or after `N` calls (default 10); append each attempt (timestamp, outcome, error code) to `poc/local/reports/limits.jsonl`.
2. `depth`: a `fetch --strategy longest` that prints, and appends to `reports/depth.jsonl`, the timestamp, the time since the authorisation and the earliest `booking_date` returned (UC-005-06-S3).
3. If `required_psu_headers` was non-empty (task 01), also record whether sending them removes the limit; if it is empty, say that PSU headers are not required.
4. Never loop automatically after a 429: print the time the organiser may try again (the FAQ says about 6 hours) and stop.

## Runbook for the real run

See `poc/README.md`, section "Running the limit probe". In short: authorise afresh, `depth` right away, `limits --max 150`, then `limits --max 1` at +1 h, +3 h, +6 h and the next morning, and `depth` again at +1 h and +1 day.

## Tests

- `selfcheck` (automated, synthetic): the limits-log summary (calls before the first 429, calls after it) is checked on a fake log.
- Sandbox: both commands were run against the Mock ASPSP (4 calls, one page): they log and summarise correctly.
- Manual (real account): nothing here is deterministic without the bank.

## Manual Test Plan

1. Run `depth` right after a fresh authorisation (soon after task 01), then again after 1 hour and after 1 day; the three earliest dates are noted in the README (UC-005-06-S3).
2. Run `limits --max 10`; the count of successful calls before the 429 (or "no limit hit in 10") is noted.
3. Six hours after a 429, run one `fetch`: the result is noted (UC-005-06-S2).

## Definition of Done

- [ ] `limits.jsonl` and `depth.jsonl` hold the runs of steps 1-3 (they stay local; the numbers go to the README).
- [ ] README records: fetches until 429, recovery time, earliest date at the three moments.
- [ ] **Graduation:** UC-005-06-S1–S3 `document` (guide, task 07).
- [ ] **Hard requirements:** none.
- [ ] **Documentation:** none outside the work package.
- [ ] **Tests:** none automated, see the manual plan (reason: depends on the bank's behaviour).
- [ ] **Regression:** none needed.
- [ ] **Code checks:** none apply to this folder.

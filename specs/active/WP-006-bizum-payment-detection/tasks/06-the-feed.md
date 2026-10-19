# Task 06 — The feed: read, remember once, keep or forget, settle automatically

## Type

**Feature.** Iteration 1. Elements absorbed: **F7**. Depends on: tasks 02, 03, 05.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD (2.1, 2.2 D-1, D-2, D-3, 2.5), and section 3 `#### F7`; the diagram `design/diagrams/poll-and-settle.puml`.
- `REQUIREMENTS.md`: UC-006-02 (S1–S10), UC-006-03-S5, S6, UC-006-04-S3.
- `AGENTS.md` (domain invariants on payments); `.agents/rules/coding-standard.md`; `docs/test-strategy.md`.
- The better-sqlite3 documentation for `transaction` (synchronous; no `await` inside).
- Discover, through `AGENTS.md`, the guidelines for each file touched.

## Description

Read the chosen account on a schedule and on request, and handle each entry exactly once, in one transaction:

- remember it in the ledger;
- keep or forget it by the rules;
- settle a judged Bizum through the existing payment writer, with `method = 'bizum'` and the payment's `bizum_id` (migration step 5);
- or record it as waiting, with its reason.

## Guidelines

1. **Core.** Write `bizum/feed.ts`: collect every page, recognise, handle oldest booking first, one `UnitOfWork` per entry, following the handling table. Then write `bizum/bank-poller.ts` with its constants and refusals, and `bizum/timer-scheduler.ts`. Then the four classes in `bizum/sqlite/` and the core's tables in `schema.sql`.
2. **Integration.** Write `BizumHandler` (the policy), `BizumSettlementService` (`apply`, `settle`, `wait`; including `amounts_differ`), `BizumHandlingRepository` and the `bizum_handling` table, and `BankFeedSource` (readiness, deep read, `markEnded`). Make the banner's `canRead` true from readiness.
3. **Step 5.** Freeze `schema.sql` as `fixtures/schema-v4.sql`. Add `payments.bizum_id` (last column, **no index**) to `schema.sql`, `PaymentBizumLinkMigration`, and `LATEST_SCHEMA_VERSION = 5`. `Settlement` and `append` take an optional `bizumId`.
4. **HTTP and start.** Add `POST /bank/read` (200 with counts, 409 with the refusal) and `lastRead` in the panel. `ServerApp` builds the poller; `index.ts` starts it after `listen`.
5. **Log.** One line per read: codes and counts only.

## Tests

Per F7's Test Methodology:

- **Integration (core, real SQLite, fakes):**
  - each row of the handling table;
  - oldest-first order;
  - a failure on page 2 remembers nothing;
  - two reads give all `known`;
  - an `afterKept` that throws rolls back that entry only.
- **Unit (poller, `ManualClock`, manual scheduler):**
  - start-up timing from a stored last read; the 6-hour interval;
  - each refusal with its `until`;
  - one read at a time;
  - the rate-limit hold;
  - `session_ended` reaches the provider.
- **Integration (`GameFlow`, real handler, rules and `RevolutDialect` over F15's fixture):**
  - the worked example;
  - UC-006-02-S1–S7, with S6 over 150 Bizums;
  - UC-006-03-S5, S6;
  - `amounts_differ`;
  - every payment has `bizum` and its link;
  - no share is in both tables.
- **Route:** `POST /bank/read` 200/409, and 403 for a player.
- **Migration:** `payment-bizum-link-migration.test.ts`, and `schema-migrator.test.ts` from `schema-v4.sql`.
- **Privacy:** the log of a run over the fixture holds no sender, subject, amount or reference.
- **Sandbox (opt-in):** add the read-only cases "ledger across two reads" and "start date" to `enable-banking.sandbox.test.ts`.
- **Hard requirements:** `server/src/repo/bizum-feed-requirements.test.ts` with `describe` blocks `UC-006-02-S1` to `S10`, `UC-006-03-S5`, `UC-006-03-S6`, `UC-006-04-S3`.

## Definition of Done

- [ ] Every test above passes.
- [ ] **Graduation:** UC-006-02-S1–S10, UC-006-03-S5, S6, UC-006-04-S3 → marked tests. UC-006-02-S8 (within a day) is marked through the poller's interval test.
- [ ] **Hard requirements:** the marked tests exist and pass.
- [ ] **Documentation:**
  - `docs/domain-model/ciclo-del-partido.md`: a payment can be made by the system from a Bizum, by the rules in order;
  - `docs/domain-model/glossary.md`: *Bizum*, *Bizums en espera*;
  - `AGENTS.md`: the poller started by `index.ts`, the services, and the invariants "a Bizum payment links its Bizum" and "a Bizum is processed once".
- [ ] **Tests:** `npm test`; `npm run test:e2e`, with the existing journeys unaffected now that the poller starts in the dev server.
- [ ] **Regression:** `npm test`.
- [ ] **Code checks:** `npm run lint`, `npm run format:check`; the coding standard.

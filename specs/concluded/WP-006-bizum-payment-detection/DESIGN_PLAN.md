# Design — WP-006-bizum-payment-detection

**Depth: deep** (agreed with the author, 2026-10-17). At stake: money recorded against players, a schema change on the live production database, a bank secret, and a public callback; a wrong shape is expensive to take back. **Budget:** the HLD about 8 pages; one Low Level Design subsection per element once the HLD is approved.

**Artifact types:** Code (backend classes, per `.agents/rules/coding-standard.md`), Frontend (components, hooks), Database (tables, columns, a migration step), Infrastructure (Helm chart values and templates), System documentation.

**Status of this document:** complete. The HLD was approved by the author on 2026-10-17 (with the test methodology as amended in 2.10; the sandbox questions M-1 to M-7 were answered by WP-005's `output/enable-banking-sandbox-testing.md` and `pachanguero-sandbox-testing.md`). Every element's Low Level Design (section 3) was approved by the author between 2026-10-19 and the closing of this phase, and section 4 is written in full. The HLD carries the amendments the Low Level Design made, each at its place and named in the element that made it.

## 1. Current Implementation

Confirmed for this approach only; the study did the discovery (`study/`).

- **Payments have one writer.** `PaymentService.pay` and `undo` (`server/src/repo/payment-service.ts`) move a share between `share_debts` and `payments`; `settle` is private and runs inside the `pay` transaction, after `lifecycle.require(gameId, 'pay')`. `verified — source`. The `payments` table has no method and no link to anything (`server/src/db/schema.sql`, the `payments` table). `verified — source`.
- **Played effects run inside the lifecycle transaction.** `GameLifecycleService.perform` writes the new state and then calls every `PlayedEffect.apply` in one transaction; `BillingEffect` is the one that creates debts (`server/src/repo/game-lifecycle-service.ts`, `billing-effect.ts`). `PaymentService` takes `GameLifecycleService` in its constructor, and the lifecycle service takes its effects in its constructor, assembled in `server/src/repo/index.ts`. An effect that needed `PaymentService` would make a cycle. `verified — source`.
- **Access control is by mount order.** `ApiRoutes` mounts the public router, then `Authenticate`, then the session, own (`/me`) and admin routers; the admin router is the module-level `api` in `routes/api.ts` (`server/src/routes/api-routes.ts`). `verified — source`. The session cookie is `HttpOnly; SameSite=Strict; Path=/api/auth` (`routes/cookie-jar.ts`). `verified — source`.
- **Settings come from the environment**, read by `AuthConfig.fromEnv` and `index.ts`; the deployment-settings test fails when a variable the server reads is neither in the `Dockerfile`, the chart nor its allow-list (`server/src/deployment-settings.test.ts`). `verified — source`. In production the chart passes only a Secret through `envFrom`; it carries `JWT_SECRET` alone, and the chart has no plain `env:` entries yet (`deploy/helm/pachanguero/templates/deployment.yaml`, `secret.yaml`). `verified — source`.
- **Production is deployed and known.** The application runs at `https://pachanguero.duckdns.org` on `erebor`, one replica, `Recreate`, one SQLite file on a PVC (`docs/deployment.md`; `deployment.yaml`). `verified — document`. This falsifies the Study's "deployment is undecided" and the requirements' placeholder address: the address is now a known value of `PACHANGUERO_PUBLIC_URL`, set in the chart (`author decision`, 2026-10-17: the address is a configuration parameter).
- **Name matching is equality, not abbreviation.** `NameMatcher` matches a whole name or alias, case- and accent-insensitively, and reports `ambiguous` rather than guess (`server/src/domain/name-matcher.ts`). A Bizum sender is `First S.S.` (guide §6), which `NameMatcher` never matches. The author ruled (2026-10-19) that a sender is identified only by a stored Bizum name or phone, never by a fit; a fit only suggests (UC-006-03-S1, UC-006-04-S5). `verified — source`, and `verified — invocation` for the players: 43 players in the local database, of which 27 have a one-word name, 14 two words, 2 more (read-only count, 2026-10-17).
- **JWT signing and HTTP exist.** `jose` 6.2.12 is already a dependency; a PKCS#8 RSA key (what `openssl req -newkey rsa:… -nodes` writes) imported with `importPKCS8` signs an RS256 token whose header is `{typ: JWT, alg: RS256, kid}` (run here, 2026-10-17). Node 26 ships `fetch` (`node --version`; `Dockerfile` `FROM node:26-slim`). `verified — invocation`.
- **The bank's behaviour** (a Bizum is a booked credit whose remittance has two strings, the last starting `Bizum payment from: `; the entry is identified by `identification_hash` plus `entry_reference`; closed sessions answer 401 with an error code) is the WP-005 guide's, observed on the real account (`specs/concluded/WP-005-enable-banking-bizum-poc/output/enable-banking-revolut-integration.md` §5–§7, §9). `verified — document`.

## 2. High Level Design

### 2.1 Architecture

**Three layers, one direction of dependency** (`author decision`, 2026-10-17: the Bizum handling is designed as if it were a reusable library, though it will not be extracted). The **Bizum core** knows what a Bizum is and how to read, remember and hand on Bizums, and nothing about Pachanguero or any bank. **Bank adapters** translate a bank's entries into the core's model. **Pachanguero integration** decides what a Bizum means for players, debts and payments. Arrows point only downward: integration and adapters import the core; the core imports nothing outside its own folder but Node built-ins and, for its SQLite stores, `better-sqlite3` (a test enforces it, element F2).

Units first, in the artifact types' own vocabulary; the components are groupings of them.

| Component | Units | Responsibility |
| --------- | ----- | -------------- |
| **Bizum core** (new, `server/src/bizum/`) | Model: `Bizum`, `BizumParty`, `BizumDirection`, `BizumKey`. Ports: `BizumDialect`, `BankConnector`, `BizumPolicy`, `BizumStore`, `Clock` (its own, the same shape as `domain/clock.ts`, so `SystemClock` and `ManualClock` fit it without an import). Engine: `BizumFeed`, `BankEntryLedger`, `BankPoller`. SQLite implementations of the stores and the core's own tables in `server/src/bizum/sqlite/` | The generic Bizum, the ports around it, and the read loop: read, recognise, judge once, keep or forget, remember. |
| **Bank adapters** (new, `server/src/bank/`) | `EnableBankingConnector` (implements `BankConnector`: JWT, authorisation, sessions, pages), `EnableBankingConfig`, `RevolutDialect` (implements `BizumDialect`), `BankCatalogue` | Everything that names Enable Banking or Revolut. A new bank on the same aggregator is one dialect class and one catalogue line; a new aggregator is one connector class. |
| **Pachanguero integration** (new, `server/src/domain/bizum-*.ts`, `server/src/repo/bizum-*.ts`) | Domain: `BizumRuleSet` (R1–R7, a pure judgment over a facts record; `BizumHandler` is the `BizumPolicy`), `KeywordList`, `SenderSuggestion`, `SenderIdentification`, `NearestDebtOrder`, `ConnectionClock`, `PublicUrl`. Repo: `BizumFactsReader`, `BizumHandler` (implements `BizumPolicy`: facts, rules, keep or discard), `BizumSettlementService`, `BizumResolutionService`, `SenderPairingService`, `BizumUndoService`, `BizumReevaluationEffect`, `BankConnectionService`, `BankSettingsService` and their repositories | The rules of the group: who a sender is, which shares a Bizum pays, the waiting list, the organiser's rulings, the panel's state. |
| **Payments** (existing, modified) | `PaymentService`, `ShareSettler` (new, extracted), `PaymentRepository`, `DebtRepository`, `OwnDataService`, `OwnDisclosure` | Settling shares; now with a method and an optional Bizum link; nearest-first debt reads. |
| **Database** (existing, modified) | `schema.sql`, `schema-migrator.ts`, `PaymentMethodMigration` (step 3, F1), the step adding `players.bizum_name` (step 4, F3), the step adding `payments.bizum_id` (step 5, F7), `LATEST_SCHEMA_VERSION` 5 | The core's tables, the integration's tables, the new `payments` columns. |
| **HTTP** (new and modified, `server/src/routes/`, `server-app.ts`, `index.ts`) | `BankCallbackRouter` (public), `BankAdminRouter`, `BizumAdminRouter`, `ApiRoutes`, `ServerApp`, `OwnRouter` | The callback, the admin routes, mounting, start-up of the poller. |
| **Web** (new and modified, `web/src/`) | `BankPanel`, `BankBanner`, `WaitingBizums`, `ReadNowButton`, the dialogs, `PaymentMethodField`, `PaymentDetail`, `useBank*`, `useWaitingBizums`, `AdminShell`, `Manage`, `Debts`, `PaymentCell`, `OwnPayments`, `api.ts` | The Banco panel and banner, the waiting list, the method on payments. |
| **Production configuration** (modified) | chart `values.yaml`, `templates/deployment.yaml`, `templates/secret.yaml`, `values.secrets.yaml.example`, `.env.example` | The settings and secrets of the bank, in production. |
| **Test support** (new) | `FakeBankDialect`, `FakeBankConnector` (service tests), `FakeEnableBankingServer` (a local HTTP server speaking the subset of the Enable Banking API we use, copying the Mock ASPSP's observed behaviour), `BankConnectorContract` (one set of contract tests run against the fake server and, opt-in, against the sandbox), the opt-in sandbox suite and its guard, anonymised entry fixtures | A second bank next to Revolut; the real connector and dialect exercised over HTTP without a network; the sandbox as the check that the fake has not drifted. |
| **Documentation** (modified) | `docs/test-strategy.md` (the decision tree), the guided sandbox checklist, the `pachanguero-release` skill step, `docs/commands.md`, `docs/users-and-roles.md`, `docs/domain-model/`, `AGENTS.md` | What section 4 lists. |

No component is a use-case cluster: each row lists the files it is made of. The logical groupings of the requirements (connection, feed, waiting list, correction, traceability) cut across these components; the elements below map them (2.6, 2.7).

Diagram: [layers](design/diagrams/components.puml).

### 2.2 Approach

The solution is a bank-neutral **Bizum core** (created) with a read loop inside the existing server process, two thin **bank adapters** (created) that translate Enable Banking and Revolut into the core's `Bizum`, and a **Pachanguero integration** (created) that implements the core's `BizumPolicy` with the ordered rules R1–R7 and settles through the existing payment path. **Payments**, **Database**, **HTTP**, **Web** and **Production configuration** are modified or extended to carry it. The core's `Bizum` is a generic record: direction (incoming or outgoing), sender and receiver, each a party with a displayed (possibly abbreviated) name and a phone number, the subject, the bank's own identification, the booking date, the amount in cents and its currency.

**Why this shape.** Banks differ in what they expose: Revolut shows only a sender text after `Bizum payment from: ` and a message, with every structured field null (guide §6, `verified — document`); another bank may give a receiver, a phone, a structured reference. A core model with the superset of fields, where each adapter fills what its bank has and leaves the rest empty, means the rules never learn a bank's quirks, and a new bank is a dialect class plus one catalogue line (success criterion: a second, fake bank next to Revolut). Two seams are separate because they vary independently: the **aggregator** (Enable Banking: authorisation, sessions, paging, rate limits, `BankConnector`) and the **bank's dialect** (what a Bizum looks like in its entries, `BizumDialect`). Extracting the core into a library later means moving `server/src/bizum/` and the adapters' folder; nothing in them imports Pachanguero. The rules are pure classes table-tested without SQLite or a bank. Settlement reuses the single payment writer, so every payment rule and the "a share is in one table or the other" invariant stay in one place.

**Traded away.** Latency: reads happen every 6 hours, so a Bizum is processed within a day (VISION §4) but not within minutes; the organiser can force a read with a "Leer ahora" button, in the Banco panel and at the top of "Bizums en espera" in the Deudas tab (`author decision`, 2026-10-17: to cut the wait and to test by hand). Both buttons are one component, `ReadNowButton`, with one hook, so they share the state (reading, gap, refusal). A forced read is the same read as the scheduled one, run on request through the poller, so it cannot overlap one in flight, obeys the same setup checks (UC-006-09-S2) and counts against the bank's allowance. Directness: one more layer than a Revolut-shaped solution, and some generic fields (receiver, party phone for incoming Bizums) stay empty for Revolut until another bank fills them. The poll interval and the 14-day banner threshold are constants, not settings (`inferred`; cheap to turn into settings later).

**Decisions that are hard to reverse, with alternatives**

*D-1. Where the poller runs.* **Chosen:** in the server process (`BankPoller`, one read in flight at a time, started by `index.ts` after `listen`).
- **Alternative: a Kubernetes CronJob or a second container calling the application.** Entails a second writer on the SQLite file and a second image entry point. Advantage: isolation from the web process. Disadvantages: tied to Kubernetes (the Study required a design that holds under Compose too); needs an authenticated internal route or direct DB access. Risk: two processes writing one SQLite file. Scope: more chart, more tests.

*D-2. How "processed once" is remembered.* **Chosen:** a core ledger table keyed by (account, bank reference) holding only that key and the outcome (`kept`, `discarded`, `not_bizum`, `dismissed`), separate from the kept Bizums. The key is an opaque bank identifier with no sender, subject or amount, so a discarded entry leaves no personal data (UC-006-02-S2) yet is never evaluated again (S3), also through a renewed session and after a dismissal (UC-006-05-S6).
- **Alternative: only the kept-Bizum table plus a moving `date_from`.** Advantage: one table. Disadvantages: a discarded or dismissed entry has no row, so every read re-evaluates it; the date window cannot protect a backdated entry or a renewal. Risk: a dismissed Bizum returns. Scope: fails S3 and UC-006-05-S6.

*D-3. Where the method and the link are stored.* **Chosen:** two columns on `payments`: `method` (`efectivo`, `bizum`, `otro`; `NOT NULL`, migration backfills `otro` for the 67 existing rows) and `bizum_id` (nullable, references the core's kept-Bizum row). The Bizum's own data stays in the core's table; what Pachanguero decided about it (waiting, settled, why, the unallocated rest, automatic or by ruling) is in the integration's own table, so the core's tables carry nothing about payments or players.
- **Alternative: a `payment_origin` table beside `payments`.** Advantage: `payments` untouched. Disadvantages: every reader joins it; a payment without a row has no meaning to define. Risk: a reader forgets the join and shows no method. Scope: more code, no gain.

*D-4. How a waiting Bizum is re-evaluated when a game becomes played.* **Chosen:** a `PlayedEffect` (`BizumReevaluationEffect`) listed after `BillingEffect`, so debts and settlements commit or roll back together. It needs `ShareSettler` (element R1) so the effect does not depend on `PaymentService`, which depends on the lifecycle.
- **Alternative: re-evaluate after the commit, from the route.** Advantage: no extraction. Disadvantages: a crash between the two leaves a played game with debts and a waiting Bizum that would settle; only the route would trigger it, not other callers of `perform`. Risk: silent inconsistency. Scope: smaller, weaker.

*D-5. The Bizum model and the seam to the bank.* **Chosen:** the generic `Bizum` above, a `BizumDialect` per bank and a `BankConnector` per aggregator; the policy sees only `Bizum`.
- **Alternative: a Revolut-shaped model (sender text and message), widened when a second bank arrives.** Advantages: fewer fields and one layer less now. Disadvantages: the rules, the tables and the screens would be written against Revolut's shape and need rework for the first other bank; the author asked for a model that survives a new bank. Risk: Revolut's "all null" fields silently become the model's assumptions. Scope: cheaper now, dearer later, and breaks the requirement that no code outside the bank support names Revolut.

### 2.3 Impacted Units (Component level)

Component grain; the file-and-method grain is filled in with each element's Low Level Design.

| Unit | Type | Location | Action | Notes |
| ---- | ---- | -------- | ------ | ----- |
| core model, ports, feed, ledger, poller, SQLite stores, and their tests | class | `server/src/bizum/`, `server/src/bizum/sqlite/` | Create | no import of players, debts, payments, seasons, express |
| `EnableBankingConnector`, `EnableBankingConfig`, `RevolutDialect`, `BankCatalogue` | class | `server/src/bank/` | Create | implement core ports |
| rules and helpers (7), handler and services (9) | class | `server/src/domain/bizum-*.ts`, `server/src/repo/bizum-*.ts`, `bank-*.ts` | Create | Pachanguero integration |
| `ShareSettler` | class | `server/src/repo/share-settler.ts` | Create | extracted from `PaymentService.settle` |
| `PaymentService`, `PaymentRepository`, `DebtRepository` | class | `server/src/repo/` | Modify | method on `pay`; link on `append`; nearest-first read |
| `OwnDataService`, `OwnDisclosure` | class | `server/src/repo/`, `server/src/domain/` | Modify | the player's payments carry the method and no Bizum field |
| `schema.sql`, `schema-migrator.ts`, migration steps 3 to 5 | schema | `server/src/db/` | Modify | the core's tables, the integration's tables, `payments` columns |
| composition root | module | `server/src/repo/index.ts` | Modify | wires core, adapters, integration and the effect |
| callback and admin routers; `ApiRoutes`, `ServerApp`, `server/src/index.ts` | class | `server/src/routes/`, `server/src/` | Create / Modify | |
| Banco panel, banner, waiting list, dialogs, method field, detail, hooks | component, hook | `web/src/components/`, `web/src/hooks/`, `web/src/pages/` | Create / Modify | Spanish copy |
| `values.yaml`, `deployment.yaml`, `secret.yaml`, `values.secrets.yaml.example`, `.env.example` | chart, env | `deploy/helm/pachanguero/`, repository root | Modify | |
| `FakeBankDialect`, `FakeBankConnector`, `FakeEnableBankingServer`, fixtures | class, test | `server/src/bizum/`, `server/src/bank/`, `e2e/` | Create | |
| the boundary test | test | `server/src/architecture-boundaries.test.ts` | Create | the core's imports; only `bank/` names Revolut |

### 2.4 Interface Specification

The sketches fix names and shapes; the Low Level Design fixes the details.

**The core's model and ports** (Interface Segregation: narrow roles; none mentions a player, a debt, a share or a bank):

```ts
type BizumDirection = 'incoming' | 'outgoing';
interface BizumParty { name: string | null; phone: string | null }   // as the bank shows them; name may be abbreviated
interface BizumKey { account: string; reference: string }            // the bank's own identification, stable across sessions
interface Bizum {
  key: BizumKey;
  direction: BizumDirection;
  bookedOn: string;                    // ISO date
  amountCents: number;  currency: string;
  sender: BizumParty;  receiver: BizumParty;   // a bank fills what it has; Revolut: sender.name for incoming only
  subject: string | null;
}
type Recognised = { kind: 'bizum'; bizum: Bizum } | { kind: 'ignore'; why: 'not_a_bizum' | 'pending' | 'unidentified'; key: BizumKey | null };

interface BizumDialect {               // what one bank's entries look like
  readonly id: string;  readonly displayName: string;  readonly bank: BankRef;
  recognise(raw: RawEntry, account: AccountRef): Recognised;
  describeAccount(raw: RawAccount): AccountChoice;   // currency, type, last 4 of the identifier
}
interface BankConnector {              // how entries and consent are obtained
  begin(redirectUrl: string, state: string, validUntil: Date, bank: BankRef): Promise<string>;
  complete(code: string): Promise<{ sessionId: string; validUntil: Date; accounts: RawAccount[] }>;
  close(sessionId: string): Promise<void>;
  entries(account: AccountRef, dateFrom: string, options: { deep: boolean }): AsyncIterable<RawEntry>;   // follows every part; throws BankError
}
type Review = { kind: 'discard' } | { kind: 'keep'; afterKept(stored: StoredBizum): void };
interface BizumPolicy { judge(bizum: Bizum): Review }   // the application's rules; the core only obeys
interface BizumStore { save(b: Bizum): StoredBizum; find(id: number): StoredBizum | null; remove(id: number): void }
```

`RawEntry`/`RawAccount` are opaque to the core; only the dialect (and the connector that produced them) read them. Dismissing a Bizum is the core removing its row but keeping the ledger entry.

**Settings (environment).** Names for the secrets follow the aggregator, not the bank, because the bank is a setting.

| Key | Secret? | Meaning |
| --- | ------- | ------- |
| `PACHANGUERO_PUBLIC_URL` | no | Address the browser reaches the app at; the redirect address is `<it>/api/bank/callback`. Production: `https://pachanguero.duckdns.org`. Absolute `https`, `http://localhost…` allowed. |
| `ENABLE_BANKING_APP_ID` | no (kept with the secrets for convenience) | The application id, also the JWT `kid`. |
| `ENABLE_BANKING_PRIVATE_KEY` | yes | PEM PKCS#8, multi-line (or one line with `\n`). |
| `ENABLE_BANKING_API_URL` | no | The aggregator's address; default `https://api.enablebanking.com`. Set only by the end-to-end tests to reach the fake server; not in the chart (F5). |

Absent keys are not a start-up error: the server starts, the Banco panel names the missing setting (UC-006-01-S2) and manual payments are unaffected (VISION §5). The deployment-settings test makes the chart carry all three.

**Database** (all in `schema.sql`; the three new columns on existing tables also as migration steps: 3 for `payments.method` (F1), 4 for `players.bizum_name` (F3), 5 for `payments.bizum_id` (F7); new tables need no step). Core tables carry no Pachanguero column; integration tables reference them, never the reverse.

| Owner | Table | Holds |
| ----- | ----- | ----- |
| core | `bizum_entries` | the ledger: account, bank reference, outcome — unique on the pair (D-2) |
| core | `bizums` | kept Bizums: key, direction, booked on, `amount_cents`, currency, sender name/phone, receiver name/phone, subject |
| core | `bizum_feed_state` (one row) | last read time and result, the account read |
| adapters | `bank_connection` (one row at most) | bank id, session id, `valid_until`, state (`connected`, `reconnect_needed` with reason code), accounts as last 4 / currency / type / hash |
| adapters | `bank_pending_authorization` | single-use `state`, `expires_at` (15 minutes) |
| integration | `bank_settings` (one row) | bank id, currency (default `EUR`), chosen account hash, start date |
| integration | `bank_keywords` | `list` (`include` / `exclude`), `word` (as typed; compared folded, F6) |
| integration | `bizum_handling` | per kept Bizum: `waiting` or `settled`, reason code, `unallocated_cents`, how settled (`automatic`, `organiser`) |
| existing, modified | `payments` | + `method`, + `bizum_id` |

Sender pairings are stored on the player: a name sender as `players.bizum_name` (nullable, not unique, so a name held by two players is detected as ambiguous), a phone sender as `player_contacts.phone` (`author decision`, 2026-10-19, UC-006-05-S1). Sign-up aliases and names only feed the suggestion (UC-006-04-S5).

**Routes.** Public: `GET /api/bank/callback?state&code|error`. Admin (behind `requireEffective('admin')`): `GET /api/bank` (panel state), `PUT /api/bank/settings`, `PUT /api/bank/words`, `POST /api/bank/connect` (returns the bank's URL), `POST /api/bank/disconnect`, `POST /api/bank/read` (force a read; answers when it ends, with the number of entries processed or the refusal), `GET /api/bank/banner`; `GET /api/bizums/waiting`, `GET /api/bizums/:id/open-shares?playerId=`, `POST /api/bizums/:id/pair`, `POST /api/bizums/:id/rule`, `POST /api/bizums/:id/dismiss`, `GET /api/bizums/pairings`, `PUT|DELETE /api/bizums/pairings/:playerId`, `GET /api/payments/:id/bizum`; the existing `POST /games/:id/payments` gains `method`, and `DELETE /games/:id/payments/:id` also undoes the other payments of the same Bizum. Nothing is added under `/me`; `OwnRouter` only gains `method` in the payment rows.

### 2.5 Unit Communication

Three flows, drawn: [connecting and the redirect](design/diagrams/connect.puml); [a scheduled read](design/diagrams/poll-and-settle.puml); and the two other triggers that re-run the rules without reading the bank: a game entering `played` (`BizumReevaluationEffect`, inside the lifecycle transaction) and a pairing or ruling by the organiser (`BizumResolutionService`). All three use the same `BizumRuleSet` and `BizumSettlementService`, so one Bizum cannot be judged two ways. The core calls the application only through `BizumPolicy` and the `afterKept` it returns; the application calls the core only through its stores and `BizumFeed`. Settlement is one transaction per Bizum: debts removed, payments written with the link, `bizum_handling` changed.

The redirect back from the bank is answered with a 302 to `<PUBLIC_URL>/?bank=connected` or `?bank=<reason code>` (a fixed code, never text), and the SPA turns the code into the Spanish message; no state, code or session id is ever put in a URL the app hands back. The browser arrives by a cross-site redirect; the SPA's first request is a same-origin `fetch`, which carries the `SameSite=Strict` refresh cookie, so an organiser already signed in is not asked to log in again. `inferred` from the cookie attributes (`cookie-jar.ts`); checked in the E2E and by hand (D2-3).

### 2.6 Refactors

| # | Refactor | Component | Units | Scenarios | Status | Verification | Mandatory Reading |
| - | -------- | --------- | ----- | --------- | ------ | ------------ | ----------------- |
| R1 | Extract `ShareSettler` from `PaymentService.settle` so settlement can be reused without a dependency cycle | Payments | `ShareSettler`, `PaymentService`, `index.ts` | UC-006-08-S2, UC-006-03-S5 | terminal | the existing `payment-service.test.ts` passes unchanged | `AGENTS.md`, `.agents/rules/coding-standard.md`, this document §1 |

### 2.7 New Functionality

| # | Feature | Component | Units | Scenarios | Status | Verification | Mandatory Reading |
| - | ------- | --------- | ----- | --------- | ------ | ------------ | ----------------- |
| F1 | Every payment records its method; manual payments choose it; the 67 old ones read "Otro" | Database, Payments, HTTP, Web | `payments` columns, step 3, `PaymentService`, `PaymentRepository`, `PaymentMethodField`, `PaymentCell` | UC-006-08-S1, S3, S4, S5; UC-006-07-S1, S5 | terminal | route + migration tests | `docs/domain-model/ciclo-del-partido.md` |
| F2 | The Bizum core's model and ports, and the boundary that keeps it free of Pachanguero | Bizum core, Test support | `Bizum`, `BizumParty`, `BizumKey`, the ports, a boundary test over `server/src/bizum/` imports | UC-006-02-S1 (the record), constraint "no code outside the bank support names Revolut" | terminal | unit tests; the boundary test fails if the core imports anything outside `server/src/bizum/` (Node built-ins and, in `sqlite/`, `better-sqlite3` excepted) or code outside `server/src/bank/` names Revolut | this document §2.4, `.agents/rules/coding-standard.md` |
| F3 | The ordered rules R1–R7 as the policy; keyword lists, sender identification and suggestion, nearest-first, season-restricted debts | Pachanguero integration, Database | `BizumRuleSet`, `KeywordList`, `SenderSuggestion`, `SenderIdentification`, `players.bizum_name` (step 4), `NearestDebtOrder`, `DebtRepository` read | UC-006-03-S1–S4, S7, S8; UC-006-04-S5 (the suggestion); UC-006-11-S1, S2 | terminal | unit table tests over the rows of the scenarios | `docs/domain-model/README.md`, F2 |
| F4 | The Revolut dialect and the bank catalogue: recognise a Bizum, read the sender and message, describe an account | Bank adapters | `RevolutDialect`, `BankCatalogue` | UC-006-02-S1, S2 (recognition), S4, S5; UC-006-01-S15 | terminal | unit tests over anonymised entries shaped as the guide §6 | guide §6, F2 |
| F5 | Connect, complete, renew, disconnect and expire the bank access; secrets never leave | Bank adapters, Pachanguero integration, HTTP, Production configuration | `EnableBankingConnector`, `EnableBankingConfig`, `BankConnectionService`, repositories, `BankCallbackRouter`, `BankAdminRouter` | UC-006-01-S1–S5, S8–S13 | terminal | route tests with `FakeBankConnector`; one manual live check | guide §2–§4, §7, §9, F2 |
| F6 | The reading settings: account choice, currency, start date, keyword lists, bank choice | Pachanguero integration, HTTP | `BankSettingsService`, `BankSettingsRepository`, `KeywordRepository`, `BankAdminRouter` | UC-006-01-S6, S7, S14, S15; UC-006-09-S1, S2 | terminal | route tests | F5's LLD |
| F7 | The feed: scheduled and forced read, once-only ledger, keep or forget, automatic settlement | Bizum core, Pachanguero integration, HTTP | `BizumFeed`, `BankEntryLedger`, `BankPoller` (`requestRead`), SQLite stores, `BizumHandler`, `BizumSettlementService` | UC-006-02-S1–S8; **UC-006-02-S9 (proposed: force a read, not yet in the requirements)**; UC-006-03-S5, S6; UC-006-04-S3 | terminal | integration tests over `FakeBankConnector`; fixtures | F2, F3, R1 |
| F8 | The waiting list with reasons; pairing, ruling and dismissing | Pachanguero integration, HTTP | `BizumResolutionService`, `SenderPairingService`, `BizumAdminRouter` | UC-006-04-S1, S2, S4; UC-006-05-S1–S6 | terminal | route tests; admin-only refusals | F3, F7 |
| F9 | A waiting Bizum settles when its game is played | Pachanguero integration | `BizumReevaluationEffect`, `index.ts` | UC-006-10-S1–S4 | terminal | integration test through `GameLifecycleService.perform` | R1, F7 |
| F10 | Undo an automatic payment as a whole and return the Bizum to the list | Pachanguero integration, Payments, HTTP | `BizumUndoService`, the undo route | UC-006-06-S1–S3 | terminal | route tests | R1, F7 |
| F11 | Traceability: the admin sees method and Bizum detail; the player sees the method only | Payments, HTTP, Web | `OwnDisclosure`, `OwnDataService`, `OwnRouter`, detail route, `PaymentDetail`, `OwnPayments` | UC-006-07-S2, S3, S4 | terminal | `own-disclosure.test.ts` and `own-router.test.ts` extended | `docs/users-and-roles.md` |
| F12 | The Banco panel (with "Leer ahora") and the expiry banner | Web | `BankPanel`, `BankBanner`, `useBank*`, `Manage`, `AdminShell` | UC-006-01-S1–S4, S6–S10, S13–S15 (screens); UC-006-09; UC-006-02-S9 (proposed) | terminal | E2E against `FakeEnableBankingServer`; manual look | `requirements/examples/screens.html`, F5, F6 |
| F13 | "Bizums en espera" and its dialogs in Deudas, with "Leer ahora" | Web | `WaitingBizums`, `ReadNowButton` (shared with F12), `useReadNow`, the three dialogs, `useWaitingBizums`, `Debts` | UC-006-04, UC-006-05, UC-006-06 (screens); UC-006-02-S9 (proposed) | terminal | E2E; manual look | `requirements/examples/screens.html`, F8, F10 |
| F14 | Production settings and secrets of the bank | Production configuration | `values.yaml`, `deployment.yaml`, `secret.yaml`, `values.secrets.yaml.example`, `.env.example` | UC-006-01-S2 (setup) | terminal | `helm lint`, `helm template`, the deployment-settings test | `docs/deployment.md#deployment-impact-of-a-change` |
| F15 | A second, fake bank; a fake Enable Banking server; the shared connector contract tests; the opt-in sandbox suite and its guard | Test support | `FakeBankDialect`, `FakeBankConnector`, `FakeEnableBankingServer`, `BankConnectorContract`, `test:sandbox` suite, fixtures | success criteria rows 7 and 8 of the requirements | terminal | the contract tests pass against the fake server on every commit; the sandbox suite passes on request | `docs/test-strategy.md` (as amended by F16), `specs/concluded/WP-005-enable-banking-bizum-poc/output/pachanguero-sandbox-testing.md`, F2 |
| F16 | The test strategy as a decision tree, with the Bizum tiers and the guided checklist | Documentation | `docs/test-strategy.md`, the checklist, the `pachanguero-release` step | the requirements' success criteria (how each is tested) | terminal | read against 4: every layer has a trigger, a time budget, a gate and a limit | `docs/test-strategy.md`, this document 2.10 and 4 |
| F17 | A one-time rehearsal on a copy of production with the real account: payments since 2026-09-01 put back as debts, the real Bizums read, the result compared with the hand-recorded payments | Test support | the rehearsal tool and procedure (in the work package) | success criterion "the real-data rehearsal" of the requirements | terminal | manual, once, last; no disagreed payment | F1–F16, `docs/deployment.md` (fetching a backup) |

All 18 elements are `terminal`; no deferral is carried. Every scenario of the requirements has an element behind it (UC-006-01-S11 and S12 are carried by F5: the poll error codes and the no-secrets constraint).

### 2.8 Documentation Impact

From the Study's doc map, re-read against the code of today:

- `docs/domain-model/glossary.md`, `ciclo-del-partido.md` (Spanish): payment method, a payment created by the system, the Bizum, the waiting list.
- `docs/users-and-roles.md`: bank data and sender names are admin only; the player's payments show the method; the player's phone now also identifies them as a Bizum sender.
- `docs/commands.md`: four new settings (three for production, one for the end-to-end tests) in the `Configuration` table; the `test:sandbox` script.
- `docs/backup_and_restore.md`: backups now hold bank data (session id, senders, subjects).
- `docs/deployment.md`: the deployment-impact table now has a first plain `env:` entry and new secrets.
- `docs/test-strategy.md`: rewritten as a decision tree for when to use each layer (4, element F16).
- `AGENTS.md`: the new components, the payment method invariant, and `PACHANGUERO_PUBLIC_URL`.
- `.env.example`: the new keys and the sandbox suite's.
- `.agents/rules/coding-standard.md`: one line on the Bizum core's boundary.
- `README.md`: one item in "What it does".
- **Not this work package's:** the stale Raspberry Pi statements the Study listed (`README.md`, `docs/commands.md`, `docs/backup_and_restore.md`, `deploy/pachanguero.service`, the comment in `server-app.ts`) predate it; they remain true or false independently of Bizums and are left as they are.

### 2.9 Risks

| Risk | Handling |
| ---- | -------- |
| A wrong player is paid | A sender is identified only by a Bizum name or phone the organiser stored, held by exactly one player (F3); R3 also needs a whole number of shares that open debts cover; every automatic payment is undoable (F10) and traceable (F11). Residual, accepted by the author: a non-player who appears on Bizum exactly like a paired player. Measured once on real data by F17's rehearsal against the payments recorded by hand. |
| A suggestion is taken for an identification | A suggestion (F3, `SenderSuggestion`) is shown, never acted on; it can name two players ("Alberto" and "Alberto H." both exist in the real data). |
| A migration on the live database | Steps 3 to 5 run after the automatic `…-before-migration.db` backup (`SchemaMigrator`); they only add a column each (step 3 backfills `otro`; 4 and 5 are nullable); tested from a frozen copy of today's schema with payments in it. No index is put on a column a step adds: `schema.sql` runs before the steps, and a new file never runs them (F1, F7). |
| The forced read exhausts the bank's allowance | One read at a time; a minimum gap of 5 minutes between the end of one read and the start of the next, scheduled or forced (refusal: "Espera unos minutos"); after a rate-limit answer the button is disabled until the stated retry time. The gap is a constant. |
| Rate limit unknown (Q-11) | Default every 6 hours (4 a day, the documented background allowance); on `ASPSP_RATE_LIMIT_EXCEEDED` the poller waits 6 hours; the failure is shown in the panel. Tuned after the probe; the interval is a constant. |
| A pending Bizum shows differently than assumed | Only `BOOK` entries are processed; anything else is skipped and read again next time, so the worst case is delay. |
| Secrets leak through logs or responses | One class (`EnableBankingConnector`) holds the key; errors it throws carry the bank's error code, never the request; no route returns session, state or code; a test greps responses and the log of a fake run. |
| The cross-site redirect loses the sign-in | Checked in the E2E and by hand; if it fails, the panel shows the login first and the result remains in the URL code (UC-006-01-S4). |
| The generic model hides a bank-specific need (a second bank has a field or meaning the model lacks) | The model is the superset the author listed (direction, sender, receiver, name, phone, subject, id, date, amount); `FakeBankDialect` (F15) fills a different subset than Revolut, so the rules are proved against two shapes; the model grows by adding an optional field, never by branching on a bank. |
| The core quietly starts importing Pachanguero code | A boundary test (F2) fails the suite on any import from the core to anything outside `server/src/bizum/` but Node built-ins (and `better-sqlite3` in its SQLite stores); the same test fails if code outside `server/src/bank/` names Revolut. |
| Consent ends unnoticed | The banner at 14 days (UC-006-01-S10) and `reconnect_needed` on `CLOSED/EXPIRED/REVOKED_SESSION`. |

### 2.10 Test Methodology

Layers follow `docs/test-strategy.md`, which element F16 turns into a decision tree (section 4). Five tiers for this work package; the first four exist for every feature, the last three are new with the bank.

| Tier | What it runs | Where | When | Time (measured or proposed) |
| ---- | ------------ | ----- | ---- | --------------------------- |
| 1. Unit | `BizumRuleSet` and helpers, `RevolutDialect` on anonymised entries, the core model | `server/src/domain`, `server/src/bizum`, `server/src/bank` tests | every commit (pre-commit runs the server suite) | each test under 100 ms (proposed); the whole `npm test` took 29 s wall for both workspaces on 2026-10-17 (measured) |
| 2. Integration | services and routes on a real SQLite file with `FakeBankConnector`/`FakeBankDialect`; the contract tests of the real `EnableBankingConnector` against `FakeEnableBankingServer` on a loopback port | `server/src/**/*.test.ts` | every commit | each under 1 s (proposed) |
| 3. E2E | the Banco panel journey (connect through the real callback with a `localhost` redirect, read now, the banner) and the waiting list journey, against `FakeEnableBankingServer` | `e2e/tests/` | before merging a feature, never in the hook | the suite took 4 min 15 s for 40 tests (6 to 9 s each) on 2026-10-17 (measured); this work package adds at most 4 journeys, about 40 s (proposed) |
| 4. Sandbox suite (`npm run test:sandbox`) | the same `BankConnectorContract` through the real connector and dialect against the Mock ASPSP from a **standing session**: first read, paging above 100 entries, the ledger across two reads, the start date, failing reads | `server/src/bank/sandbox/` | on request and before a release that touches the feed; **optional regression**: never in `npm test` or the hook; skips with a message when the sandbox key or session is not configured | about 2 minutes (proposed; limits unknown) |
| 5. Guided check | a fresh consent through our callback on `localhost`, an entry added after a read ("Leer ahora"), a pending entry becoming booked | a checklist in `docs/test-strategy.md`, a step in the `pachanguero-release` skill | before a release that touches the feed | minutes, a person signed in to the Control Panel |
| 6. Live check | what only Revolut shows: wording, limits, expiry, approval | the real account, read-only | rarely | manual |

**Why the sandbox is optional, not regression** (`author decision`, 2026-10-17): every new consent and every change of the Mock data needs a person signed in to the Control Panel (CAPTCHA, e-mail and SMS codes) (`verified — document`, WP-005 `enable-banking-sandbox-testing.md` §3, §4). A standing session lasts up to 179 days and is read with the application key alone, so a read-only suite can run unattended while it lasts (§1). The fake server is not a substitute: it tests our logic against our idea of the API, the sandbox tests the idea. Only the real API can say whether our RS256 token, request bodies and paging are accepted, and the sandbox suite is the only automated check that the fake has not drifted.

**Constraints of the sandbox suite** (from WP-005 §2, §9 and the author's choice): it only reads, because `DELETE /sessions` ends the standing session and a person must authorise again; it never edits the fixture (uploaded once by hand; the upload is behind a CAPTCHA that must not be bypassed); it lists the account first and refuses to run if the entry count differs from the expected one; it refuses to start unless its configuration names the sandbox application and the Mock ASPSP, because selecting the sandbox by an unset variable once sent real calls to the production account; its key and session live in the organiser's local `.env`, never in the repository; the Mock bank maps to the Revolut dialect only in the test composition, never in the production catalogue (`inferred`: honest for the recognition fields, which match the real payload in presence, type and wording); the sandbox and production share one API host, so the sandbox suite builds the connector with the base URL in-process; the one setting for the base URL, `ENABLE_BANKING_API_URL`, exists for the end-to-end tests and is not in the chart (F5).

**Keeping the fake honest.** `FakeEnableBankingServer` copies what WP-005 observed of the Mock: pages of 100 with a `continuation_key`, newest first, `date_from` inclusive, exact matching of redirect URLs, the error codes of WP-005 §7 (`EXPIRED_SESSION`, `CLOSED_SESSION`, `ACCOUNT_DOES_NOT_EXIST`, `WRONG_REQUEST_PARAMETERS`, `DATE_FROM_IN_FUTURE`, `WRONG_DATE_INTERVAL`, `REDIRECT_URI_NOT_ALLOWED`). `BankConnectorContract` is one set of assertions about the connector's behaviour, run against the fake on every commit and against the sandbox on request; a disagreement means the fake drifted. What only the fakes can show, because the Mock cannot produce it: `REVOKED_SESSION`, a rate-limit answer, session expiry driven by an injected clock.

**Scenario by tier** (the requirements' scenarios; the sandbox column is what WP-005 showed producible):

| Scenario | Tier |
| -------- | ---- |
| The rules R1–R7, sender fit, nearest-first, seasons (UC-006-03, -11) | 1 |
| Recognising a Bizum and reading the sender (UC-006-02-S1, S2, S4, S5) | 1; 4 on the Mock's entries |
| Once-only reading, also after a renewal (S3) | 2 on the fake; 4 across two reads |
| A read of many Bizums (S6) | 2; 4 with a fixture over 100 entries |
| A read that fails (S7) | 2; 4 for the codes the Mock produces; the rate limit on 2 only |
| The consent, the callback route, "Conectado hasta …" (UC-006-01-S3–S5, S8) | 3 on the fake; 5 on the Mock |
| Renewal, disconnect, session ended early (S9, S11, S13) | 2 and 3; `REVOKED_SESSION` on 2 only |
| The expiry banner (S10) | 1 (clock) and 3; the short real consent is not run |
| A new Bizum between two reads, "Leer ahora" (UC-006-02-S9) | 2 and 3; 5 on the Mock |
| A pending Bizum later booked | 1 and 2; 5 on the Mock |
| Waiting list, pairing, ruling, dismissal, undo, re-evaluation (UC-006-04 to -06, -10) | 2; the journeys on 3 |
| Payment method, traceability, the player sees the method only (UC-006-07, -08) | 2; one journey on 3 |
| What Revolut really sends, limits and expiry | 6 |

The sandbox application's limits (calls before a rate-limit answer, sessions, retention, use from a CI machine) are still a placeholder in WP-005 (`pachanguero-sandbox-testing.md` §5). They do not block this design: tier 4 runs on request from the organiser's machine, and no schedule is set (`inferred`; revisit when WP-005 records them).

**Testability assessment**

| # | Element | Fully automatable? | Manual verification needed |
| - | ------- | ------------------ | -------------------------- |
| R1 | Extract `ShareSettler` | Yes | — |
| F1 | Payment method | Yes | — |
| F2 | Bizum core model and ports | Yes | — |
| F3 | The rules | Yes | — |
| F4 | Revolut dialect and catalogue | Yes (against anonymised entries) | one real read compared with the guide's rule: the same Bizums are recognised |
| F5 | Bank connection | No | one real connection to Revolut: approve in the app, see "Conectado hasta …", renew, disconnect |
| F6 | Reading settings | Yes | — |
| F7 | The feed | No | after connecting, press "Leer ahora": the Bizums since the start date appear in the list or as payments; press it again at once: nothing changes and the panel shows the new time of the last read |
| F8 | Waiting list and resolution | Yes | — |
| F9 | Re-evaluation | Yes | — |
| F10 | Undo | Yes | — |
| F11 | Traceability | Yes | — |
| F12 | Banco panel | No | the layout against `screens.html` on a phone width; the callback return while signed in and while signed out |
| F13 | Waiting list UI | No | the same, for Deudas; "Leer ahora" there shows the same result and refusal as in the panel, and a Bizum read appears in the list without leaving the tab. Not shown when the setup is incomplete or the bank is not connected (the panel says why) |
| F14 | Production settings | No | after the release: `helm template` shows the three keys; the panel in production names no missing setting |
| F15 | Test support | Yes (the sandbox suite on request needs the standing session) | the guided checklist of F16 |
| F16 | Test strategy document | Not relevant (a document) | read through against section 4 |
| F17 | Real-data rehearsal | No | the whole procedure of F17; passes with no disagreed payment |

The Manual Test Plan guidelines for each `No` are written in that element's Low Level Design subsection.

### 2.11 Patterns and Conventions

- **Backend (coding standard):** classes only, no free functions or stateless statics; ports (`BizumDialect`, `BankConnector`, `BizumPolicy`, `BizumStore`, `PlayedEffect`) with narrow roles; Adapter for each bank and aggregator (anti-corruption layer: raw entries never leave `server/src/bank/`); Strategy for judging (`BizumRuleSet` is an ordered list of rule objects, so a rule is a class, not a branch, and the order is data); dependency direction enforced by a test; composition root `repo/index.ts`; routers as classes with `.router()` like `AuthRouter`; the clock injected (`Clock`) so the poller and the expiry are driven by tests.
- **Transactions:** one `conn.transaction` per Bizum settled, as `PaymentService.pay` does today.
- **Frontend** (`.agents/rules/frontend-coding-standard.md`): function components, one hook per remote resource, pure display logic in `lib/` with vitest tests; Spanish copy.
- **Schema:** new tables in `schema.sql` only; a new column on an existing table in `schema.sql` and as its own `MigrationStep` (one per element), with the same definition; money in integer cents; dates as ISO text.
- **Chart:** secrets in the Secret, plain settings as `env:` entries, both guarded by the deployment-settings test.

### Completeness record

Run on the whole document once every element's Low Level Design was written (2026-10-19).

| Detector | Result |
| -------- | ------ |
| D1 grounding | Every claim of §1 and of each element's Current Implementation carries a tag and a citation (file and line, a command run on 2026-10-19, or a WP-005 document and section). Four claims stay below `verified`, each carried on its element and listed under "Still owed" below. Downgrades made while drafting: none left; the LSP returned only the declaration on this unindexed project, so `grep` is the cited evidence for consumers (R1, F1). |
| D2 assumptions | The design's own: (1) 6-hour reads stay within Revolut's limit — `inferred` (guide §8), handled by the poller's rate-limit wait (F7). (2) A pending Bizum never arrives as `BOOK` without its reference — handled (`pending`, `unidentified`, F4). (3) The strict sign-in cookie survives the bank's cross-site redirect — `inferred`, checked in F12's journey and by hand. (4) 15 minutes are enough to approve in the Revolut app — `assumed`, a constant (F5). (5) Where Revolut exposes the account's IBAN — `assumed`, with a fallback (F4). (6) A booked Bizum with no reference does not occur — `inferred` (F2, F4). The Study's carried question Q-11 (the rate limit) is (1). |
| D3 reachability | Every element names its units at file and method grain, its routes and tables, and the tests that prove it; no part reads "figure out X". |
| D4 pre-mortem | R1: a new caller forgets the capability check → every caller is named with its check. F1: a new file lacks a step's index → found in F7, rule corrected. F2/F4: a bank with other fields → `FakeBankDialect`. F3: two players given one Bizum name → ambiguous, warned. F5: a replayed callback → marked used before the exchange. F6: a removed initial word comes back → seeded once by code. F7: a crash mid-read → one transaction per entry, collect before handling. F8: a ruling beyond the money → refused. F9: an exclude word added later → review mode never discards. F10: a game reopened since → the whole undo is refused. F11: a new field leaks to the player → the disclosure is a whitelist, tested with extra fields. F12/F13: an unknown code from the server → shown as a generic message. F14: a multi-line key mangled by YAML → `b64enc`, run. F15: the fake drifts → one contract run against both. F16: figures go stale → each with its command and date. |

Deferrals: **0**; reason distribution: —.

### Owed to the author

*Decisions:* none (no R2 deferral).

*Answers:* none; the Study's Q-11 (the real rate limit) is carried as a risk with its handling, not needed for any decision.

*Confirmations* (the author has confirmed each, in the HLD approval of 2026-10-17 or in the approval of the element that raised it, 2026-10-19):

1. ~~The meaning of "a name fits a player"~~ — withdrawn 2026-10-19: no fit identifies a sender; only a stored Bizum name or phone does, and a prefix-of-initials rule only suggests (UC-006-03-S1, UC-006-04-S5; F3).
2. A read every 6 hours, a 15-minute authorisation lifetime, and the 14-day banner threshold as constants, not settings.
3. The names `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` and `PACHANGUERO_PUBLIC_URL`.
4. The panel under Manage, shown as "Ajustes › Banco".
5. Core in `server/src/bizum/`, adapters in `server/src/bank/`, a vitest boundary test instead of a lint rule.
6. The generic `Bizum` fields (2.4).
7. The forced read, "Leer ahora", with a 5-minute gap; UC-006-02-S9 and S10 were added to the requirements.
8. A booked Bizum with no bank reference is not kept (`unidentified`, F2, F4).
9. Keywords match whole words or phrases, case and accents ignored (F3).
10. Phones compared after normalising, with `+34` for nine digits (F3).
11. `ENABLE_BANKING_API_URL`, not in the chart (F5, F15).
12. State and code pass through the browser by protocol; no private data travels uncontrolled (F5).
13. A ruling does not pair the sender (F8).
14. A ruling never pays more than the Bizum (F8).
15. An undone Bizum is an ordinary waiting Bizum with the reason "Se deshizo su pago" (F10).

*Still owed* (claims carried below `verified`, settled only by running the real thing): whether the production Enable Banking application accepts a `localhost` redirect for the rehearsal (F17, step 4; stops the rehearsal if not); where Revolut exposes the account's IBAN (F4, manual check); that 15 minutes suffice to approve (F5, manual connection); that the sign-in survives the bank's redirect on a phone (F12, manual); Revolut's real limit (F7, observed in the panel after release).

## 3. Low Level Design

One subsection per element of 2.6 and 2.7. Each is read together with the HLD; the seven sub-sections are always present.

#### R1 — Extract `ShareSettler` from `PaymentService.settle`

**Current Implementation.**
- `PaymentService` (`server/src/repo/payment-service.ts:26-128`) does three jobs: it checks a request (`pay`, lines 41-58: `lifecycle.require(gameId, 'pay')`, no empty request, an adjusted amount only for one share and positive), it opens the transaction (`conn.transaction`, lines 55-57 and 67-81), and it moves one share between the tables (`settle`, private, lines 84-121; the body of `undo`, lines 68-80). `verified — source`.
- What `settle` does, in order: find the debt for (game, member) or throw `"<name> ya está pagado"` / `"<name> no estaba en la convocatoria"`; refuse a payer who is neither the holder nor the beneficiary (`"Solo puede pagar quien lo debe o a quien corresponde"`); delete the debt; append the payment (amount = the request's adjusted amount or the debt's); for a named beneficiary set `paid_cents`/`paid_on` on the participation. `verified — source` (lines 90-120).
- What `undo` does after its checks: delete the payment, insert a debt for the same member and holder at `seasons.shareCents(season)`, and for a named beneficiary reset `paid_cents = 0`, `paid_on = null`. The season comes from `games.get(gameId)!.season_id`, read before the transaction. `verified — source` (lines 66-80).
- Constructed in two places, both with the same eight arguments: `server/src/repo/index.ts:121-130` and `server/src/repo/game-flow-test-support.ts:70-79`. Called only through `pay` and `undo`: `routes/api.ts:393,410` and the tests (`payment-service.test.ts`, `own-router.test.ts`, `team-paste-service.test.ts`, `played-outcome-fixed.test.ts`, `player-report-service.test.ts`, `debt-query-cost.test.ts`). `PayRequest` is used only inside `payment-service.ts`. `verified — invocation` (`grep -rn "new PaymentService\|PayRequest\|paymentService\." server/src`, 2026-10-19; LSP `findReferences` returned only the declaration, the project not being indexed, so grep is the evidence).
- `GameLifecycleService.perform` runs every played effect inside its own `conn.transaction` (`game-lifecycle-service.ts:38-44`), where F9 will call the settler. `verified — source`. Because the settler opens no transaction of its own, how better-sqlite3 nests transactions does not matter to it.

**Approach.** Move the per-share work (the body of `settle` and the body of `undo`'s transaction) into a new class, `ShareSettler`, with two public methods; `PaymentService` keeps the request checks, the capability check and the transaction, and calls the settler. No behaviour, message or order of writes changes.

- `ShareSettler` **opens no transaction and checks no capability.** Its contract, stated in its doc comment: *the caller holds the transaction and has established that the game takes payments.* Two reasons: F9 calls it inside the lifecycle transaction, where the game is entering `played` and `GameLifecycleService` is not available (the cycle of D-4); F10 undoes several payments of one Bizum in one transaction. Every caller in this work package is named, and each owns the check: `PaymentService` (`require('pay')`), `BizumSettlementService` (F7, `require('pay')`), `BizumReevaluationEffect` (F9, it runs only as the game enters `played`), `BizumUndoService` (F10, `require('pay')`).
- The payer rule ("only the holder or the beneficiary pays") and the "already paid / not in the convocatoria" messages stay in `settle`, so every writer of a payment obeys them, automatic or manual (UC-006-03-S5: an automatic payment is an ordinary one).
- The settler's input is a `Settlement` (payer, optional amount, date), not `PayRequest`: the request's shares list belongs to the request, not to one share. F1 adds `method` to `Settlement`, F7 adds `bizumId`; R1 adds neither.
- `PaymentService` no longer needs `debts`, `participations`, `players`, `seasons` or `games`; the settler takes them.

```ts
// server/src/repo/share-settler.ts
export interface Settlement {
  payerPlayerId: number;
  /** An adjusted amount; absent, the debt's own amount is paid. */
  amountCents?: number;
  paidOn: string;
}

/**
 * Moves one share between the debts and the payments, keeping the beneficiary's
 * paid game in step. The caller holds the transaction and has established that the
 * game takes payments; this class checks neither.
 */
export class ShareSettler {
  constructor(
    private readonly games: GameRepository,
    private readonly debts: DebtRepository,
    private readonly payments: PaymentRepository,
    private readonly participations: ParticipationRepository,
    private readonly players: PlayerRepository,
    private readonly seasons: SeasonRepository
  ) {}
  settle(gameId: number, member: MemberKey, settlement: Settlement): PaymentRow; // body of today's settle
  unsettle(payment: PaymentRow): void;                                            // body of today's undo transaction
}

// server/src/repo/payment-service.ts — after
export class PaymentService {
  constructor(
    private readonly lifecycle: GameLifecycleService,
    private readonly payments: PaymentRepository,
    private readonly settler: ShareSettler,
    private readonly conn: Database.Database
  ) {}
  pay(gameId, request, now = new Date()): PaymentRow[]   // checks unchanged; transaction(() => shares.map(m => settler.settle(gameId, m, {payerPlayerId, amountCents, paidOn})))
  undo(gameId, paymentId): void                          // require, find, game check unchanged; transaction(() => settler.unsettle(payment))
}
```

`unsettle` reads the season inside the caller's transaction (`games.get(payment.game_id)!.season_id`) instead of before it: the same row, read in the same request, so no observable difference. `inferred` from the code above.

**Impacted Units.**

| Unit | Method | Action |
| ---- | ------ | ------ |
| `server/src/repo/share-settler.ts` `ShareSettler`, `Settlement` | `settle`, `unsettle`, private `nameOf` | Create (moved code) |
| `server/src/repo/payment-service.ts` `PaymentService` | constructor (4 arguments), `pay`, `undo`; `settle` and `nameOf` removed | Modify |
| `server/src/repo/index.ts` | new export `shareSettler`; `paymentService` built from it | Modify |
| `server/src/repo/game-flow-test-support.ts` `GameFlow` | new `readonly settler`; `paymentService` built from it | Modify |

**Test Methodology.** Tier 1–2 per 2.10. The refactor's proof is `payment-service.test.ts` and the six other suites that call `pay`/`undo`, all passing **without a line changed** (the HLD's verification). One new suite, `share-settler.test.ts`, pins the two properties later elements rely on and no existing test shows: (1) `settle` inside a caller's transaction that then throws leaves the debt and no payment, and the participation unpaid (the settler opens no transaction of its own); (2) `settle` then `unsettle` of the same share leaves the debt list, the payment list and the participation as they were before. Fully automatable; no manual plan.

**Data Contract Verification.** Stores nothing new: the same `share_debts`, `payments` and `game_participations` writes, through the same repository methods (`DebtRepository.delete`/`insert`, `PaymentRepository.append`/`delete`, `ParticipationRepository.set`), with the same arguments. The invariant "a share is in one table or the other" is kept because each method makes both of its writes, and the caller's transaction makes them atomic; `payment-service.test.ts`'s `expectNoShareInBoth` keeps checking it.

**Patterns and Conventions.** Single Responsibility (request policy vs share movement); constructor injection, wired in `repo/index.ts`; repository classes unchanged; error messages in Spanish, moved verbatim; a doc comment states the caller's obligations, like `PlayedEffect`'s.

**File Changes.**
- Create: `server/src/repo/share-settler.ts`.
- Modify: `server/src/repo/payment-service.ts` (keeps `LocalCalendar`, since `pay` still computes `paidOn`; drops `ShareRowMember`, `DebtRepository`, `ParticipationRepository`, `PlayerRepository`, `SeasonRepository`, `GameRepository`); `server/src/repo/index.ts`; `server/src/repo/game-flow-test-support.ts`.
- Tests: create `server/src/repo/share-settler.test.ts`; no existing test changes.

#### F1 — Every payment records its method

**Current Implementation.**

- `payments` has no method (`server/src/db/schema.sql:190-200`); its indexes are on `game_id`, `payer_player_id`, `beneficiary_player_id` and the two unique share keys (lines 201-208). `verified — source`.
- **`SchemaMigrator.migrate` runs `schema.sql` before the steps** (`server/src/db/schema-migrator.ts:51-59`), and `schema.sql` is `CREATE … IF NOT EXISTS` throughout, so on an existing file it creates missing tables and indexes but never changes an existing table. A new column on an existing table therefore needs a step, and **`schema.sql` must not index a column that a step adds**: SQLite answers `no such column` when `CREATE INDEX IF NOT EXISTS` names a column the table lacks (`verified — invocation`, better-sqlite3 with SQLite 3.53.4, 2026-10-19), and that error would stop the start-up before the step runs. `verified — source` for the order.
- The one existing step, `ViewAsMigration` (version 2, `server/src/db/view-as-migration.ts`), checks `table_info` first and returns if the column exists, because a file created by the current `schema.sql` already has it; it is wired in `server/src/db/index.ts:36-42` with `LATEST_SCHEMA_VERSION = 2` (`schema-migrator.ts:4`). `verified — source`. The migrator copies the file first (`backup.create('before-migration')`) and runs all steps in one `IMMEDIATE` transaction (`schema-migrator.ts:45-48`). `verified — source`.
- `ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'otro' CHECK (method IN ('efectivo','bizum','otro'))` succeeds on a table with rows, gives every existing row `'otro'`, and later refuses `'cash'` with `CHECK constraint failed`; `table_info` then shows `method`, `TEXT`, `notnull 1`, `dflt_value 'otro'`. `verified — invocation` (same run).
- Writers of `payments`: `PaymentRepository.append` (`server/src/repo/payment-repository.ts:65-89`), called by `ShareSettler.settle` (after R1) and by the season import (`server/scripts/import-season.ts:208`). `PlayerMergeService` only re-points the three player columns (`player-merge-service.ts:18-20`). `verified — invocation` (`grep -rn "payments.append\|INSERT INTO payments"`, 2026-10-19).
- Readers that return whole rows: `PaymentRepository.list`/`find` (`SELECT *`), so `GameViewService` (`game-view-service.ts:42`) and both payment routes (`routes/api.ts:387-415`) carry any new column with no change. `paidFor` (the player's list) names its columns; it is F11's, not this element's. `verified — source`.
- The organiser sees payments in one place: the payment cell of a played game's row and of a Deudas row, one component, `PaymentCell` (`web/src/components/PaymentCell.tsx`), fed by `paymentCell` (`web/src/lib/paymentCell.ts`); paying is one click on "Pagar X €", there is no form today. `PlayedView` and `Debts` both render it (`grep`, 2026-10-19). `verified — source`. The sketch draws a "Método" select before the pay button and the paid chip as "Pagado 4,00 € · Efectivo" (`requirements/examples/screens.html`, screens 5 and 10). `verified — document`.
- `PaymentService.pay` is called 28 times from six test files and once from `routes/api.ts:393` (`grep -c`, 2026-10-19). `verified — invocation`.

**Approach.**

*Values.* Three methods, stored lower-case without accents, shown in Spanish:

| Stored | Shown | Who writes it |
| ------ | ----- | ------------- |
| `efectivo` | Efectivo | the organiser, by hand (the default of the field) |
| `bizum` | Bizum | the organiser, by hand; the system, from a Bizum (F7, F8, F9) |
| `otro` | Otro | the organiser, by hand; the migration, for every payment that existed before; the season import |

A domain class owns the list: `PaymentMethods` (`server/src/domain/payment-method.ts`) with `parse(value: unknown): PaymentMethod`, which throws `"Método de pago desconocido"` for anything else, `undefined` included. The route parses; `PaymentService` takes the parsed value.

*No default at the boundary.* `POST /games/:id/payments` requires `method`; a missing one is refused like an unknown one. The default "Efectivo" lives in the form (UC-006-08-S1: "the form preselects Efectivo"), not in the server, so a client that forgets cannot record cash silently. `PayRequest.method` and `Settlement.method` are required; `PaymentRepository.append` takes it. The 28 test calls each gain `method: 'efectivo'` (mechanical). The import passes `'otro'`, consistent with UC-006-08-S5: an imported payment is from before the feature.

*Schema.* One definition, the same in `schema.sql` and in the step, so a new file and a migrated one end with identical columns:

```sql
-- schema.sql, payments: after paid_on, before the table CHECK
  method                TEXT    NOT NULL DEFAULT 'otro'
                        CHECK (method IN ('efectivo', 'bizum', 'otro')),
```

The `DEFAULT 'otro'` is what backfills the existing rows (`ALTER … ADD COLUMN … NOT NULL` needs one); in a new file it is never used because the one writer always names the method. No index on `method` (nothing filters by it), so the order problem above does not arise here.

```ts
// server/src/db/payment-method-migration.ts
/** Payments say how they were paid; those recorded before read "otro". A new file already has the column. */
export class PaymentMethodMigration implements MigrationStep {
  readonly version = 3;
  apply(conn: Database.Database): void; // table_info(payments) has 'method' → return; else the ALTER above
}
// schema-migrator.ts: LATEST_SCHEMA_VERSION = 3
// db/index.ts: steps [new ViewAsMigration(), new PaymentMethodMigration()]
```

**One step per element that changes an existing table** (amends the HLD, which had all of the work package's changes accumulate in one step 3). F3's `players.bizum_name` becomes step 4 and F7's link column `payments.bizum_id` step 5, each its own class. Reason: a step that has run on the production file must never change, and whether F1 reaches production before F7 is for the anatomy and the releases to decide, not this design. Two steps cost one class; one shared step would be wrong the day F1 is released alone. New tables need no step at all: `schema.sql` creates them on every start. **Rule passed on to later steps:** `schema.sql` must not index a column that a step adds (it runs before the steps on a migrated file and would fail), and a step cannot add the index either, because a new file never runs the steps; so no such index is planned (F7 found this), and one would need a change to the migrator.

*Web.* `PaymentCell` gains one "Método" select per cell (Efectivo, Bizum, Otro; Efectivo selected), placed before its pay buttons; every pay and adjust action of that cell sends the chosen method. A settled chip reads `Pagado 4,00 € · Efectivo` (`… por Ana · Bizum` when someone else paid). The labels come from one `lib` mapping, `paymentMethodLabel`. The select is local state of the cell; it resets to Efectivo when the cell is re-rendered after a payment (the parts change), so a Bizum choice never carries over to the next row by accident. No way to change a recorded method exists (UC-006-07-S5): the chip has only "Deshacer".

Worked by hand (`not yet run`): Marta owes 4,00 € on game 12; the organiser leaves "Efectivo" and presses "Pagar 4,00 €" → `POST {shares:[{playerId:marta}], payerPlayerId:marta, method:'efectivo'}` → one `payments` row with `method = 'efectivo'`, the debt gone, the chip "Pagado 4,00 € · Efectivo". The same with "Otro" and 5,00 € → `method = 'otro'`. A request with no `method` → 400 `"Método de pago desconocido"`, no row. A production file at version 2 with 67 payments → backup written, `user_version` 3, 67 rows with `method = 'otro'`, every other column unchanged.

**Impacted Units.**

| Unit | Method / part | Action |
| ---- | ------------- | ------ |
| `server/src/domain/payment-method.ts` `PaymentMethod`, `PaymentMethods` | `parse` | Create |
| `server/src/db/schema.sql` | `payments.method` | Modify |
| `server/src/db/payment-method-migration.ts` `PaymentMethodMigration` | `apply` | Create |
| `server/src/db/schema-migrator.ts` | `LATEST_SCHEMA_VERSION = 3` | Modify |
| `server/src/db/index.ts` | the steps list | Modify |
| `server/src/db/fixtures/schema-v2.sql` | today's `schema.sql`, frozen | Create |
| `server/src/repo/payment-repository.ts` `PaymentRow`, `PaymentRepository` | `method` on the row; `append` takes and writes it | Modify |
| `server/src/repo/share-settler.ts` `Settlement`, `ShareSettler` | `method` on `Settlement`; `settle` passes it | Modify |
| `server/src/repo/payment-service.ts` `PayRequest`, `PaymentService` | `method` on `PayRequest`; `pay` passes it | Modify |
| `server/src/routes/api.ts` | `POST /games/:gameId/payments` reads and parses `method` | Modify |
| `server/scripts/import-season.ts` | `append({… method: 'otro'})` | Modify |
| `web/src/api.ts` | `PaymentMethod`; `Payment.method`; `pay` request gains `method` | Modify |
| `web/src/lib/paymentMethod.ts` | `paymentMethodLabel`, `PAYMENT_METHODS` (order of the select) | Create |
| `web/src/lib/paymentCell.ts` | the `paid` label adds ` · <method>` | Modify |
| `web/src/components/PaymentMethodField.tsx` | the select | Create |
| `web/src/components/PaymentCell.tsx` | holds the chosen method; `onPay` gains it | Modify |
| `web/src/hooks/usePayments.ts`, `useDebtPayments.ts` | `pay` takes and sends `method` | Modify |
| `web/src/components/PlayedView.tsx`, `web/src/pages/Debts.tsx` | pass the method through `onPay` | Modify |

**Test Methodology.** Tiers 1–2 per 2.10, plus the existing E2E unchanged. Fully automatable; no manual plan.

- `payment-method.test.ts`: the three values parse; `'cash'`, `'Efectivo'`, `''`, `undefined`, `3` throw.
- `payment-method-migration.test.ts` (the `ViewAsMigration` test's shape): on a `payments` table without the column and with rows, the step adds it and every row reads `'otro'`; applied twice, it does nothing the second time; a later insert of `'cash'` fails.
- `schema-migrator.test.ts`, one case: a file built from `fixtures/schema-v2.sql`, stamped 2, with three payments, run through the real migrator with the real steps → a backup exists, `user_version` is 3, the three rows keep every column and read `'otro'`, and `table_info(payments)` equals a new file's. (The existing "same schema as a new one" case compares `sqlite_master.sql` text, which `ALTER` writes differently, and starts from v0, which has no `payments`; it stays as it is.)
- `payment-service.test.ts`: a payment records the method it was given; existing cases with `method: 'efectivo'` added.
- Route test (`server/src/routes/api.test.ts`, `describe('payments')`): `POST` with `method: 'otro'` → the row has it; without `method` → 400 and no row; the three refusals of UC-006-08-S2 still answer today's messages.
- `web/src/lib/paymentCell.test.ts`: the paid label carries the method, with and without "por".
- E2E: the existing `the-game-screen.spec.ts` clicks "Pagar 4 €" and expects "Pagado 4 €"; with Efectivo preselected it still passes (`toContainText`), which is UC-006-08-S4's "works as today". No new journey; one is added by F13.

**Data Contract Verification.**

| Step | Where | Shape |
| ---- | ----- | ----- |
| Chosen | `PaymentMethodField` → `PaymentCell` state | `'efectivo' \| 'bizum' \| 'otro'` |
| Sent | `api.pay` body | `{shares, payerPlayerId, amountCents?, method}` |
| Parsed | `routes/api.ts` → `PaymentMethods.parse` | throws on anything else (400 via `route()`) |
| Passed | `PayRequest.method` → `Settlement.method` → `append({method})` | `PaymentMethod` |
| Stored | `payments.method` | `TEXT NOT NULL`, `CHECK` the three values; the DB refuses what the parser would |
| Read | `PaymentRepository.list`/`find` (`SELECT *`) → `PaymentRow.method` | string, one of three |
| Returned | `POST`/`DELETE` payment routes, `GET` game detail | `Payment.method` in JSON |
| Shown | `paymentCell` → `paymentMethodLabel` | Spanish label; an unknown string (impossible by the CHECK) would show as itself, never crash |

Create, read: as above. Update: none, by design (UC-006-07-S5); undo deletes the row (`ShareSettler.unsettle`), and the debt that comes back has no method (debts never had one). Delete: undo, unchanged. Migrated rows: `'otro'`, read through the same path.

**Patterns and Conventions.** A small domain class owns a closed list and its parsing (like `GameLifecycle` owns the states); the route parses, services take typed values; the schema enforces the same list with `CHECK`, as `games.status` does; a migration step is a class checking `table_info` first, like `ViewAsMigration`; the web keeps the label mapping in `lib/` with a test, and the select is a small controlled component.

**File Changes.**

- Create: `server/src/domain/payment-method.ts`, `server/src/db/payment-method-migration.ts`, `server/src/db/fixtures/schema-v2.sql` (copy of `schema.sql` before this element), `web/src/lib/paymentMethod.ts`, `web/src/components/PaymentMethodField.tsx`.
- Modify: `server/src/db/schema.sql`, `schema-migrator.ts`, `db/index.ts`; `server/src/repo/payment-repository.ts`, `share-settler.ts`, `payment-service.ts`; `server/src/routes/api.ts`; `server/scripts/import-season.ts`; `web/src/api.ts`, `lib/paymentCell.ts`, `components/PaymentCell.tsx`, `components/PlayedView.tsx`, `pages/Debts.tsx`, `hooks/usePayments.ts`, `hooks/useDebtPayments.ts`.
- Migrate: step 3, `PaymentMethodMigration`; `LATEST_SCHEMA_VERSION` 2 → 3.
- Tests: create `payment-method.test.ts`, `payment-method-migration.test.ts`; extend `schema-migrator.test.ts`, `payment-service.test.ts`, the payments route test, `web/src/lib/paymentCell.test.ts`; add `method: 'efectivo'` to the 28 `pay` calls in `payment-service.test.ts`, `own-router.test.ts`, `team-paste-service.test.ts`, `played-outcome-fixed.test.ts`, `player-report-service.test.ts`, `debt-query-cost.test.ts`, and to the four payment `POST`s of `api.test.ts`.

#### F2 — The Bizum core's model and ports, and the boundary that keeps it free of Pachanguero

**Current Implementation.** `server/src/bizum/` and `server/src/bank/` do not exist (`ls server/src`, 2026-10-19). `verified — invocation`. The one existing port the HLD meant to reuse, `Clock`, lives in `server/src/domain/clock.ts:2-4` (`now(): Date`), imported by eight modules (`grep`, 2026-10-19). `verified — invocation`. **This contradicts the HLD**: 2.1 lists `Clock (the existing one)` among the core's ports, while 2.9 and F2's row forbid the core to import `domain/`. Resolved below (the core declares its own) and amended in 2.1. The repository already has a test that reads source text to enforce a rule, `server/src/deployment-settings.test.ts` (a `SourceText` class over files found from `import.meta.url`); the boundary test follows its shape. `verified — source`. No source file under `server/src`, `web/src` or `e2e` mentions Revolut today (`grep -rli revolut`, 2026-10-19). `verified — invocation`.

**Approach.** The core's vocabulary as two value classes and a handful of port interfaces, with no behaviour beyond checking its own invariants; and one test module that fails the suite when the core imports anything outside itself, or when code outside the bank adapters names Revolut.

*The model.* `Bizum` and `BizumKey` are classes, not bare interfaces, because each has invariants a dialect must not be able to break and the rules must be able to trust (D4: a Bizum with no subject or no named party is legal; one with no key, date or amount is not).

```ts
// server/src/bizum/model.ts
export type BizumDirection = 'incoming' | 'outgoing';

/** One side of a Bizum as the bank shows it; a bank fills what it has. */
export interface BizumParty {
  /** As displayed by the bank, possibly abbreviated ("Marta G.L."). */
  readonly name: string | null;
  /** As displayed by the bank ("+34600000000"). */
  readonly phone: string | null;
}

/** The bank's own identification of an entry, stable across sessions. */
export class BizumKey {
  constructor(readonly account: string, readonly reference: string) {}  // both non-empty after trim, else throws
  sameAs(other: BizumKey): boolean;
}

export interface BizumFields {
  key: BizumKey;
  direction: BizumDirection;
  bookedOn: string;          // YYYY-MM-DD, a real calendar date
  amountCents: number;       // positive integer
  currency: string;          // three upper-case letters
  sender: BizumParty;
  receiver: BizumParty;
  subject: string | null;    // empty or blank text is stored as null
}

/** A Bizum as any bank reports it; built only through its checks. */
export class Bizum {
  readonly key: BizumKey; readonly direction: BizumDirection; readonly bookedOn: string;
  readonly amountCents: number; readonly currency: string;
  readonly sender: BizumParty; readonly receiver: BizumParty; readonly subject: string | null;
  constructor(fields: BizumFields);   // throws a plain Error naming the field on a broken invariant
  /** The party who is not the account holder: the sender of an incoming Bizum, the receiver of an outgoing one. */
  counterparty(): BizumParty;
}
```

| Field | Invariant | Why |
| ----- | --------- | --- |
| `key.account`, `key.reference` | non-empty after trim | the ledger (D-2) keys on them; Enable Banking: account `identification_hash`, entry `entry_reference` (guide §5, §7) |
| `direction` | `incoming` or `outgoing` | the policy discards outgoing (UC-006-02-S2) |
| `bookedOn` | `YYYY-MM-DD`, a valid date | compared with the start date as text, like every date in the schema |
| `amountCents` | integer, > 0 | money is integer cents (AGENTS.md) |
| `currency` | `/^[A-Z]{3}$/` | the setting (`EUR`) is compared with it (UC-006-01-S14) |
| party `name`, `phone`, `subject` | free text or null; blank becomes null | Revolut fills `sender.name` *or* a phone-shaped text (UC-006-02-S1 row 2); what a dialect puts where is F4's decision |

Worked by hand (`not yet run`): `new Bizum({key: new BizumKey('h1','e1'), direction:'incoming', bookedOn:'2026-10-12', amountCents:400, currency:'EUR', sender:{name:'Marta G.L.', phone:null}, receiver:{name:null, phone:null}, subject:'pachanga'})` is valid and `counterparty().name` is `Marta G.L.`; the same with `amountCents: 4.5`, `bookedOn: '2026-02-30'`, `currency: 'eur'` or `new BizumKey('h1', ' ')` throws; `subject: '  '` gives `subject === null`.

*The ports.* As 2.4, with the details it left open:

```ts
// server/src/bizum/ports.ts
/** An entry or account exactly as the connector received it; read only by the dialect. */
export type RawEntry = Readonly<Record<string, unknown>>;
export type RawAccount = Readonly<Record<string, unknown>>;

/** The institution the connector asks consent from. */
export interface BankRef { readonly name: string; readonly country: string }
/** An account as offered for the organiser's choice; `stableId` survives renewals, `sessionId` does not. */
export interface AccountChoice {
  readonly stableId: string; readonly sessionId: string;
  readonly currency: string; readonly kind: string; readonly last4: string;
}
export type AccountRef = Pick<AccountChoice, 'stableId' | 'sessionId'>;

export type IgnoreReason = 'not_a_bizum' | 'pending' | 'unidentified';
export type Recognised =
  | { kind: 'bizum'; bizum: Bizum }
  | { kind: 'ignore'; why: IgnoreReason; key: BizumKey | null };

export interface BizumDialect {
  readonly id: string;
  readonly displayName: string;
  readonly bank: BankRef;
  recognise(raw: RawEntry, account: AccountRef): Recognised;
  describeAccount(raw: RawAccount): AccountChoice;
}

export interface BankConnector {
  begin(redirectUrl: string, state: string, validUntil: Date, bank: BankRef): Promise<string>;
  complete(code: string): Promise<{ sessionId: string; validUntil: Date; accounts: RawAccount[] }>;
  close(sessionId: string): Promise<void>;
  entries(account: AccountRef, dateFrom: string, options: { deep: boolean }): AsyncIterable<RawEntry>;
}

export interface StoredBizum { readonly id: number; readonly bizum: Bizum }
export type Review = { kind: 'discard' } | { kind: 'keep'; afterKept(stored: StoredBizum): void };
export interface BizumPolicy { judge(bizum: Bizum): Review }
export interface BizumStore {
  save(bizum: Bizum): StoredBizum;
  find(id: number): StoredBizum | null;
  remove(id: number): void;
}

/** A failure of the aggregator, classified so the core can react without knowing it; detailed in F5. */
export type BankFailure = 'session_ended' | 'rate_limited' | 'authorization_failed' | 'misconfigured' | 'rejected' | 'unavailable';
export class BankError extends Error { constructor(readonly failure: BankFailure, readonly code: string, readonly retryAfter: Date | null = null) }

/** The current moment; the same shape as the application's clock, so its implementations fit. */
export interface Clock { now(): Date }
```

Decisions this fixes beyond 2.4, each small and reversible:
- `recognise` takes the `AccountRef` because the entry alone does not carry the account's stable id, and the key needs it (guide §7: `entry_reference` is unique only within an account). `verified — document`.
- `ignore` carries the key when the entry has one, so F7 can record `not_bizum` in the ledger (D-2) and skip it next time; `pending` carries none and is never recorded, so it is read again once booked (2.9). `unidentified` is new: a booked credit that looks like a Bizum but has no `entry_reference` cannot be judged exactly once, so it is not kept; F7 counts it in the read's result. `inferred` from the guide §7 ("a pending item gets an `entry_reference` only if the bank keeps it when booking"); no such booked entry was seen in 412 Bizums. **Flagged to the author** (owed list).
- `BizumDialect.bank` replaces a separate lookup: the dialect knows which institution the connector must ask; `BankCatalogue` (F4) lists dialects.
- `Clock` is declared again in the core (resolving the contradiction above). TypeScript's structural typing lets the composition root pass `SystemClock` and tests pass `ManualClock` with no import either way. The alternative, moving `domain/clock.ts` to a shared folder, touches eight modules for no gain.

*The boundary test.* One module, `server/src/architecture-boundaries.test.ts`, beside `deployment-settings.test.ts`, with two rules:

| Rule | Scope | Allowed | Fails on |
| ---- | ----- | ------- | -------- |
| The core imports only itself | every `.ts` file under `server/src/bizum/`, tests included | a relative specifier that resolves inside `server/src/bizum/`; a `node:` built-in; `better-sqlite3`, only from files under `server/src/bizum/sqlite/`; `vitest`, only from `*.test.ts` | anything else, naming the file and the specifier |
| Only the bank adapters name Revolut | every `.ts`/`.tsx` file under `server/src/` and `web/src/`, plus `server/src/db/schema.sql` | files under `server/src/bank/`; the boundary test itself | `/revolut/i` anywhere in the text, naming the file and line |

The first is an **allow-list**, stricter than the HLD's wording (which named `repo/`, `domain/`, `routes/`, `bank/`): it also catches `db/`, `cli/` and the server files, and any npm package, which a deny-list would let through. Amended in 2.1 and 2.9. The imports are found by a regular expression over `import … from '…'`, `export … from '…'`, `import '…'` and `import('…')`, type-only imports included. The second rule covers the web because the Banco panel must show the bank's name from the server's catalogue, never a literal; and `schema.sql` because a default bank id there would name it (F6 must not add one).

Worked by hand (`not yet run`): a file `server/src/bizum/feed.ts` importing `'./model.js'` and `'node:crypto'` passes; importing `'../domain/clock.js'` fails with that file and specifier; `server/src/bizum/sqlite/sqlite-bizum-store.ts` importing `'better-sqlite3'` passes, `server/src/bizum/feed.ts` importing it fails; a `web/src/components/BankPanel.tsx` containing `"Revolut"` fails; `server/src/bank/revolut-dialect.ts` passes.

**Impacted Units.**

| Unit | Location | Action |
| ---- | -------- | ------ |
| `BizumDirection`, `BizumParty`, `BizumKey` (`constructor`, `sameAs`), `BizumFields`, `Bizum` (`constructor`, `counterparty`) | `server/src/bizum/model.ts` | Create |
| `RawEntry`, `RawAccount`, `BankRef`, `AccountChoice`, `AccountRef`, `IgnoreReason`, `Recognised`, `BizumDialect`, `BankConnector`, `StoredBizum`, `Review`, `BizumPolicy`, `BizumStore`, `Clock` | `server/src/bizum/ports.ts` | Create |
| the two boundary rules, a `SourceFile` class (path, text, import specifiers) | `server/src/architecture-boundaries.test.ts` | Create |

**Test Methodology.** Tier 1 per 2.10. `model.test.ts` table-tests each invariant row above, valid and broken, plus `counterparty` for both directions and the blank-to-null rule. The ports have no behaviour; they are exercised by F4, F7 and F15 through their implementations. The boundary test is proved to bite by a temporary file during implementation (a core file importing `../domain/clock.js`, a web file naming Revolut: both fail, then the file is removed); recorded in the task, not committed. Fully automatable; no manual plan.

**Data Contract Verification.** Stores nothing; the model is the shape F7's `bizums` table stores and F11 reads. The full trace is in F7's subsection; the constraint passed on: every `Bizum` field is a column, `key` as two columns, each party as two nullable columns, and a row read back must pass the constructor's checks (a row that fails is corruption and throws).

**Patterns and Conventions.** Value objects with validating constructors (no static factories needed; the coding standard allows constructors only); ports as narrow interfaces (Interface Segregation), implemented in `bank/`, `bizum/sqlite/` and `domain/`/`repo/`; dependency direction enforced by a test, not a lint rule (confirmation 5 of the owed list); file names kebab-case like the rest of `server/src`.

**File Changes.**
- Create: `server/src/bizum/model.ts`, `server/src/bizum/ports.ts`.
- Tests: create `server/src/bizum/model.test.ts`, `server/src/architecture-boundaries.test.ts`.
- Modify: none.

#### F3 — The ordered rules R1–R7 as the policy

**Current Implementation.**

- A player is `players (id, name UNIQUE, introduced_by, created_at)` (`server/src/db/schema.sql:21-26`); sign-up aliases are `player_aliases (player_id, alias)` (`AliasRepository.listAll`); a player's phone is `player_contacts.phone`, free text checked against `/^\+?\d{9,15}$/` after removing spaces, and stored as typed (`domain/contact-validator.ts:13,42-50`; `repo/contact-repository.ts:13-35`). `verified — source`. So `611 11 11 11`, `611111111` and `+34611111111` are all storable for one number.
- `NameMatcher` compares with `localeCompare(…, 'es', {sensitivity: 'base'})`, which ignores case and accents (`domain/name-matcher.ts:48-50`); there is no other folding helper in `domain/`. `verified — source`.
- Debts: `DebtRepository.outstandingFor(playerId)` returns the shares a player **holds or is the beneficiary of**, every season, oldest first (`repo/debt-repository.ts:105-114`), as `OutstandingShare` (`id`, `gameId`, `playedOn`, `holderId`, `beneficiaryId`, `guestOrdinal`, `amountCents`, names; lines 10-22). It does not filter on the game's state; debts **outlive** a game leaving `played` (`BillingEffect.retract` does nothing, `repo/billing-effect.ts:43-45`), so "open debts on played games" needs `g.status = 'played'`, as `totalsByHolder` already does (lines 116-127). `verified — source`.
- The season of a date: `SeasonRepository.current(asOf)` returns the season whose range contains it, or `undefined` when that season has not been created (`repo/season-repository.ts:43-53`); `shareCents(seasonId)` is `round(price_cents / slots)` (lines 127-130). `verified — source`.
- `PlayerMergeService.merge` moves every player-id column listed in `REFERENCES`, the aliases, and the contacts (`mergeContacts`) (`repo/player-merge-service.ts:6-20, 40-80`). A new column on `players` is not moved by it. `verified — source`.
- In the local database: 43 players, 27 one-word names; seven first names are shared (for example a one-word "Alberto" and an "Alberto H.", a one-word "Pablo" with "Pablo S." and "Pablo T.") (`verified — invocation`, read-only count, 2026-10-19). This is what made the author withdraw the name fit (UC-006-03-S1).

**Approach.** The rules are a pure domain object judging a **facts** record; one repository class gathers the facts. Neither touches a Bizum table, a payment or the bank: F7's `BizumHandler` (the `BizumPolicy` of the core) composes them, F8 and F9 reuse them. **This amends 2.1**: `BizumRuleSet` does not implement `BizumPolicy` itself, since judging needs the database (season, debts, pairings) and the domain layer must not; `BizumHandler` implements it.

```
Bizum ──► BizumFactsReader (repo) ──► BizumFacts ──► BizumRuleSet.judge(facts, mode) ──► Verdict
              │ season, share          (pure data)        R1…R7 as rule objects
              │ SenderIdentification ◄─ Bizum names, phones (stored only)
              │ SenderSuggestion     ◄─ names, aliases (only when unknown)
              │ NearestDebtOrder     ◄─ open shares of the identified player in the Bizum's season
              └ KeywordSource (port; F6 implements)
```

*Facts and verdict* (`server/src/domain/bizum-rules.ts`):

```ts
export type SenderIdentity =
  | { kind: 'player'; playerId: number }
  | { kind: 'ambiguous'; playerIds: number[] }          // a Bizum name or phone held by 2+ players
  | { kind: 'unknown'; suggestions: number[] };         // UC-006-04-S5; never acted on

export interface OpenShare {                            // one debt, as NearestDebtOrder returns it
  debtId: number; gameId: number; playedOn: string; member: MemberKey; holderId: number; amountCents: number;
}

export interface BizumFacts {
  amountCents: number;
  subject: string | null;
  shareCents: number | null;           // null: the season containing bookedOn does not exist
  sender: SenderIdentity;
  openShares: OpenShare[];             // the identified player's, nearest first; [] unless sender.kind === 'player'
  include: KeywordList; exclude: KeywordList;
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';
export type WaitReason =
  | { code: 'not_enough_debts'; playerId: number; shares: number; debts: number }   // R4
  | { code: 'include_word'; word: string; wholeShares: boolean }                    // R5
  | { code: 'sender_unknown' }                                                      // R7
  | { code: 'sender_ambiguous'; playerIds: number[] }                               // R7
  | { code: 'no_season' }                                                           // no rule can count shares
  | { code: 'kept' };                                                               // review mode, nothing else applies
  | { code: 'undone' };                                                             // F10: its payments were undone

export type Verdict =
  | { action: 'discard'; rule: 'R1' | 'R2' | 'R6' }
  | { action: 'settle'; rule: 'R3'; playerId: number; shares: OpenShare[] }         // exactly n, nearest first
  | { action: 'wait'; rule: 'R4' | 'R5' | 'R7' | null; reason: WaitReason; sender: SenderIdentity };

export type JudgeMode = 'new' | 'review';
```

*The rules* are seven classes implementing one interface, in one ordered list; the first that returns a verdict decides (Strategy; the order is data, a rule is a class, never a branch):

```ts
interface BizumRule { readonly id: RuleId; decide(facts: BizumFacts, count: ShareCount): Verdict | null }
export class BizumRuleSet {
  constructor(rules?: readonly BizumRule[]);            // default: R1…R7 in order
  judge(facts: BizumFacts, mode: JudgeMode): Verdict;
}
```

`ShareCount` is computed once per judgment from `amountCents` and `shareCents`: `whole = shareCents !== null && amountCents % shareCents === 0`, `n = amountCents / shareCents` (a fraction when not whole), `overSeven = shareCents !== null && amountCents > 7 * shareCents`.

| Rule | Matches when | Verdict |
| ---- | ------------ | ------- |
| R1 | `exclude.find(subject)` is a word | discard |
| R2 | `overSeven` | discard |
| R3 | `sender.kind === 'player'`, `whole`, `1 ≤ n ≤ 7`, `openShares.length ≥ n` | settle `openShares.slice(0, n)` |
| R4 | `sender.kind === 'player'`, `whole`, `1 ≤ n ≤ 7`, `openShares.length < n` | wait, `not_enough_debts` |
| R5 | `include.find(subject)` is a word | wait, `include_word` (`wholeShares: whole`) |
| R6 | `shareCents !== null` and not `whole` | discard |
| R7 | `whole` and `sender.kind !== 'player'` | wait, `sender_unknown` or `sender_ambiguous` |
| — | nothing matched: in new mode only when `shareCents === null`; in review mode also a skipped discard case | wait, `no_season` when `shareCents === null`, else `kept` |

`n ≥ 1` always holds when `whole`, because `amountCents > 0` (F2's invariant). **Review mode** (`'review'`) is what F8 (after a pairing) and F9 (a game played) use on a Bizum already kept: the discard rules R1, R2, R6 are skipped, so a kept Bizum is never discarded by a later list change or a changed share (UC-006-10-S3), and a Bizum nothing else matches stays waiting with `kept`. Every wait verdict carries the sender identity, so the list (F8, F13) shows suggestions or the ambiguous players whatever rule decided.

Worked by hand against UC-006-03-S8 (share 400, `Luis P.R.` is the Bizum name of Luis alone, 2 open shares, include `pachanga`, exclude `cena`; `not yet run`):

| sender | amount | subject | count | first match | verdict |
| ------ | ------ | ------- | ----- | ----------- | ------- |
| `Luis P.R.` → player | 400 | `cena pachanga` | n=1 | R1 (`cena`) | discard |
| `Luis P.R.` → player | 3200 | `pachanga` | n=8, overSeven | R2 | discard |
| `Luis P.R.` → player | 800 | `pachanga` | n=2, d=2 | R3 | settle the 2 nearest |
| `Luis P.R.` → player | 1200 | — | n=3, d=2 | R4 | wait, Luis, 3 shares, 2 debts |
| `Marta G.L.` → unknown | 450 | `pachanga` | not whole | R5 | wait, `include_word` `pachanga`, `wholeShares: false` |
| `Marta G.L.` → unknown | 450 | — | not whole | R6 | discard |
| `Marta G.L.` → unknown | 800 | — | n=2 | R7 | wait, `sender_unknown` |

And UC-006-03-S4 row 4 (`fútbol`, 200, Luis, d=2): R1 no; R2 no; R3/R4 not whole; R5 `futbol` (folded) → wait. UC-006-03-S7 (Luis, d=2): 1200 → R4 wait; 2800 (n=7) → R4 wait; 3200 → R2 discard. UC-006-10-S3, review mode, subject now holding an exclude word, Luis, n=1, d=1 → R1 skipped, R3 settles.

*Identifying the sender* (`server/src/domain/sender-identification.ts`), from stored data only (`author decision`, 2026-10-19):

```ts
export class SenderIdentification {
  constructor(bizumNames: readonly {playerId: number; bizumName: string}[],
              phones: readonly {playerId: number; phone: string}[],
              suggestion: SenderSuggestion);
  identify(sender: BizumParty): SenderIdentity;
}
```

1. `sender.phone` present → the players whose phone has the same `PhoneKey` (below): one → `player`; two or more → `ambiguous`; none → step 2.
2. `sender.name` present → the players whose `bizum_name` is the same text, compared as `NameMatcher` does (`TextFolding.same`: spaces collapsed and trimmed, case and accents ignored): one → `player`; two or more → `ambiguous`; none → step 3.
3. `unknown`, with `suggestion.suggest(sender.name)` (empty for a phone-only sender).

A phone sender is looked up by phone only and a name sender by Bizum name only; one never falls back to the other's similarity. `PhoneKey` (`server/src/domain/phone-key.ts`) makes the comparison independent of how the phone was typed: remove spaces, dots and dashes; `00` at the start becomes `+`; nine digits with no `+` get `+34`. Worked: `611 11 11 11`, `611111111`, `0034611111111` and `+34611111111` give `+34611111111`; `+44 7700 900123` gives `+447700900123`. `inferred`: the group is Spanish and Bizum is Spanish; a foreign number stored without its `+` is not recognised and waits, the safe failure.

*The suggestion* (`server/src/domain/sender-suggestion.ts`), UC-006-04-S5: over every player's name and sign-up aliases, a name `w₀ w₁ … wₖ` is suggested for a sender `s₀ i₁…iₘ` when `fold(w₀) = fold(s₀)` and the first letters of `w₁ … wₖ`, in order, are a prefix of the sender's initials `i₁…iₘ` (a one-word name, k = 0, is the empty prefix). The sender's initials are the letters of everything after the first word with dots and spaces removed (`G.L.` and `G. L.` give `gl`); a further word's first letter is its first letter character (`(Pepe)` gives `p`). The result is distinct player ids sorted by name (`es` locale). Worked against the rows of UC-006-04-S5 (`not yet run`): `Marta G.L.` → "Marta" (empty prefix), not "Luis Pérez"; `Alberto H.M.` → "Alberto" and "Alberto H." (`h` prefix of `hm`); `Álvaro B.X.` → "Álvaro B." only; `Marta G.L.` vs "Marta García Pérez" → `gp` is not a prefix of `gl`, none; `Jorge G.A.` vs "Guti" → first names differ, none (unless an alias "Jorge G." exists).

*Keywords* (`server/src/domain/keyword-list.ts`): `KeywordList(words)` with `find(subject): string | null`, the first listed word found in the subject. Both are folded (`TextFolding.fold`: NFD, combining marks removed, lower case), and a word matches only **as a whole word**: bounded by the start or end of the subject or by a character that is not a letter or digit. So `fútbol` finds `futbol` in `"Fútbol miércoles"`, and `cena` does not find `"escena"`. A multi-word entry (`partido de`) matches as a phrase. `inferred` from "a subject matches a list when it contains one of its words" (UC-006-03); whole words keep an exclude word from discarding by accident inside a longer word. **Flagged to the author.**

*Nearest-first* (`server/src/domain/nearest-debt-order.ts`): `NearestDebtOrder.order(shares, playerId, bookedOn): OpenShare[]` keeps the shares of games played **on or before** `bookedOn` (UC-006-03-S2 row 3, UC-006-10-S2 row 2) and sorts by `playedOn` descending, then game id descending; within one game, the player's own share first (`beneficiaryId === playerId`), then the shares the player holds for others by guest ordinal, then by debt id (UC-006-03-S3). Worked (`not yet run`): shares on 09-30 and 10-07, booked 10-12 → `[10-07, 09-30]`; booked 10-06 → `[09-30]`; Marta's own and plus-one shares on 10-07 → `[own, plus-one 1]`.

*Gathering the facts* (`server/src/repo/bizum-facts-reader.ts`):

```ts
export interface KeywordSource { include(): string[]; exclude(): string[] }  // implemented by F6
export class BizumFactsReader {
  constructor(seasons: SeasonRepository, players: PlayerRepository, aliases: AliasRepository,
              contacts: ContactRepository, debts: DebtRepository, keywords: KeywordSource);
  read(bizum: Bizum): BizumFacts;
}
```

`read`: season = `seasons.current(bizum.bookedOn)`; `shareCents` from it or `null`; identity from `SenderIdentification` built over `players.listBizumNames()`, `contacts.listPhones()` and a `SenderSuggestion` over `players.listAll()` and `aliases.listAll()`; when the sender is a player and the season exists, `openShares = NearestDebtOrder.order(debts.openInSeason(playerId, seasonId), playerId, bookedOn)`, else `[]`. It reads the season of the **Bizum**, never of the games, which is how UC-006-11 holds: a share of another season is never read. For a forty-player group these are a handful of small queries per Bizum; no cache.

Debts are restricted to the identified player's season. The organiser's ruling (UC-006-05-S2, F8) reuses `read` for the open shares and does its own count; it does not go through `BizumRuleSet`.

*Schema, step 4.* `players.bizum_name TEXT` (nullable, not unique), the last column of `players` in `schema.sql` and as `PlayerBizumNameMigration` (version 4: return if `table_info(players)` has it; else `ALTER TABLE players ADD COLUMN bizum_name TEXT`); `LATEST_SCHEMA_VERSION` 4. No index (40 rows). Writes are F8's (pairing, removal); F3 adds the reads and keeps the column through a merge.

**Impacted Units.**

| Unit | Method / part | Action |
| ---- | ------------- | ------ |
| `server/src/domain/bizum-rules.ts`: `BizumFacts`, `SenderIdentity`, `OpenShare`, `Verdict`, `WaitReason`, `JudgeMode`, `ShareCount`, `BizumRule`, `ExcludeWordRule` (R1), `OverSevenRule` (R2), `SettleRule` (R3), `NotEnoughDebtsRule` (R4), `IncludeWordRule` (R5), `NotWholeRule` (R6), `WholeUnknownRule` (R7), `BizumRuleSet` | `judge`, each `decide` | Create |
| `server/src/domain/text-folding.ts` `TextFolding` | `fold`, `same` | Create |
| `server/src/domain/keyword-list.ts` `KeywordList` | `find` | Create |
| `server/src/domain/phone-key.ts` `PhoneKey` | constructor, `toString`, `sameAs` | Create |
| `server/src/domain/sender-suggestion.ts` `SenderSuggestion` | `suggest` | Create |
| `server/src/domain/sender-identification.ts` `SenderIdentification` | `identify` | Create |
| `server/src/domain/nearest-debt-order.ts` `NearestDebtOrder` | `order` | Create |
| `server/src/repo/bizum-facts-reader.ts` `KeywordSource`, `BizumFactsReader` | `read` | Create |
| `server/src/repo/debt-repository.ts` `DebtRepository` | `openInSeason(playerId, seasonId): OutstandingShare[]` (held or benefiting, `g.status = 'played'`, `g.season_id = ?`) | Modify |
| `server/src/repo/player-repository.ts` `PlayerRepository` | `listBizumNames(): {playerId, bizumName}[]` (non-null only) | Modify |
| `server/src/repo/contact-repository.ts` `ContactRepository` | `listPhones(): {playerId, phone}[]` (non-null only) | Modify |
| `server/src/repo/player-merge-service.ts` `PlayerMergeService` | `merge` keeps the survivor's `bizum_name`, else takes the absorbed one's | Modify |
| `server/src/db/schema.sql` | `players.bizum_name` | Modify |
| `server/src/db/player-bizum-name-migration.ts` `PlayerBizumNameMigration` | `apply` | Create |
| `server/src/db/schema-migrator.ts`, `db/index.ts` | version 4; the steps list | Modify |
| `server/src/db/fixtures/schema-v3.sql` | `schema.sql` as F1 leaves it, frozen | Create |

**Test Methodology.** Tiers 1–2 per 2.10. Fully automatable; no manual plan.

- `bizum-rules.test.ts`: one table test per scenario outline, each row a `BizumFacts` built by hand and the expected verdict: UC-006-03-S1 (as identities), S2, S3, S4, S7, S8 (above), UC-006-11-S1, S2 (as `openShares` already season-restricted, plus `shareCents: null` → `no_season`), UC-006-10-S3 (review mode never discards). A test swapping R1 and R3 in a custom list shows the order is data: row 1 of S8 then settles.
- `sender-identification.test.ts`: UC-006-03-S1 rows; a phone typed four ways; a Bizum name on two players → ambiguous; a name sender never matched by a player's name or alias (row 2) but suggested.
- `sender-suggestion.test.ts`: the six rows of UC-006-04-S5, plus `G. L.` with a space and an accented first name.
- `keyword-list.test.ts`: `fútbol`/`futbol`, upper case, whole word (`cena` vs `escena`), a phrase, an empty subject.
- `nearest-debt-order.test.ts`: the rows above.
- `bizum-facts-reader.test.ts` (real SQLite through `GameFlow`): a player with debts in two seasons and a game after the booking date → only the right shares, nearest first; a debt on a game reopened from `played` is not read; a missing season → `shareCents: null`.
- `player-bizum-name-migration.test.ts` and one `schema-migrator.test.ts` case from `fixtures/schema-v3.sql` (as F1's); `player-merge-service.test.ts`: the Bizum name survives a merge.

**Data Contract Verification.**

| Data | Written by | Stored as | Read by | Expects |
| ---- | ---------- | --------- | ------- | ------- |
| Bizum name | F8 pairing (`PlayerRepository`, F8's LLD); merge | `players.bizum_name TEXT NULL`, as the bank showed it (trimmed) | `listBizumNames` → `SenderIdentification` | any text; compared folded, so case, accents and extra spaces stored by hand do not matter |
| Phone | the player (Ajustes) or the admin; F8 pairing | `player_contacts.phone`, as typed, validated `^\+?\d{9,15}$` without spaces | `listPhones` → `PhoneKey` | every value the validator accepts yields a key; a value it never accepted (none exist: the table is empty, study Q-05) still yields one or is ignored as unmatched |
| Keywords | F6 (`bank_keywords`, stored folded) | text | `KeywordSource` → `KeywordList` (folds again: idempotent) | any text; empty words are ignored |
| Debts | `BillingEffect` | `share_debts` | `openInSeason` → `OutstandingShare` → `NearestDebtOrder` → `OpenShare` (`member` from `ShareRowMember.keyOf`) | the same row shape `outstandingFor` returns |

Create and update of the Bizum name are F8's, delete is F8's removal (sets `NULL`) and player deletion (the row goes with the player). The phone's create, update and delete are the existing contact routes, unchanged.

**Patterns and Conventions.** Strategy (each rule a class, `BizumRuleSet` an ordered list); a pure domain judging a plain facts record, one repository class gathering it (Dependency Inversion: the domain never sees SQLite); value classes for folding and phones; `NameMatcher`'s comparison reused in spirit (`sensitivity: 'base'`) through `TextFolding`; the migration as F1's; table tests named by scenario identifiers in the work package only, never in shipped code comments.

**File Changes.**

- Create: `server/src/domain/bizum-rules.ts`, `text-folding.ts`, `keyword-list.ts`, `phone-key.ts`, `sender-suggestion.ts`, `sender-identification.ts`, `nearest-debt-order.ts`; `server/src/repo/bizum-facts-reader.ts`; `server/src/db/player-bizum-name-migration.ts`, `server/src/db/fixtures/schema-v3.sql`.
- Modify: `server/src/repo/debt-repository.ts`, `player-repository.ts`, `contact-repository.ts`, `player-merge-service.ts`; `server/src/db/schema.sql`, `schema-migrator.ts`, `db/index.ts`.
- Migrate: step 4, `PlayerBizumNameMigration`; `LATEST_SCHEMA_VERSION` 3 → 4.
- Tests: create one test module per created domain class, `bizum-facts-reader.test.ts`, `player-bizum-name-migration.test.ts`; extend `schema-migrator.test.ts`, `player-merge-service.test.ts`.

#### F4 — The Revolut dialect and the bank catalogue

**Current Implementation.** Nothing exists (`server/src/bank/` is created by F5 and F15). The evidence is the WP-005 guide, `verified — document`: a Revolut Bizum is `credit_debit_indicator = "CRDT"`, `status = "BOOK"`, and `remittance_information` of exactly two strings, the last starting `Bizum payment from: `; this matched exactly the 412 real Bizums, and 59 non-Bizum credits share `bank_transaction_code.code = "TOPUP"` (§6); the sender is the text after the prefix, an abbreviated name (392) or a `+`-prefixed phone number (20) (§6); the first string is the sender's message (§6); amounts are decimal text with a currency (§5); `booking_date` equals `value_date` for every Bizum (§6); a pending item may carry no `entry_reference` (§5); outgoing Bizums are `DBIT` (§6); Revolut is `name: "Revolut"` under `ES` (§4). The Mock returns the same 24 keys (sandbox guide §6). Account details give `currency` and `cash_account_type` (§4); the PoC kept only `uid` and `identification_hash` of each session account (`poc/local/session.json`, key structure only, read 2026-10-19), so **where the account's IBAN is exposed was never observed**.

**Approach.**

*`RevolutDialect`* (`server/src/bank/revolut-dialect.ts`) implements F2's `BizumDialect`: `id` `revolut`, `displayName` `Revolut`, `bank` `{name: 'Revolut', country: 'ES'}`. `recognise(raw, account)` decides in this order:

| # | The entry | Result |
| - | --------- | ------ |
| 1 | `status` is not `BOOK` | `ignore`, `pending`, no key (read again next time) |
| 2 | `credit_debit_indicator` is not `CRDT` | `ignore`, `not_a_bizum`, key if it has an `entry_reference` |
| 3 | `remittance_information` is not two strings, or the last does not start with `Bizum payment from: ` | `ignore`, `not_a_bizum`, key if it has one |
| 4 | no `entry_reference`, no `booking_date`, or an amount that is not decimal text with at most two decimals | `ignore`, `unidentified`, no key |
| 5 | otherwise | `bizum` |

A Bizum is built as: `key` = (`account.stableId`, `entry_reference`); `direction` `incoming`; `bookedOn` = `booking_date`; `amountCents` from the text, by parsing digits, never through a float (`"4.50"` → 450, `"12"` → 1200, `"0.5"` → 50); `currency` = `transaction_amount.currency`; `sender` = the text after the prefix, trimmed: a phone (`+` then digits and spaces, at least nine digits) goes to `sender.phone` with spaces removed, anything else to `sender.name`; `receiver` both null (Revolut does not name the holder); `subject` = the first string, blank → null (F2). Outgoing Bizums are never recognised as Bizums, because Revolut's outgoing format was never examined; they are `not_a_bizum`, which keeps nothing (UC-006-02-S2) and is the same outcome. `inferred`.

`describeAccount(raw)`: `stableId` = `identification_hash` (an account without one cannot be chosen: `describeAccount` throws and F5 leaves that account out), `sessionId` = `uid`, `currency` = `details.currency`, `kind` = `details.cash_account_type`, `last4` = the last four characters of `account_id.iban` from the session account or its details, **else** the last four of `identification_hash`. The IBAN's place is `assumed` (the API's account resource is documented with an `account_id`; not observed), and the fallback keeps the panel working if it is absent; the manual check below settles it.

*`BankCatalogue`* (`server/src/bank/bank-catalogue.ts`): constructed with the list of dialects; `list()` (id and display name, in order), `find(id)`, `defaultId()` (the first). The production composition passes `[new RevolutDialect()]`; tests pass `[new RevolutDialect(), new FakeBankDialect()]` (F15). Adding a bank on Enable Banking is one dialect class and one item in that list (2.2).

Worked by hand on guide §6's anonymised entry with `account.stableId = 'h1'` (`not yet run`): status `BOOK`, `CRDT`, remittance `["pachanga", "Bizum payment from: Marta G.L."]`, amount `"4.00"` EUR, booked `2026-01-15`, reference `r1` → a Bizum (`h1`, `r1`), 400 cents, sender name `Marta G.L.`, subject `pachanga`. The same with `"Bizum payment from: +34 600 000 000"` → `sender.phone = '+34600000000'`, name null. A `TOPUP` with remittance `["Dinero de …"]` (one string) → `not_a_bizum` with key. The same Bizum with `status: "PDNG"` and no reference → `pending`, no key.

*Manual Test Plan guidelines* (2.10): after the first real read, compare the number of Bizums the application kept or discarded since the start date with the count the guide's rule gives over the same days of the account (the PoC's `fetch` and `match` commands, run read-only); they must be equal. In the Banco panel, the four accounts must show their real currency, type and the last 4 of their IBAN (if they show the hash's last 4 instead, the IBAN is not exposed where assumed: record it and keep the fallback).

**Impacted Units.**

| Unit | Method | Action |
| ---- | ------ | ------ |
| `server/src/bank/revolut-dialect.ts` `RevolutDialect` | `recognise`, `describeAccount`; private `cents`, `sender` | Create |
| `server/src/bank/bank-catalogue.ts` `BankCatalogue` | `list`, `find`, `defaultId` | Create |
| `server/src/repo/index.ts` (or `ServerApp`, where F5 builds the bank parts) | the production catalogue | Modify |

**Test Methodology.** Tier 1 per 2.10. `revolut-dialect.test.ts`: the five rows of the table; the amount rows of UC-006-02-S5 and `"0.5"`, `"4.505"` (unidentified), `"-4.00"` (unidentified); a phone with and without spaces; blank message; the whole of F15's `entries.json` fixture with the expected counts of Bizums, non-Bizums, pending and unidentified (the same fixture the fake server serves, so the fake and the dialect agree); `describeAccount` with and without an IBAN. `bank-catalogue.test.ts`: order, default, unknown id. Tier 4 runs the dialect over the Mock's entries (F15). The manual plan above.

**Data Contract Verification.** Reads raw entries and accounts and returns F2's types; stores nothing. The `Bizum` it builds passes F2's constructor checks by construction (rows 4 and 5 make sure); a `Bizum` constructor error is therefore a bug, caught by the fixture test. `AccountChoice.last4` is display data only; the stable id is what F6 stores.

**Patterns and Conventions.** Adapter (anti-corruption: no other class reads a raw entry); a decision table as the method's order; exact decimal parsing for money; the catalogue as a list given at composition, so a bank is added without editing a branch (Open/Closed).

**File Changes.**

- Create: `server/src/bank/revolut-dialect.ts`, `bank-catalogue.ts`.
- Modify: the composition (production catalogue).
- Tests: `revolut-dialect.test.ts`, `bank-catalogue.test.ts`.

#### F5 — Connect, complete, renew, disconnect and expire the bank access

**Current Implementation.**

- **Mounting.** `ApiRoutes.router()` mounts one public router, then `Authenticate`, the session router, `/me`, and the admin router behind `requireEffective('admin')` (`server/src/routes/api-routes.ts`). `ServerApp` builds them; the public router is `AuthRouter`, the admin router the module-level `api` (`server/src/server-app.ts`). `verified — source`. A second public or admin router is mounted by composing it with the existing one in `ServerApp`; `ApiRoutes` does not change.
- **Settings.** `index.ts` reads `AuthConfig.fromEnv(process.env)` and passes the config to `ServerApp`; `AuthConfig` is a class with a named constructor from the environment (`server/src/repo/auth-config.ts`). `verified — source`. The deployment-settings test scans every non-test `.ts` under `server/src` (files named `*.test.ts` or containing `test-support` are skipped) for `env.X` reads, and fails on a name that neither the `Dockerfile`, the chart nor `LEFT_TO_APPLICATION_DEFAULT` accounts for (`server/src/deployment-settings.test.ts:98-140`). `verified — source`.
- **Headers.** `SecurityHeaders` already sets `Referrer-Policy: no-referrer` on every answer and `Cache-Control: no-store` on the API (`server/src/routes/security-headers.ts:7-11`), so neither the callback's query nor its answer is cached or passed on as a referrer. `verified — source`. Express logs nothing by itself, and the server adds no request logger (`server-app.ts`). `verified — source`.
- **Hashing.** `TokenService` stores refresh tokens as SHA-256 hex (`server/src/domain/token-service.ts:93`). `verified — source`. The pending authorisation's state follows that pattern.
- **The API** (WP-005 guide, `verified — document` unless marked): every call carries a fresh RS256 JWT (`typ: JWT`, `kid` = application id; `iss: enablebanking.com`, `aud: api.enablebanking.com`, `exp = iat + 3600`) (§3); `POST /auth` takes `access.valid_until` (RFC 3339, ≤ 180 days; 179 used), `aspsp {name, country}`, `state`, `redirect_url`, `psu_type: personal` and returns `url` (§4); the bank redirects to `redirect_url?state&code`, or with `error` and `error_description` (`verified — source`: the PoC reads both, `poc/ebpoc.py:86,131`); `POST /sessions {code}` returns `session_id` and `accounts` (each with `uid` and `identification_hash`), and `GET /sessions/{id}` returns `status` and `valid_until` (§4); `GET /accounts/{uid}/details` gives currency and `cash_account_type` (§4); `DELETE /sessions/{id}` closes a session (§7); an error answer is JSON with `error` (the code) and `message` (`verified — source`, `poc/ebpoc.py:71`); decide on the code, not the status (§7, §9). The Mock ends a short consent with 401 `EXPIRED_SESSION` while `GET /sessions/{id}` still says `AUTHORIZED` (sandbox guide §7).
- `jose` 6.2.12 signs RS256 from a PKCS#8 key (`importPKCS8`), and Node 26 has `fetch` and `AbortSignal.timeout` (§1 of this document). `verified — invocation`.

**Approach.** Four parts, each in its own layer:

| Part | Layer | Units |
| ---- | ----- | ----- |
| Talking to Enable Banking | Bank adapters | `EnableBankingConfig`, `EnableBankingToken`, `EnableBankingConnector` |
| Settings that are Pachanguero's | Integration, domain | `PublicUrl`, `ConnectionClock` |
| Remembering and deciding | Integration, repo | `BankAuthorizationRepository`, `BankConnectionRepository`, `BankConnectionService` |
| HTTP | HTTP | `BankCallbackRouter` (public), `BankAdminRouter` (admin) |

[Connecting and the redirect](design/diagrams/connect.puml) stays the sequence; this subsection fixes its details.

*Settings.* `EnableBankingConfig.fromEnv(env)` (`server/src/bank/enable-banking-config.ts`) reads `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` and `ENABLE_BANKING_API_URL` (default `https://api.enablebanking.com`); a key given on one line with `\n` escapes is unescaped. It never throws: `problems()` lists `app_id_missing`, `private_key_missing`, `private_key_invalid` (not PKCS#8 PEM; checked once at start by importing it). `PublicUrl.fromEnv(env)` (`server/src/domain/public-url.ts`) reads `PACHANGUERO_PUBLIC_URL`: absolute `https://…`, or `http://localhost[:port]` / `http://127.0.0.1[:port]`; no path, query or fragment; a trailing `/` is dropped; `problems()` lists `public_url_missing` or `public_url_invalid`; `callbackUrl()` is `<it>/api/bank/callback`. The panel shows each problem by the setting's name, never its value (UC-006-01-S2).

`ENABLE_BANKING_API_URL` is **new and amends 2.4 and 2.10** ("no setting is added"): the end-to-end tests run the real server process against `FakeEnableBankingServer` (F15), and a process can only be pointed at it from outside. It is listed in `LEFT_TO_APPLICATION_DEFAULT` ("the real host is the default; only the end-to-end tests set it") and not in the chart, so production cannot be pointed elsewhere by the chart. The sandbox suite does not need it: it builds the connector in-process. **Flagged to the author.**

*The token.* `EnableBankingToken` (`server/src/bank/enable-banking-token.ts`) holds the imported key and the application id and signs one token per call with the claims above (`iat` from the injected `Clock`). It is the only class that holds the key.

*The connector* (`server/src/bank/enable-banking-connector.ts`) implements F2's `BankConnector` over `fetch`, with a 30-second timeout per call:

| Method | Calls | Returns |
| ------ | ----- | ------- |
| `begin(redirectUrl, state, validUntil, bank)` | `POST /auth` | the bank's `url`, passed through unread |
| `complete(code)` | `POST /sessions`; `GET /sessions/{id}`; `GET /accounts/{uid}/details` per account | `{sessionId, validUntil, accounts}`, each raw account its session entry with its details under `details` |
| `close(sessionId)` | `DELETE /sessions/{id}` | — ; a session-ended answer counts as closed |
| `entries(account, dateFrom, {deep})` | `GET /accounts/{sessionId}/transactions?date_from=…[&strategy=longest][&continuation_key=…]`, following the key | each raw entry, page after page |

**Amends F2's port** in two ways. `entries` gains `{deep: boolean}`, so the feed (F7) can ask for `strategy=longest` on the first read of a session and the default after it (guide §5, `[docs]`). And the core gains one error type, so the core and the services react to a failure without knowing the aggregator:

```ts
// server/src/bizum/ports.ts (added)
export type BankFailure =
  | 'session_ended'          // re-authorise
  | 'rate_limited'           // wait until retryAfter
  | 'authorization_failed'   // the code was late, wrong or refused: start again
  | 'misconfigured'          // our registration or settings are wrong
  | 'rejected'               // the request was wrong (account, dates)
  | 'unavailable';           // network, timeout, 5xx
export class BankError extends Error {
  constructor(readonly failure: BankFailure, readonly code: string, readonly retryAfter: Date | null = null);
}
```

| Enable Banking answer | `failure` | `code` |
| --------------------- | --------- | ------ |
| `CLOSED_SESSION`, `EXPIRED_SESSION`, `REVOKED_SESSION` | `session_ended` | as received |
| `ASPSP_RATE_LIMIT_EXCEEDED` | `rate_limited`, `retryAfter` = now + 6 h (guide §8) | as received |
| `EXPIRED_AUTHORIZATION_CODE`, `WRONG_AUTHORIZATION_CODE` | `authorization_failed` | as received |
| `REDIRECT_URI_NOT_ALLOWED`, 401 with any other code, a settings problem | `misconfigured` | as received, or the problem |
| any other 4xx | `rejected` | the `error` field, or `HTTP_<status>` |
| 5xx, timeout, network failure, a body that is not JSON | `unavailable` | `HTTP_<status>`, `TIMEOUT`, `NETWORK` |

The error's message is `"<failure> <code>"`: never the URL, a header, a body, the token, the code or a session id (UC-006-01-S12).

*The pending authorisation* (`bank_authorizations`): the state is 32 random bytes in base64url; only its SHA-256 is stored. Rows: `state_hash` (primary key), `bank_id`, `purpose` (`connect`, `renew`), `created_at`, `expires_at` (+15 minutes, a constant), `used_at` (null until the callback). A used row stays until a day after it expired, so a second use reads "ya se usó" rather than "no reconocemos" (UC-006-01-S5); every `begin` deletes rows older than that.

*The connection* (`bank_connection`, at most one row, `id = 1`): `bank_id`, `session_id`, `valid_until` (ISO instant from `GET /sessions`), `state` (`connected`, `reconnect_needed`), `reason` (the `BankError` code, or `EXPIRED` for a passed date), `connected_at`, `accounts_json` (F2's `AccountChoice[]`, from `dialect.describeAccount` of each raw account: stable id, session id, currency, kind, last 4). Only that summary is stored, never the raw account or a holder's name (UC-006-01-S7). The session id is stored as is: every read needs it; the database and its backups hold it (accepted, UC-006-01-S12).

*`BankConnectionService`* (`server/src/repo/bank-connection-service.ts`): constructed with the connector and dialect ports, the two repositories, `PublicUrl`, a `SetupCheck` (the problems of `EnableBankingConfig` and `PublicUrl` together, so the service never names Enable Banking), a `BankChoice` (`current(): BizumDialect | null`, implemented by F6; until then the composition passes the catalogue's default), the `Clock`, and a `StateSource` (random state).

| Operation | Does | Refuses with |
| --------- | ---- | ------------ |
| `panel()` | setup problems, chosen bank, connection state with `validUntil`, `daysLeft`, `renewSuggested`, `reason`, the accounts as currency/kind/last 4/stable id | — |
| `connect()` | if a connection is stored, `purpose = renew`; new state; row stored; `begin(callbackUrl, state, now + 179 days, dialect.bank)`; returns the bank's URL | setup problems (`"Falta configurar: …"`); no supported bank chosen; `misconfigured` (e.g. `"La dirección de vuelta no está registrada en el banco"`) |
| `complete(state, code \| error)` | outcome codes below; on success `complete(code)`, accounts described, row written; for `renew`, the old session is closed **after** the new row is written, and a failure to close it is ignored (it ends by itself) | never throws: every failure is an outcome |
| `disconnect()` | `close(session)`; the row deleted; with the bank unreachable, the row is deleted anyway and the answer says the bank was not told (`closed_locally`) | nothing stored |
| `markEnded(error)` | used by the feed (F7): `session_ended` → `reconnect_needed` with the code | — |
| `banner()` | `{show, state, daysLeft}`: shown when connected with 14 days or fewer left, or `reconnect_needed` | — |

Callback outcomes (each a fixed code; the SPA turns it into the Spanish message, F12):

| Situation | Code |
| --------- | ---- |
| success | `connected` |
| no row for the state's hash | `unknown_state` |
| row already used | `already_used` |
| row expired | `expired` |
| `error=access_denied` | `denied` |
| any other `error` | `bank_error` |
| `complete` failed with `authorization_failed` | `code_rejected` |
| `complete` failed otherwise | `failed` |
| no `state` | `unknown_state` |

The row is marked used **before** the exchange, so a replayed callback cannot exchange twice even while the first is in flight.

*`ConnectionClock`* (`server/src/domain/connection-clock.ts`): from `validUntil` and `now`, `daysLeft` (whole days, rounded up, never below 0), `renewSuggested` (`daysLeft ≤ 14`), `passed` (`now ≥ validUntil`). A connection whose date has passed reads as `reconnect_needed` with reason `EXPIRED` without waiting for a failed read. The constants: 179 days of consent (one under the bank's 180, as in WP-005), 15 minutes for a pending authorisation, 14 days for the banner (author decision).

*Routes.* `BankCallbackRouter` (public): `GET /bank/callback` reads `state`, `code`, `error` (each at most 1 024 characters), calls `complete`, and answers **302 to the relative `/?bank=<code>`**: the callback is on the application's own address, so a relative redirect needs no setting and cannot be turned into an open redirect. `BankAdminRouter` (admin): `GET /bank` (the panel), `POST /bank/connect` (`{url}`), `POST /bank/disconnect` (the panel), `GET /bank/banner`. F6 adds the settings routes to the same router and F7 adds `POST /bank/read`. `ServerApp` composes the callback router after `AuthRouter` in the public router, and the bank router beside `api` in the admin router.

Worked by hand (`not yet run`; `PACHANGUERO_PUBLIC_URL=https://pachanguero.duckdns.org`, today 2026-10-19 10:00): `POST /api/bank/connect` → a state `s`, a row `sha256(s)`, `connect`, expiring 10:15 → `POST /auth` with `redirect_url` `https://pachanguero.duckdns.org/api/bank/callback`, `valid_until` 2027-04-16T10:00:00Z → `{url}`. At 10:03, `GET /api/bank/callback?state=s&code=c` → row marked used → `POST /sessions` → `GET /sessions/{id}` gives 2027-04-16 → accounts described → row written → 302 `/?bank=connected`; the panel reads "Conectado hasta 16/04/2027", `daysLeft` 179. The same URL again → 302 `/?bank=already_used`. A state never issued → `unknown_state`. At 10:20 with a fresh, unused state from 10:00 → `expired`. On 2027-04-02, `daysLeft` 14 → banner shown, "Renovar" primary.

*Manual Test Plan guidelines* (F5 is not fully automatable, 2.10). Against the real Revolut account, from the deployed panel: (1) press "Conectar con Revolut" on a desktop browser, approve in the Revolut app, and see the panel return to "Conectado hasta <date about 179 days ahead>", with the four accounts summarised and nothing else shown; (2) press "Renovar" and approve: the end date moves, and in the Enable Banking Control Panel the old session shows closed; (3) press "Desconectar" and confirm: the panel reads "Sin conexión" and the session shows closed; (4) after each step, the server log holds no code, state, token or session id.

**Impacted Units.**

| Unit | Method / part | Action |
| ---- | ------------- | ------ |
| `server/src/bizum/ports.ts` | `BankFailure`, `BankError`; `entries(…, {deep})` | Modify (F2) |
| `server/src/bank/enable-banking-config.ts` `EnableBankingConfig` | `fromEnv`, `problems`, `appId`, `apiUrl`, `privateKey` | Create |
| `server/src/bank/enable-banking-token.ts` `EnableBankingToken` | `sign` | Create |
| `server/src/bank/enable-banking-connector.ts` `EnableBankingConnector` | the four port methods; private `call`, `failure` (the mapping table) | Create |
| `server/src/domain/public-url.ts` `PublicUrl` | `fromEnv`, `problems`, `callbackUrl` | Create |
| `server/src/domain/connection-clock.ts` `ConnectionClock` | `daysLeft`, `renewSuggested`, `passed` | Create |
| `server/src/repo/bank-authorization-repository.ts` `BankAuthorizationRepository` | `create`, `findByHash`, `markUsed`, `deleteStale` | Create |
| `server/src/repo/bank-connection-repository.ts` `BankConnectionRepository` | `get`, `save`, `markReconnectNeeded`, `delete` | Create |
| `server/src/repo/bank-connection-service.ts` `BankConnectionService`, `SetupCheck`, `BankChoice`, `StateSource` | `panel`, `connect`, `complete`, `disconnect`, `markEnded`, `banner` | Create |
| `server/src/routes/bank-callback-router.ts` `BankCallbackRouter` | `router` | Create |
| `server/src/routes/bank-admin-router.ts` `BankAdminRouter` | `router` | Create |
| `server/src/server-app.ts` `ServerApp` | takes the bank settings; builds the service; composes both routers | Modify |
| `server/src/index.ts` | reads `EnableBankingConfig.fromEnv`, `PublicUrl.fromEnv` | Modify |
| `server/src/db/schema.sql` | `bank_authorizations`, `bank_connection` | Modify |
| `server/src/deployment-settings.test.ts` | `ENABLE_BANKING_API_URL` in `LEFT_TO_APPLICATION_DEFAULT` | Modify |

**Test Methodology.** Tiers 1–3 per 2.10; the manual plan above.

- Unit: `public-url.test.ts` (each accepted and refused form), `connection-clock.test.ts` (days left across midnight and on the day, 14 and 15 days, passed), `enable-banking-config.test.ts` (missing, escaped key, invalid key, default API URL), `enable-banking-token.test.ts` (header and claims, verified with the public half of a key made in the test).
- Contract: `EnableBankingConnector` against `FakeEnableBankingServer` through `BankConnectorContract` (F15), including every row of the error mapping the fake can produce.
- Service: `bank-connection-service.test.ts` on real SQLite with `FakeBankConnector` and `FakeBankDialect` (F15) and a `ManualClock`: every row of the outcome table; renewal closes the old session after the new row exists and survives a failing close; disconnect with the bank down; `markEnded`; the passed date; the state stored hashed (the raw state is absent from the table).
- Routes: `bank-callback-router.test.ts` (no login needed; 302 to the relative address with only the code; a long parameter refused) and `bank-admin-router.test.ts` (403 for a player and for an admin viewing as a player, UC-006-01 "Where"; the panel and banner answers).
- Secrets: one test runs connect, callback, panel and disconnect against the fake while capturing `console` output, and asserts that no response body, header or log line contains the private key, a token, the code, the state or the session id (UC-006-01-S12).
- E2E: the panel journey is F12's; it runs over the wiring F15 provides.

**Data Contract Verification.**

| Data | Written by | Stored as | Read by | Checks |
| ---- | ---------- | --------- | ------- | ------ |
| Pending authorisation | `connect` | `bank_authorizations` row; `state_hash` hex, ISO instants | `complete` via `findByHash(sha256(state))` | a state that is not base64url, or too long, has no row (`unknown_state`); expiry compared as instants |
| Connection | `complete`, `markEnded`, `disconnect` | `bank_connection` row 1; `accounts_json` a JSON array of `AccountChoice` | `panel`, `banner`, the feed (F7: session id, the chosen account's session id) | `accounts_json` parsed and each entry checked to have the five fields; a broken row reads as no connection and is logged by code only |
| Bank's URL | `begin` | not stored | the SPA navigates to it | must be `https:`, else `misconfigured` |
| Callback outcome | `complete` | not stored | the SPA from `?bank=` | one of nine fixed codes |

Create, read and delete are above; the connection is updated only by renewal (replaced whole) and `markEnded`. Accounts are replaced at each renewal; the account chosen to read (F6) is kept by stable id, so it survives.

**Patterns and Conventions.** Adapter (the connector translates Enable Banking into the core's ports and errors); configuration as classes with a named constructor from the environment, like `AuthConfig`, that report problems rather than stop the server (VISION §5: manual payments must keep working); a one-row table with `CHECK (id = 1)`; secrets held by one class; routers as classes with `.router()` like `AuthRouter`; fixed outcome codes over the wire and Spanish only in the SPA.

**File Changes.**

- Create: `server/src/bank/enable-banking-config.ts`, `enable-banking-token.ts`, `enable-banking-connector.ts`; `server/src/domain/public-url.ts`, `connection-clock.ts`; `server/src/repo/bank-authorization-repository.ts`, `bank-connection-repository.ts`, `bank-connection-service.ts`; `server/src/routes/bank-callback-router.ts`, `bank-admin-router.ts`.
- Modify: `server/src/bizum/ports.ts`; `server/src/db/schema.sql` (two tables, no migration step); `server/src/server-app.ts`, `server/src/index.ts`; `server/src/deployment-settings.test.ts`.
- Tests: the modules named in Test Methodology.

#### F6 — The reading settings: bank, currency, account, start date, keyword lists

**Current Implementation.** Nothing stores these yet. F5 stores the connection's accounts as `AccountChoice[]` (stable id, session id, currency, kind, last 4) and asks a `BankChoice` port for the chosen dialect; F3 asks a `KeywordSource` port for the two lists; F7's feed will need the account to read and the start date. `verified — source` (this document, F3 and F5). The requirements fix the behaviour (UC-006-01-S6, S7, S14, S15; UC-006-09-S1, S2): currency defaults to EUR; the bank is chosen from the catalogue and fixed while connected; the include list starts as `pachanga`, `futbol`, `fútbol`, `fubol`, and the exclude list empty; nothing is read until a start date and an account exist.

**Approach.**

*Storage* (new tables in `schema.sql`, no migration step):

```sql
CREATE TABLE IF NOT EXISTS bank_settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  bank_id           TEXT,                       -- null: not chosen yet; the catalogue's default is offered
  currency          TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3),
  account_stable_id TEXT,                       -- the chosen account; survives renewals
  start_date        TEXT                        -- YYYY-MM-DD; null: not set
);
CREATE TABLE IF NOT EXISTS bank_keywords (
  list TEXT NOT NULL CHECK (list IN ('include', 'exclude')),
  word TEXT NOT NULL,                           -- as the organiser typed it; compared folded (F3)
  PRIMARY KEY (list, word)
);
```

**Amends 2.4**, which said words are "stored folded": they are stored as typed, because the initial list holds both `futbol` and `fútbol` (UC-006-01-S14), which folding would merge; F3's `KeywordList` folds when comparing, so both match the same subjects. A second word that folds to one already in the same list is refused (`"Ya está en la lista"`), except for the four initial words.

The initial words must be written **once**: a seed in `schema.sql` would run on every start and bring back a word the organiser removed. `BankSettingsRepository.ensure()` creates the settings row and the initial include words in one transaction, the first time anything reads the settings, and only when the row does not exist.

*Which account is read* (`server/src/domain/account-selection.ts`, `AccountSelection`), from the connection's accounts, the currency and the stored choice:

| The accounts in that currency | Stored choice | Result |
| ----------------------------- | ------------- | ------ |
| none | any | `none_in_currency` (UC-006-01-S7 row CHF) |
| one | any or none | that account (S7 row USD; the choice is not written, so changing currency later still works) |
| two or more | one of them | that account |
| two or more | none, or not one of them | `choose` (S6, S7 row EUR) |
| no connection | any | `not_connected` |

The stored choice is kept when the currency changes; it simply stops applying until the currency matches again.

*Ready to read* (`server/src/domain/reading-readiness.ts`, `ReadingReadiness`): ready when the connection is `connected` and not passed (F5's `ConnectionClock`), the selection gives an account, and a start date is set; otherwise the list of what is missing, in this order: `not_connected`, `reconnect_needed`, `no_start_date`, `choose_account`, `no_account_in_currency`. The feed (F7) reads nothing unless ready (UC-006-09-S2), and the "Leer ahora" buttons are hidden unless ready (UC-006-02-S10).

*`BankSettingsService`* (`server/src/repo/bank-settings-service.ts`) implements `BankChoice` (for F5) and owns the rules of change; `KeywordRepository` implements `KeywordSource` (for F3).

| Change | Accepted when | Refused with |
| ------ | ------------- | ------------ |
| bank | the id is in the catalogue and no connection is stored (S15) | `"Desconecta antes de cambiar de banco"`; `"Banco no disponible"` |
| currency | three letters, upper-cased on the way in | `"Moneda no válida"` |
| account | its stable id is among the connection's accounts in the current currency | `"Esa cuenta no está entre las de la conexión"` |
| start date | a real `YYYY-MM-DD`, not after today (a future date would make every read fail, `DATE_FROM_IN_FUTURE`) | `"Fecha no válida"`; `"La fecha no puede ser futura"` |
| words | each non-blank, at most 40 characters, not a folded duplicate in its list | `"Palabra no válida"`; `"Ya está en la lista"` |

`current()` (the `BankChoice`): the stored bank's dialect, the catalogue's default when none is stored, and **null** when the stored id is no longer in the catalogue (S15 row 3: the connect button is disabled). The start date may be changed at any time (UC-006-09, left to implementation by the author); the ledger (F7) makes a move backwards harmless, and a move forwards only stops older entries from being read.

*Routes* (added to F5's `BankAdminRouter`): `PUT /bank/settings` with any of `{bankId, currency, accountStableId, startDate}`; `PUT /bank/words` with `{include: string[], exclude: string[]}`, the whole lists (2.4). Both answer the panel. `GET /bank` (F5's panel) gains: `bank` (`chosenId`, `options`, `editable`), `currency`, each account with `chosen`, `selection` (the table's result), `startDate`, `words`, `readiness`.

Worked by hand (`not yet run`): first read of the panel → row created with currency EUR, the four include words; connection with EUR, USD, GBP, EUR → `choose`; the organiser chooses the second EUR → stored, selection is it, readiness lacks `no_start_date`; start date 2026-09-01 → ready. Currency USD → selection the USD account, nothing written. Currency CHF → `none_in_currency`, not ready. Bank change while connected → refused. Words `{include: ['pachanga', 'Pachanga']}` → refused, duplicate when folded.

**Impacted Units.**

| Unit | Method | Action |
| ---- | ------ | ------ |
| `server/src/domain/account-selection.ts` `AccountSelection` | `select` | Create |
| `server/src/domain/reading-readiness.ts` `ReadingReadiness` | `missing`, `ready` | Create |
| `server/src/repo/bank-settings-repository.ts` `BankSettingsRepository` | `ensure`, `get`, `update` | Create |
| `server/src/repo/keyword-repository.ts` `KeywordRepository` | `include`, `exclude`, `replace` | Create |
| `server/src/repo/bank-settings-service.ts` `BankSettingsService` | `current`, `readingAccount`, `readiness`, `update`, `replaceWords`, `panelPart` | Create |
| `server/src/routes/bank-admin-router.ts` `BankAdminRouter` | the two `PUT` routes; the panel gains F6's part | Modify (F5) |
| `server/src/db/schema.sql` | `bank_settings`, `bank_keywords` | Modify |
| composition (`ServerApp`) | `BankSettingsService` as F5's `BankChoice`; `KeywordRepository` as F3's `KeywordSource` | Modify |

**Test Methodology.** Tiers 1–2 per 2.10. Fully automatable. `account-selection.test.ts` (the table, with UC-006-01-S6/S7's four accounts), `reading-readiness.test.ts` (each missing item and the order), `bank-settings-service.test.ts` on real SQLite (every row of the change table; the initial words written once and not restored after removal; `current()` for none, stored and unsupported), and route tests for both `PUT`s (refusals as 400 with the message; 403 for a player and for an admin viewing as a player).

**Data Contract Verification.**

| Data | Written by | Stored as | Read by | Checks |
| ---- | ---------- | --------- | ------- | ------ |
| bank | `update` | `bank_settings.bank_id` | `current()` → F5 (`connect`), the panel | an id the catalogue lost reads as null, not an error |
| currency | `update` | three upper-case letters | `AccountSelection`; compared with `AccountChoice.currency` (F4 reads it from the bank, upper-case) | the `CHECK` and the service agree |
| account | `update` | the stable id | `readingAccount()` → F7 (with the session id from F5's row) | a stable id missing after a renewal reads as `choose`, never as a wrong account |
| start date | `update` | `YYYY-MM-DD` | F7 (`date_from`, and the booked-on check) | compared as text, like every date |
| words | `replaceWords`, `ensure` | as typed | `KeywordRepository` → F3's `KeywordList` (folds) | create (add), read, update (replace the list), delete (leave it out) all through `PUT /bank/words` |

**Patterns and Conventions.** A one-row settings table with `CHECK (id = 1)`, like F5's; derived state computed, not stored (the selection, the readiness), so nothing can go stale; the service implements the ports other elements declared (Dependency Inversion); a seed written by code once, never by `schema.sql`.

**File Changes.**

- Create: `server/src/domain/account-selection.ts`, `reading-readiness.ts`; `server/src/repo/bank-settings-repository.ts`, `keyword-repository.ts`, `bank-settings-service.ts`.
- Modify: `server/src/db/schema.sql`; `server/src/routes/bank-admin-router.ts`; the composition.
- Tests: one module per created class, and the routes' tests.

#### F7 — The feed: scheduled and forced read, once-only ledger, keep or forget, automatic settlement

**Current Implementation.**

- The server has no timer of any kind today (`grep -rn "setTimeout\|setInterval" server/src`, non-test files: none, 2026-10-19). `verified — invocation`. `index.ts` opens the database, builds `ServerApp` and listens (`server/src/index.ts`). `verified — source`.
- better-sqlite3 transactions are synchronous: `conn.transaction(fn)` must not await inside `fn`. Every service already runs its writes that way (`PaymentService.pay`, `GameLifecycleService.perform`). `verified — source`. A read from the bank is asynchronous (F5's connector), so network and database work alternate: fetch, then write synchronously.
- What this element builds on: F2's model and ports (`Bizum`, `BizumKey`, `BizumDialect`, `BankConnector` with `{deep}`, `BizumPolicy`, `BizumStore`, `BankError`, `Clock`); F3's `BizumFactsReader` and `BizumRuleSet` (`judge(facts, 'new')`); F5's connection (session, accounts, `markEnded`); F6's `readingAccount()`, start date and `ReadingReadiness`; R1's `ShareSettler` (no transaction of its own) with F1's `method` on `Settlement`. `verified — source` (this document).
- A new file never runs migration steps: `SchemaMigrator.run` gives it `schema.sql` and stamps the latest version (`server/src/db/schema-migrator.ts:40-42`). `verified — source`. **This falsifies F1's rule** that an index on a step-added column "is created in that step": a new file would never get it. Corrected in F1 and 2.9: no index on a step-added column is planned, and adding one later needs a change to the migrator.

**Approach.** The core reads, remembers and asks; the integration judges and settles. Every entry is handled in **one transaction**: its ledger row, the kept Bizum, its handling row and any payments commit together or not at all. That is what "processed exactly once" rests on.

*Core, `server/src/bizum/`.*

```ts
/** Where one read comes from; given by the application for each read. */
export interface FeedSource {
  connector: BankConnector; dialect: BizumDialect;
  account: AccountRef; dateFrom: string; deep: boolean;
}
export interface UnitOfWork { run<T>(work: () => T): T }            // one synchronous transaction
export interface BankEntryLedger {
  has(key: BizumKey): boolean;
  remember(key: BizumKey, outcome: 'kept' | 'discarded' | 'not_bizum'): void;
  dismiss(key: BizumKey): void;                                       // F8: kept → dismissed
}
export interface ReadCounts { entries: number; kept: number; discarded: number; notBizum: number;
                              pending: number; unidentified: number; known: number }

export class BizumFeed {
  constructor(policy: BizumPolicy, store: BizumStore, ledger: BankEntryLedger, work: UnitOfWork);
  read(source: FeedSource): Promise<ReadCounts>;    // throws BankError; what was handled stays handled
}
```

`read`: 1) collect every raw entry of every page (`connector.entries(account, dateFrom, {deep})`); 2) recognise each with the dialect; 3) handle them **oldest booking first**, then by reference, so two Bizums competing for one player's debts settle in a fixed order (the rule of UC-006-10-S4, applied to reads too); 4) each in `work.run`:

| Recognised | In the ledger? | Done | Ledger |
| ---------- | -------------- | ---- | ------ |
| `ignore`, `pending` | — | nothing (read again once booked) | nothing |
| `ignore`, `unidentified` | — | counted | nothing |
| `ignore`, `not_a_bizum`, with key | no | — | `not_bizum` |
| any, with a key already there | yes | counted as `known`, nothing else | unchanged |
| `bizum`, booked before `dateFrom` | — | nothing (a start date moved back later can still read it) | nothing |
| `bizum`, `policy.judge` → `discard` | no | nothing kept | `discarded` |
| `bizum`, `policy.judge` → `keep` | no | `store.save`, then `afterKept(stored)` | `kept` |

Collecting first means a failure on page 3 handles nothing of that read; the next read handles everything, because nothing was remembered (UC-006-02-S7). The cost is holding one read in memory: the PoC's 13 months were 979 entries (guide §5).

*`BankPoller`* (`server/src/bizum/bank-poller.ts`): one read at a time, on a schedule or on request.

```ts
export interface FeedSourceProvider {
  source(): FeedSource | null;                // null: not ready to read (F6's readiness)
  succeeded(source: FeedSource): void;        // e.g. the deep read of a session is done
  failed(error: BankError): void;             // e.g. a session_ended marks the connection
}
export interface Scheduler { after(ms: number, task: () => void): () => void }   // returns cancel
export type ReadRefusal =
  | { code: 'in_progress' } | { code: 'too_soon'; until: Date }
  | { code: 'rate_limited'; until: Date } | { code: 'not_ready' };
export class BankPoller {
  constructor(feed: BizumFeed, provider: FeedSourceProvider, state: FeedStateStore,
              clock: Clock, scheduler: Scheduler);
  start(): void;                                              // first read 1 minute after start, if due
  requestRead(): Promise<ReadCounts | ReadRefusal>;          // "Leer ahora"
}
```

| Constant | Value | Source |
| -------- | ----- | ------ |
| interval | 6 h from the end of the last read | 2.9; ≤ 4 background reads a day (guide §8) |
| minimum gap | 5 min from the end of one read to the start of the next | UC-006-02-S10 |
| after a rate limit | until `retryAfter` (6 h) | guide §8 |
| start-up delay | 1 min | so a restart does not read before the server is listening |

A scheduled read due while not ready records nothing and tries at the next interval. `requestRead` refuses in this order: `in_progress`, `rate_limited`, `too_soon`, `not_ready`, each with the time it ends where there is one (UC-006-02-S10). A forced read moves the next scheduled read to 6 hours after its end. The schedule survives a restart because the last read's times are stored: on start, the next read is due at `last finished + 6 h`, or after the start-up delay if that has passed (UC-006-02-S8).

*Core storage, `server/src/bizum/sqlite/`* (new tables in `schema.sql`; no Pachanguero column):

| Table | Columns | Notes |
| ----- | ------- | ----- |
| `bizum_entries` | `account`, `reference`, `outcome` (`kept`, `discarded`, `not_bizum`, `dismissed`), `recorded_at` | primary key (`account`, `reference`); only the bank's identifiers, no personal data (D-2) |
| `bizums` | `id`, `account`, `reference` (unique together), `direction`, `booked_on`, `amount_cents` (> 0), `currency`, `sender_name`, `sender_phone`, `receiver_name`, `receiver_phone`, `subject`, `kept_at` | F2's model, one column per field |
| `bizum_feed_state` | `id = 1`, `started_at`, `finished_at`, `result` (`ok` or a `BankFailure`), `code`, the seven counts, `rate_limited_until` | codes and counts only |

Classes: `SqliteBizumStore` (`BizumStore`), `SqliteBankEntryLedger` (`BankEntryLedger`), `SqliteFeedStateStore` (`FeedStateStore`), `SqliteUnitOfWork` (`UnitOfWork`, over `conn.transaction`). They are built with a `Database` and import only `better-sqlite3` (F2's boundary).

*Integration, `server/src/repo/`.*

- **`BizumHandler`** implements `BizumPolicy`. `judge(bizum)`: an outgoing Bizum, or one in another currency than F6's, is `discard`. Otherwise `facts = factsReader.read(bizum)`, `verdict = rules.judge(facts, 'new')`. A discard verdict is `discard`; settle and wait are `keep`, with `afterKept(stored)` calling `BizumSettlementService.apply(stored, verdict)`. The facts are read inside the entry's transaction, so they include what the Bizums before it in the same read settled.
- **`BizumSettlementService`** writes what a verdict means for a kept Bizum. F8, F9 and F10 call the same methods, so a Bizum cannot be settled two ways (2.5).
  - `apply(stored, verdict)`: `settle` → `settle(stored, playerId, shares, 'automatic')`; `wait` → `wait(stored, reason, sender)`.
  - `settle(stored, playerId, shares, how)`: if the debts' amounts add up to more than the Bizum, nothing is paid and it waits with reason `amounts_differ` (only if a season's share changed after billing). Otherwise, for each share, `settler.settle(gameId, member, {payerPlayerId: playerId, paidOn: bizum.bookedOn, method: 'bizum', bizumId: stored.id})`; then the handling row becomes `settled`, with `how` and `unallocated_cents` = amount − sum of the shares paid.
  - `wait(stored, reason, sender)`: writes or replaces the handling row as `waiting`, with the reason as JSON.
- **`bizum_handling`** (integration table): `bizum_id` (primary key, references `bizums` with `ON DELETE CASCADE`), `status` (`waiting`, `settled`), `reason_json` (`WaitReason` plus the sender identity; null when settled), `unallocated_cents` (≥ 0, default 0), `settled_how` (`automatic`, `organiser`; null while waiting), `updated_at`.
- **`payments.bizum_id`**, step 5 (`PaymentBizumLinkMigration`): `ALTER TABLE payments ADD COLUMN bizum_id INTEGER REFERENCES bizums(id)`, nullable, no index. The same column is last in `payments` in `schema.sql`, and `LATEST_SCHEMA_VERSION` goes to 5. `bizums` exists before the step runs, because `schema.sql` runs first. `Settlement` and `PaymentRepository.append` gain an optional `bizumId`. A manual payment leaves it null (UC-006-07-S3).
- **`BankFeedSource`** implements `FeedSourceProvider` from F5 and F6:
  - `source()` returns null unless F6's readiness is ready; otherwise the connector, the chosen dialect, the account (stable id from F6, session id from F5's row), the start date, and `deep` = this session has not been read in full yet.
  - `succeeded` marks the session read in full.
  - `failed` hands a `session_ended` to `BankConnectionService.markEnded` (UC-006-01-S11).
  - This **amends F5's `bank_connection`**: a column `deep_read_done INTEGER NOT NULL DEFAULT 0`, reset when a session is stored.
- **Route** (F5's `BankAdminRouter`): `POST /bank/read` → `poller.requestRead()`. It answers 200 with the counts, or 409 with `{refusal, until}`. The answer comes when the read ends; at most a few seconds for hundreds of entries.
- **Panel** (F5's `GET /bank`) gains `lastRead`: the times, the result code, the counts, `rateLimitedUntil`, `nextAt`.
- **Start**: `ServerApp` builds the poller with a `TimerScheduler` (`setTimeout`, `unref`'d so it never keeps a test process alive), and `index.ts` calls `start()` after `listen`. Route tests build `ServerApp` without starting it.
- **Log**: one line per read, codes and counts only, e.g. `bank read ok: 214 entries, 3 kept, 1 discarded` or `bank read failed: session_ended CLOSED_SESSION`. Never a name, a subject, an amount or an identifier (F5's rule on private data).

Worked by hand (`not yet run`; share 400; `Luis P.R.` is the Bizum name of Luis alone, with open shares on 09-30 and 10-07; start date 2026-09-01; no exclude words). A read returns, newest first: a Bizum of 800 from `Luis P.R.` booked 10-12 (`r3`), a `TOPUP` "Dinero de …" (`r2`), and a Bizum of 450 from `Marta G.L.` with subject `cena?` booked 10-10 (`r1`). Handled oldest first:

1. `r1`: R1 no (no exclude words); R2 no; Marta is unknown; R5 no; R6 yes, so it is discarded. Ledger `discarded`; nothing kept.
2. `r2`: `not_a_bizum`, ledger `not_bizum`.
3. `r3`: R3 settles the 10-07 and 09-30 shares, both paid 10-12 with method `bizum` and `bizum_id` = its id. Handling `settled`, `automatic`, unallocated 0; ledger `kept`.

A second read at once is refused as `too_soon`. A read 6 hours later returns the same three entries: all three are `known`, and nothing changes (UC-006-02-S3).

*Manual Test Plan guidelines* (2.10): on the deployed app, with the real account connected and the setup complete, press "Leer ahora" in the Banco panel. The Bizums booked since the start date appear as payments with method Bizum, or in "Bizums en espera"; the panel shows the new last-read time with its counts. Press it again at once: it says to wait a few minutes. After the gap, press it again: the counts show every entry as known and nothing new is listed or paid. The server log holds codes and counts only.

**Impacted Units.**

| Unit | Method / part | Action |
| ---- | ------------- | ------ |
| `server/src/bizum/feed.ts` `BizumFeed`, `FeedSource`, `UnitOfWork`, `BankEntryLedger`, `ReadCounts` | `read` | Create |
| `server/src/bizum/bank-poller.ts` `BankPoller`, `FeedSourceProvider`, `Scheduler`, `FeedStateStore`, `ReadRefusal` | `start`, `requestRead`; private `due`, `run` | Create |
| `server/src/bizum/sqlite/` `SqliteBizumStore`, `SqliteBankEntryLedger`, `SqliteFeedStateStore`, `SqliteUnitOfWork` | the port methods | Create |
| `server/src/bizum/timer-scheduler.ts` `TimerScheduler` | `after` | Create |
| `server/src/repo/bizum-handler.ts` `BizumHandler` | `judge` | Create |
| `server/src/repo/bizum-settlement-service.ts` `BizumSettlementService` | `apply`, `settle`, `wait` | Create |
| `server/src/repo/bizum-handling-repository.ts` `BizumHandlingRepository` | `get`, `markWaiting`, `markSettled`, `waiting` (for F8) | Create |
| `server/src/repo/bank-feed-source.ts` `BankFeedSource` | `source`, `succeeded`, `failed` | Create |
| `server/src/repo/share-settler.ts` `Settlement` | `bizumId?` | Modify (R1, F1) |
| `server/src/repo/payment-repository.ts` `PaymentRow`, `append` | `bizum_id` | Modify |
| `server/src/repo/bank-connection-repository.ts` | `deep_read_done` | Modify (F5) |
| `server/src/routes/bank-admin-router.ts` | `POST /bank/read`; `lastRead` in the panel | Modify (F5) |
| `server/src/server-app.ts`, `server/src/index.ts` | build the poller; `start()` after `listen` | Modify |
| `server/src/db/schema.sql` | `bizum_entries`, `bizums`, `bizum_feed_state`, `bizum_handling`; `payments.bizum_id`; `bank_connection.deep_read_done` | Modify |
| `server/src/db/payment-bizum-link-migration.ts` `PaymentBizumLinkMigration`; `schema-migrator.ts`, `db/index.ts` | version 5 | Create / Modify |
| `server/src/db/fixtures/schema-v4.sql` | `schema.sql` as F3 leaves it | Create |

**Test Methodology.** Tiers 1–4 per 2.10; the manual plan above.

- Core, on a real SQLite file through the `sqlite/` classes, with `FakeBankConnector`, `FakeBankDialect` and a scripted policy: each row of the handling table; oldest-first order; a failure on page 2 leaves nothing remembered and a second read handles all; the same entries read twice give all `known`; a policy that throws inside `afterKept` rolls back the store and the ledger for that entry only (the entries before it stay handled).
- Poller, with `ManualClock` and a manual `Scheduler`: start-up timing from a stored last read; the 6-hour interval; each refusal of `requestRead` and its `until`; one read at a time when a forced read meets a scheduled one; `rate_limited` holds until `retryAfter`; `session_ended` reaches the provider.
- Integration, through `GameFlow` with the real `BizumHandler`, `BizumFactsReader`, `BizumRuleSet` and `RevolutDialect` over F15's fixture: the worked example above; UC-006-02-S1, S2 (each row), S3 (each row, including a renewed session with new `uid`s and the same hashes), S4, S5, S6 (a fixture of 150 Bizums over two pages), S7; UC-006-03-S5 (method, link, date); S6 (no debt yet, so it waits); `amounts_differ`; every payment row has `method = 'bizum'` and its `bizum_id`, and every share is in debts or payments, never both.
- Route: `POST /bank/read` 200 and 409 with each refusal; 403 for a player and for "Ver como jugador".
- Migration: `payment-bizum-link-migration.test.ts`, and a `schema-migrator.test.ts` case from `fixtures/schema-v4.sql` (as F1's).
- Secrets and privacy: the log of an integration run over the fixture contains no sender, subject, amount or reference (F5's capture test, extended).
- Sandbox suite (F15) gains two read-only cases: the ledger across two reads (the second all `known`), and the start date (entries before it are not handled).

**Data Contract Verification.**

| Data | Written by | Stored as | Read by | Checks |
| ---- | ---------- | --------- | ------- | ------ |
| Kept Bizum | `BizumFeed` → `SqliteBizumStore.save` | `bizums` row, one column per field, `amount_cents` integer | `find` → `new Bizum(...)` (F2's checks); F8, F11, F13 | a row the constructor refuses throws (corruption, never silent) |
| Ledger | `BizumFeed`; F8 (`dismiss`) | (`account`, `reference`, `outcome`) | `has` before every entry | unique pair; the outcome never goes back to "unseen" |
| Handling | `BizumSettlementService`; F8, F9, F10 | `bizum_handling` row; `reason_json` = `{reason, sender}` | F8 (the list), F13 (the reasons), F11 (how, unallocated) | the JSON is written from the typed `WaitReason` and parsed against its codes; an unknown code reads as `kept` |
| Payment link | `ShareSettler.settle` → `append` | `payments.bizum_id` | F10 (all payments of one Bizum), F11 (detail) | references `bizums(id)`; null for every manual payment |
| Feed state | `BankPoller` | `bizum_feed_state` row 1 | the panel, the poller at start | codes from `BankFailure` and the counts only |

Create: the read. Read: the panel, the list, the detail. Update: the handling row (wait to settled, settled back to waiting by F10). Delete: F8's dismissal removes the `bizums` row and its handling row (cascade), and changes the ledger row to `dismissed`; no payment can point to a waiting Bizum.

**Patterns and Conventions.** Ports and adapters (the core's SQLite classes live in its own `sqlite/` folder and are given a connection); a unit of work per entry; time and timers injected (`Clock`, `Scheduler`), so the poller is tested without waiting; one service writing what a verdict means, reused by every trigger; a log line with codes and counts only.

**File Changes.**

- Create: `server/src/bizum/feed.ts`, `bank-poller.ts`, `timer-scheduler.ts`, `server/src/bizum/sqlite/*.ts` (four classes); `server/src/repo/bizum-handler.ts`, `bizum-settlement-service.ts`, `bizum-handling-repository.ts`, `bank-feed-source.ts`; `server/src/db/payment-bizum-link-migration.ts`, `server/src/db/fixtures/schema-v4.sql`.
- Modify: `server/src/repo/share-settler.ts`, `payment-repository.ts`, `bank-connection-repository.ts`; `server/src/routes/bank-admin-router.ts`; `server/src/server-app.ts`, `server/src/index.ts`; `server/src/db/schema.sql`, `schema-migrator.ts`, `db/index.ts`.
- Migrate: step 5; `LATEST_SCHEMA_VERSION` 4 → 5.
- Tests: as listed in Test Methodology.

#### F8 — The waiting list with reasons; pairing, ruling and dismissing

**Current Implementation.** Built on F3 (`BizumFactsReader`, `BizumRuleSet` with the `review` mode, `SenderIdentification`, `SenderSuggestion`, `NearestDebtOrder`, `players.bizum_name`), F7 (`bizums`, `bizum_handling`, `BizumSettlementService`, `SqliteBankEntryLedger.dismiss`, `SqliteBizumStore.remove`) and R1's `ShareSettler`. `verified — source` (this document). A player's phone is written only through `ContactRepository.save(playerId, patch)`, which keeps the fields the patch does not name (`server/src/repo/contact-repository.ts:20-36`). `verified — source`. The sketches draw the list and three dialogs (`requirements/examples/screens.html` frames 5 to 9). The "Pagar cuotas" dialog offers a player to choose even for a sender nobody has paired (frame 8, `Marta G.L.`); "Pagar cuotas" is drawn only where the amount is not whole shares or the debts fall short (frame 5). `verified — document`.

**Approach.** One router and three services, all admin-only (mounted beside `api`, as F5's router). Every change is one transaction, and every re-judgment goes through F7's `BizumSettlementService`, so the list, the feed and a played game can never judge one Bizum two ways.

*The list.* `GET /bizums/waiting` → the waiting Bizums, oldest booking first:

```ts
interface WaitingBizum {
  id: number; bookedOn: string; amountCents: number; currency: string;
  sender: { name: string | null; phone: string | null };   // as the bank showed it
  subject: string | null;
  reason: WaitReason;                                         // F3's codes, with player ids
  players: Record<number, string>;                            // names for every id the reason or the sender mentions
  senderIdentity: SenderIdentity;                            // player, ambiguous (ids), or unknown (suggested ids)
}
```

The reason is the one stored when the Bizum last waited (F7), not recomputed on read, so the list shows what the rules last decided (UC-006-04-S3). Its suggestions are recomputed on read, because a new player or alias may change them and they decide nothing. An empty list is `[]`, and the page shows "No hay Bizums en espera" (UC-006-04-S2, F13). The Spanish wording of each reason is F13's.

*Pairing* (`SenderPairingService.pair(bizumId, playerId)`), UC-006-05-S1, S3:

1. The Bizum must be waiting, and the player must exist.
2. A phone sender sets the player's phone to the sender's phone (`contacts.save(player, {phone})`, the email untouched). A name sender sets `players.bizum_name` to the sender's name as the bank showed it. Either replaces an earlier value, which the answer returns as `replaced`, for the dialog to say (UC-006-05-S1).
3. Every waiting Bizum of the same sender (same phone key, or same folded name) is judged again in `review` mode, oldest first, through `BizumSettlementService.apply`: settled ones leave the list as `automatic` (the rules settled them), the rest wait with their new reason.
4. The answer: `{replaced, sharedWith, results}`. `sharedWith` lists the other players now holding the same Bizum name; it is non-empty in the case of UC-006-05-S3, and the page shows the warning.

*The pairings list* (UC-006-05-S4; "where they are listed is for the design"):

- `GET /bizums/pairings` lists the players with a Bizum name.
- `DELETE /bizums/pairings/:playerId` clears the name; the payments already made stay.
- `PUT /bizums/pairings/:playerId {bizumName}` sets a Bizum name typed by the organiser, so "Guti" can be given `Jorge G.A.` before any Bizum of his arrives. `author decision` (2026-10-19: "keep in the database how each player appears on Bizum"); the list is shown in the Banco panel (F12). Setting a name by hand re-judges nothing: there is no Bizum in hand. The next read, a pairing or a played game does.
- A phone pairing is undone by changing the player's phone (UC-006-05-S4).

*Ruling* (`BizumResolutionService.rule(bizumId, playerId, shares)`), UC-006-05-S2:

1. The Bizum must be waiting, and `shares` must be at least 1.
2. The open shares are read as F3 reads them: the chosen player's, in the Bizum's season, on or before its booking date, nearest first.
3. `shares` must not exceed how many there are (`"Solo tiene N cuotas abiertas en esa temporada"`), and the first `shares` of them must not cost more than the Bizum (`"El Bizum no cubre N cuotas"`).
4. Then `BizumSettlementService.settle(stored, playerId, first shares, 'organiser')`; the rest is recorded as unallocated.

Ruling and pairing are kept apart:

- **A ruling does not pair the sender.** It decides this Bizum only, and the organiser pairs with "Asignar jugador" when the sender should be known for good. `inferred` from the sketch: frame 8 rules for an unpaired `Marta G.L.`. **Flagged to the author.**
- **A ruling never pays shares worth more than the Bizum.** A payment says money arrived for a share, and the rest must be zero or more (UC-006-05-S2's "rest"). `inferred`. **Flagged to the author.**

*Dismissing* (`BizumResolutionService.dismiss(bizumId)`), UC-006-05-S5, S6: the Bizum must be waiting; a settled one is refused (`"Deshaz antes sus pagos"`, F10). Then, in one transaction, the ledger row becomes `dismissed` and the Bizum row is deleted (its handling row goes with it). Only the bank's identifiers remain: no sender, subject or amount. The ledger keeps it from being read again; being gone from `bizums` keeps it out of every re-judgment (pairing, played game).

*Routes* (`BizumAdminRouter`, `server/src/routes/bizum-admin-router.ts`):

| Route | Answer |
| ----- | ------ |
| `GET /bizums/waiting` | the list |
| `POST /bizums/:id/pair {playerId}` | `{replaced, sharedWith, results}` and the new list |
| `POST /bizums/:id/rule {playerId, shares}` | the payments made and the new list |
| `POST /bizums/:id/dismiss` | the new list |
| `GET /bizums/pairings`, `PUT /bizums/pairings/:playerId`, `DELETE /bizums/pairings/:playerId` | the pairings |

Refusals answer 400 with the Spanish message (`route()`). Every route is 403 for a player and for an admin viewing as a player (UC-006-04-S4).

Worked by hand (`not yet run`; share 400). Luis has 1 open share (10-07). Two Bizums of `Luis P.R.` wait as `sender_unknown`: 800 (10-08) and 400 (10-09).

- Pair the 800 with Luis: his Bizum name becomes `Luis P.R.`. In review order, the 800 is R4 (2 shares, 1 debt) and waits with `not_enough_debts`; the 400 is R3 and settles the 10-07 share, `automatic`. The result is UC-006-05-S1 row 2.
- Rule 1 share on the 800: there are no open shares left, so it is refused "Solo tiene 0 cuotas abiertas en esa temporada".
- After the next game is played, F9 settles the 800 only if 2 shares are open by then.
- Dismiss the 800: the ledger row is `dismissed`, and the row is gone.

**Impacted Units.**

| Unit | Method | Action |
| ---- | ------ | ------ |
| `server/src/repo/bizum-resolution-service.ts` `BizumResolutionService` | `waiting`, `rule`, `dismiss`, `reevaluate(bizumIds)` | Create |
| `server/src/repo/sender-pairing-service.ts` `SenderPairingService` | `pair`, `pairings`, `setBizumName`, `clearBizumName` | Create |
| `server/src/routes/bizum-admin-router.ts` `BizumAdminRouter` | `router` | Create |
| `server/src/repo/player-repository.ts` | `setBizumName`, `playersWithBizumName(name)` (folded match) | Modify |
| `server/src/repo/bizum-handling-repository.ts` | `waiting()` with the sender fields joined from `bizums` | Modify (F7) |
| `server/src/server-app.ts` | mount the router beside `api` | Modify |

**Test Methodology.** Tier 2 per 2.10, on real SQLite through `GameFlow`. Fully automatable.

- Each row of UC-006-04-S1 (reason and identities), S2, S3 (a read does not change a waiting Bizum), S5 (suggestions in the list).
- UC-006-05: S1 (three rows, including the phone written and the email kept), S2 (three rows, with the rest), S3 (`sharedWith`), S4 (clearing the name; the earlier payments stay), S5, and S6 (each row: a read, a renewal, a pairing, a played game, an include word added).
- The refusals of the ruling, the dismissal of a settled Bizum, and the routes' 403.

**Data Contract Verification.**

| Data | Written by | Stored as | Read by | Checks |
| ---- | ---------- | --------- | ------- | ------ |
| Bizum name | `pair`, `setBizumName`, `clearBizumName` | `players.bizum_name`, trimmed, at most 80 characters | F3's identification (folded) | a blank name clears it |
| Phone | `pair` | `player_contacts.phone`, as the bank showed it with spaces removed | F3's `PhoneKey` | it passes `ContactValidator`'s pattern, since the dialect only takes a `+` and nine or more digits |
| Ruling | `rule` | payments (`method = 'bizum'`, `bizum_id`) and the handling row (`organiser`, unallocated) | F10, F11 | unallocated ≥ 0 by the refusal above |
| Dismissal | `dismiss` | ledger `dismissed`; `bizums` row deleted | F7's ledger check | — |

**Patterns and Conventions.** Services per use case (pairing, resolution), each change one transaction, one writer of verdicts (F7's service); reasons stored as codes and turned into words by the page; the router as a class, mounted where admin-only is the default.

**File Changes.**

- Create: `server/src/repo/bizum-resolution-service.ts`, `sender-pairing-service.ts`; `server/src/routes/bizum-admin-router.ts`.
- Modify: `server/src/repo/player-repository.ts`, `bizum-handling-repository.ts`; `server/src/server-app.ts`.
- Tests: `bizum-resolution-service.test.ts`, `sender-pairing-service.test.ts`, `bizum-admin-router.test.ts`.

#### F9 — A waiting Bizum settles when its game is played

**Current Implementation.** `GameLifecycleService.perform` writes the new state and then runs every `PlayedEffect.apply(game)`, in order, inside one transaction, when a game enters `played`. It runs `retract` when the game leaves `played`. The effects are given in its constructor (`server/src/repo/game-lifecycle-service.ts:15-45`), and production lists `PlayedOutcomeEffect` then `BillingEffect` (`server/src/repo/index.ts`). `GameFlow` builds the same list for tests (`repo/game-flow-test-support.ts:47-68`). `verified — source`. `BillingEffect.apply` creates the game's debts; its `retract` does nothing, because debts and payments outlive the game being played (`billing-effect.ts:29-45`). `verified — source`.

**Approach.** `BizumReevaluationEffect` implements `PlayedEffect` and is listed **after** `BillingEffect`, so the debts it may settle already exist and commit or roll back with the state change (D-4).

- `apply(game)`: the waiting Bizums booked in the game's season, on or after the game's date, oldest booking first (UC-006-10-S4). Each is judged in `review` mode, where nothing is discarded (UC-006-10-S3), and handed to `BizumSettlementService.apply`. A settled Bizum is `automatic`; one still waiting gets its new reason. The facts are read again for each Bizum, so a debt settled by the first cannot be paid by the second.
- `retract(game)`: nothing. A payment made from a Bizum stays, as every payment does when a game leaves `played`; undoing it is F10's (UC-006-06).

It depends on `BizumFactsReader`, `BizumRuleSet`, `BizumSettlementService`, `BizumHandlingRepository` and `SqliteBizumStore`. All of them are built from the database alone, and none on `GameLifecycleService`, so no cycle forms (R1 removed the only one). It is built in `repo/index.ts` with the other effects, and added to `GameFlow` the same way.

Worked by hand, against UC-006-10-S2 (`not yet run`; share 400; `Luis P.R.` is Luis's Bizum name). The game of 10-07 is played, which creates Luis's share.

| Waiting Bizum | Judged | Result |
| ------------- | ------ | ------ |
| 400 from `Luis P.R.`, booked 10-08 | R3 | settles the share, paid 10-08 |
| 400 booked 10-06 | not looked at: booked before the game | stays waiting |
| 400 from `+34611111111` | the sender is unknown, so R7 | stays waiting |
| 800 from `Luis P.R.`, booked 10-08 | R4 | stays waiting, reason `not_enough_debts` (2 shares, 1 debt) |
| 450 from `Luis P.R.` with `pachanga`, booked 10-08 | R5 | stays waiting |

Each row is the only waiting Bizum in its case.

**Impacted Units.**

| Unit | Method | Action |
| ---- | ------ | ------ |
| `server/src/repo/bizum-reevaluation-effect.ts` `BizumReevaluationEffect` | `apply`, `retract` | Create |
| `server/src/repo/bizum-handling-repository.ts` | `waitingInSeasonFrom(seasonId, fromDate)` | Modify (F7) |
| `server/src/repo/index.ts` | the effect, after `BillingEffect` | Modify |
| `server/src/repo/game-flow-test-support.ts` `GameFlow` | the same | Modify |

**Test Methodology.** Tier 2 through `GameFlow.lifecycle.perform`, real SQLite. Fully automatable.

- UC-006-10-S1, each row of S2, S3 (an exclude word added after the Bizum waited does not discard it, and R3 settles it) and S4 (two Bizums, one debt: the older settles).
- A dismissed Bizum is not settled (UC-006-05-S6 row 4).
- An error inside the effect rolls back the whole `perform`: the game stays unplayed and has no debts.
- Retract leaves the Bizum payments in place.

**Data Contract Verification.** Writes only through `BizumSettlementService` (F7's table), so no new contract. It reads waiting rows by season and date, with dates compared as text like every date in the schema.

**Patterns and Conventions.** A new behaviour on being played is a new `PlayedEffect` (Open/Closed), listed after the effect it relies on; the effect holds no state and opens no transaction of its own.

**File Changes.**

- Create: `server/src/repo/bizum-reevaluation-effect.ts`.
- Modify: `server/src/repo/bizum-handling-repository.ts`, `server/src/repo/index.ts`, `server/src/repo/game-flow-test-support.ts`.
- Tests: `bizum-reevaluation-effect.test.ts`.

#### F10 — Undo an automatic payment as a whole and return the Bizum to the list

**Current Implementation.** `DELETE /games/:gameId/payments/:paymentId` calls `PaymentService.undo`, which checks `require('pay')` and that the payment is of that game, then (after R1) runs `ShareSettler.unsettle` in a transaction: the payment is deleted, the debt comes back at the season's share, and the beneficiary's paid game is reset (`server/src/routes/api.ts:407-416`; `payment-service.ts`). `verified — source`. After F7, a payment made from a Bizum carries `bizum_id`, and the Bizum's handling row says `settled`, with how and the unallocated rest. The admin page refetches everything after an action (`AGENTS.md`, web). `verified — source`.

**Approach.** `BizumUndoService` (`server/src/repo/bizum-undo-service.ts`) takes over the undo route. A payment with no `bizum_id` goes to `PaymentService.undo`, unchanged (UC-006-06-S3, UC-006-08-S3). A payment with one undoes **every** payment of that Bizum (UC-006-06-S2), in one transaction:

1. Find the payments with that `bizum_id` (`PaymentRepository.byBizum`). For each distinct game, `lifecycle.require(game, 'pay')`; if any game is no longer `played`, the whole undo is refused with that refusal and nothing changes (D4 of the HLD).
2. `ShareSettler.unsettle` each payment.
3. Mark the Bizum `waiting` again: unallocated 0, no `settled_how`, reason `undone`, and the sender identity read again (F3), so the list still shows who the sender is or might be.

The confirmation that lists every payment before undoing (UC-006-06-S1, S2) is a step in the page. It gets the list from F11's detail route, which returns the Bizum's payments.

**The reason `undone`** is a new code of F3's `WaitReason`, shown as "Se deshizo su pago". This **amends F3**. The rules cannot supply a reason here: judged now, R3 would settle the Bizum straight back. Apart from that reason, the Bizum is an ordinary waiting Bizum (UC-006-06-S1: "not marked or treated in any special way"). The consequence: **a later played game (F9) or a pairing (F8) can settle it again automatically** if R3 matches, for example with the same wrong pairing. The organiser undoes and then rules, pairs or removes the pairing, usually at once (UC-006-06-S1); a wrong pairing should be removed (UC-006-05-S4) before or right after undoing. **Flagged to the author.**

Worked by hand (`not yet run`): a Bizum of 800 settled Luis's shares of 10-07 and 09-30, both played. The organiser undoes the 10-07 payment: both payments are deleted, both debts are back, and the Bizum is listed with "Se deshizo su pago". If the 09-30 game had since been reopened, the undo would be refused with today's message for a game that is not played, and nothing would change.

**Impacted Units.**

| Unit | Method | Action |
| ---- | ------ | ------ |
| `server/src/repo/bizum-undo-service.ts` `BizumUndoService` | `undoPayment(gameId, paymentId)` | Create |
| `server/src/repo/payment-repository.ts` | `byBizum(bizumId)` | Modify |
| `server/src/domain/bizum-rules.ts` `WaitReason` | `{code: 'undone'}` | Modify (F3) |
| `server/src/repo/bizum-handling-repository.ts` | `markWaiting` takes the reason (already) | — |
| `server/src/routes/api.ts` | the `DELETE` route calls `BizumUndoService` | Modify |
| `server/src/repo/index.ts` | `bizumUndo` | Modify |

**Test Methodology.** Tier 2, real SQLite through `GameFlow`, and the route test. Fully automatable.

- UC-006-06-S1: debt back, Bizum listed with its original data and `undone`.
- S2: undoing either payment undoes both, from either game.
- S3: manual payments, Efectivo and Bizum, behave exactly as today and list no Bizum.
- A set with one game no longer played is refused whole.
- After undoing, every share is in debts or payments, never both.

**Data Contract Verification.** Deletes payments through `ShareSettler.unsettle` (as today), and updates the handling row: `waiting`, `unallocated_cents` 0, `settled_how` null, `reason_json` `{reason: {code: 'undone'}, sender}`. F8's list reads it; F13 turns `undone` into words. The ledger row stays `kept`, so the Bizum is never read again.

**Patterns and Conventions.** One service decides between the old path and the new one, so the route stays thin and the manual path is untouched; all of a Bizum's payments are undone in one transaction.

**File Changes.**

- Create: `server/src/repo/bizum-undo-service.ts`.
- Modify: `server/src/repo/payment-repository.ts`, `server/src/domain/bizum-rules.ts`, `server/src/routes/api.ts`, `server/src/repo/index.ts`.
- Tests: `bizum-undo-service.test.ts`; `api.test.ts` (the undo route).

#### F11 — Traceability: the admin sees method and Bizum detail; the player sees the method only

**Current Implementation.**

- **The player's payments.** `OwnRouter` `GET /me/payments` returns `OwnDataService.payments(me)`, which passes `PaymentRepository.paidFor(player)` through `OwnDisclosure.payments`. That method builds each row field by field (game, date, label, amount, paid on, kind, `paidBy`), so a column added to the read reaches the player only if `OwnDisclosure` names it (`server/src/domain/own-disclosure.ts:106-122`; `repo/own-data-service.ts`; `routes/own-router.ts:31-33`). `verified — source`.
- `paidFor` names its columns and does not select a method (`payment-repository.ts:91-106`). `verified — source`.
- The web shows each payment as a line with one tag (paid by someone else, or "invitado") (`web/src/lib/ownDebts.ts:43-50`, `components/OwnPayments.tsx`). `verified — source`. The sketch adds the method as a tag on each line (`screens.html` frame 13). `verified — document`.
- **The organiser's view.** The organiser sees payments in the payment cell (F1 adds the method to its chip). The sketch opens a detail when a Bizum payment is clicked (frames 10 and 11). `verified — document`.

**Approach.**

*Player.* `paidFor` selects `p.method`; `PaymentInput` and `OwnPaymentRow` gain `method`; `OwnDisclosure.payments` copies it. It copies nothing of the Bizum, because nothing of the Bizum is read: `paidFor` joins no Bizum table, and `bizum_id` is not selected. Two rules then keep the Bizum away from the player (UC-006-07-S4): the read has no Bizum field, and the disclosure is a whitelist. Both "Ver como jugador" and "Ver como otro jugador" go through the same routes, so they are covered. The web line gains the method as a tag (`Efectivo`, `Bizum`, `Otro`), placed before the existing note (sketch 13).

*Admin.* `GET /payments/:id/bizum` (admin router; `PaymentDetailService`, `server/src/repo/payment-detail-service.ts`):

```ts
interface PaymentDetail {
  payment: { id: number; gameId: number; playedOn: string; amountCents: number; paidOn: string;
             method: PaymentMethod; payerName: string; beneficiaryName: string | null };
  resolved: 'manual' | 'automatic' | 'organiser';      // "Registrado a mano" | "Automático" | "Por decisión del organizador"
  bizum: null | {
    bookedOn: string; sender: { name: string | null; phone: string | null };
    amountCents: number; currency: string; subject: string | null;
    reference: string;                                  // the bank's own identification of the entry
    unallocatedCents: number;
    payments: { id: number; gameId: number; playedOn: string; beneficiaryName: string | null; amountCents: number }[];
  };
}
```

`resolved` is `manual` for every payment without a `bizum_id`, whatever its method (UC-006-07-S3). Otherwise it is the handling row's `settled_how`. `bizum.payments` is every payment of that Bizum; F10's confirmation lists them. The web adds a `PaymentDetail` dialog, opened from a payment chip whose method is Bizum (sketch 10: "Al pulsar un pago con Bizum se abre su detalle"). It shows the fields of `requirements/examples/payment-views.md`, and "Deshacer" opens F10's confirmation from the same data.

Worked by hand against `payment-views.md` (`not yet run`): the payment of 400 for Luis's 10-07 share, from a Bizum of 450 by `Luis P.R.` with `pachanga`, ruled for 1 share, gives `resolved: 'organiser'` and a `bizum` with booking date 10-12, sender `Luis P.R.`, 450, `pachanga`, its reference, and unallocated 50. A hand-recorded Bizum payment gives `resolved: 'manual'` and `bizum: null`. Luis's own `/me/payments` row is `{…, amountCents: 400, method: 'bizum', …}`, with no other new field.

**Impacted Units.**

| Unit | Method / part | Action |
| ---- | ------------- | ------ |
| `server/src/repo/payment-repository.ts` `PaidShare`, `paidFor` | `method` | Modify |
| `server/src/domain/own-disclosure.ts` `PaymentInput`, `OwnPaymentRow`, `payments` | `method` | Modify |
| `server/src/repo/payment-detail-service.ts` `PaymentDetailService` | `detail(paymentId)` | Create |
| `server/src/routes/api.ts` | `GET /payments/:paymentId/bizum` | Modify |
| `web/src/api.ts` | `OwnPaymentRow.method`; `PaymentDetail`; `paymentDetail(id)` | Modify |
| `web/src/lib/ownDebts.ts` `paymentLines` | `method` label on the line | Modify |
| `web/src/components/OwnPayments.tsx` | the method tag | Modify |
| `web/src/components/PaymentDetail.tsx`, `web/src/hooks/usePaymentDetail.ts` | the dialog and its load | Create |
| `web/src/components/PaymentCell.tsx`, `web/src/lib/paymentCell.ts` | a Bizum chip opens the detail | Modify (F1) |

**Test Methodology.** Tiers 1–2, plus the journey of F13. The manual look at the dialog is F13's.

- `own-disclosure.test.ts`: the method is copied; given an input row carrying extra fields (a `bizumId`, a sender), the output has none of them.
- `own-router.test.ts`: UC-006-07-S4, each row: the body has `method` and no booking date, sender, subject, reference or unallocated field. This holds also for an admin using "Ver como jugador" and "Ver como otro jugador".
- `payment-detail-service.test.ts` and the route test: UC-006-07-S2 and S3, the three values of `resolved`, `bizum.payments` for a Bizum of two shares, and 403 for a player.
- `web/src/lib/ownDebts.test.ts`: the method tag.

**Data Contract Verification.**

| Data | Read from | Shape | To | Checks |
| ---- | --------- | ----- | -- | ------ |
| Method (player) | `payments.method` via `paidFor` | one of three | `OwnDisclosure` → `/me/payments` → `paymentLines` | the whitelist copies `method` and nothing else new |
| Detail (admin) | `payments`, `bizums`, `bizum_handling` joined by `bizum_id` | `PaymentDetail` | `/payments/:id/bizum` → `PaymentDetail.tsx` | a Bizum row read back passes F2's constructor; a missing handling row (impossible by F7's transaction) reads as `automatic` with unallocated 0 |

Read-only element; nothing is created, updated or deleted.

**Patterns and Conventions.** The disclosure rule stays the one place deciding what a player may be told (whitelist); admin detail comes from one service; the dialog uses one hook per remote resource, with labels in `lib/` (frontend standard).

**File Changes.**

- Create: `server/src/repo/payment-detail-service.ts`; `web/src/components/PaymentDetail.tsx`, `web/src/hooks/usePaymentDetail.ts`.
- Modify: `server/src/repo/payment-repository.ts`, `server/src/domain/own-disclosure.ts`, `server/src/routes/api.ts`; `web/src/api.ts`, `web/src/lib/ownDebts.ts`, `web/src/components/OwnPayments.tsx`, `PaymentCell.tsx`, `web/src/lib/paymentCell.ts`.
- Tests: `own-disclosure.test.ts`, `own-router.test.ts`, `payment-detail-service.test.ts`, `api.test.ts`, `web/src/lib/ownDebts.test.ts`, `web/src/lib/paymentCell.test.ts`.

#### F12 — The Banco panel (with "Leer ahora") and the expiry banner

**Current Implementation.**

- `AdminShell` holds the tab state, renders the header, an error line and the tab's page, and has no banner (`web/src/pages/AdminShell.tsx`). `verified — source`.
- `Manage` shows one section at a time from a fixed `SECTIONS` list (`Jugones`, `Reglas`, `Temporada`, `Mi cuenta`) and keeps the current section in its own state (`web/src/pages/Manage.tsx:8-35`). `verified — source`.
- Data is read through hooks over `api.ts`: `useLoaded(read)` for a read with `reload`, and `useGuarded(report)` for one action at a time (`web/src/hooks/useLoaded.ts`, `useGuarded.ts`). `verified — source`.
- Modals use `ResolveDialog`, a native `<dialog>` (`components/ResolveDialog.tsx`). `verified — source`.
- No code reads `location.search`, and the SPA does not navigate on sign-in, so a query the bank's redirect leaves on the address survives the login screen. `verified — source` (`grep`, 2026-10-19).
- The sketch fixes the layout: frames 1 to 4 for the panel, and frames 2 and 5 for the banner (`requirements/examples/screens.html`). "Leer ahora" is not drawn there. `verified — document`.

**Approach.** The panel is one more Manage section, "Banco", composed of small cards. Each card takes the slice of the panel answer it shows; one hook reads the panel, one runs its actions. All Spanish copy lives in `lib/bankMessages.ts`, mapped from the server's codes. The server never sends Spanish for these states (F5).

| Piece | Shows | Data |
| ----- | ----- | ---- |
| `BankConnectionCard` | state ("Sin conexión", "Conectado · Revolut", "Reconexión necesaria" with the reason), end date and days left, the account read (type · currency · ··· last 4), last read and its result, `ReadNowButton`, "Conectar con <banco>" / "Renovar" (primary at ≤ 14 days) / "Desconectar" with its confirmation; the setup problems by setting name (UC-006-01-S2); the desktop hint (S3) | `panel.connection`, `panel.setup`, `panel.lastRead`, `panel.bank` |
| `BankAccountChoice` | the accounts in the currency to choose from, or "no account in <currency>" (S6, S7) | `panel.accounts`, `panel.selection` |
| `BankReadingSettings` | start date ("Se ignora todo lo anterior al …"), currency, the bank list (fixed while connected) (S14, S15; UC-006-09) | `panel.startDate`, `panel.currency`, `panel.bank` |
| `KeywordLists` | the two lists with add and remove (S14) | `panel.words` |
| `BizumPairingsList` | players with a Bizum name; remove; set one by hand (F8) | `GET /bizums/pairings` |
| `BankBanner` | the strip above the tabs (S10, S11) | `GET /bank/banner` |
| `ReadNowButton` | "Leer ahora", its progress, its result or refusal (UC-006-02-S9, S10) | `POST /bank/read` |

Hooks: `useBankPanel` (`useLoaded(api.bank)`), `useBankActions` (connect → `window.location.assign(url)`, disconnect, settings, words; each reloads the panel and the banner), `useBizumPairings`, `useBankBanner`, `useReadNow`. Pure functions with tests in `lib/`:

- `bankMessages.ts`: every server code to its Spanish text, including the nine callback codes of F5. Those of UC-006-01-S5 use its copy; `connected` gives "Conectado hasta <date>".
- `bankPanel.ts`: which buttons show and which is primary; "N días restantes"; the account label.
- `readNow.ts`: a result to "Lectura terminada: N movimientos, K nuevos"; a refusal to the copy of UC-006-02-S10, with `<hora>` formatted.

*Returning from the bank.* `useBankReturn` reads `?bank=<code>` once when `AdminShell` mounts. It removes the query with `history.replaceState`, so a reload does not repeat the message, and returns the code. `AdminShell` then opens Ajustes › Banco and shows the message at the top of the panel. If the organiser is not signed in, the login comes first and the query waits on the address (UC-006-01-S4). To open a section from outside, `Manage` takes its section as a controlled prop from `AdminShell` (`section`, `onSection`). Both the banner's link and the return use it.

*The banner.* `BankBanner` sits between the header and the page, on every tab of `AdminShell` only. It is never in `OwnView`, so a player and an admin using "Ver como jugador" never see it (UC-006-01-S10). It reads `GET /bank/banner` when the shell mounts and after any bank action. Its link opens Banco. The banner answer gains **`canRead`** (F6's readiness is ready), which **amends F5's `banner()`**: Deudas (F13) uses it to decide whether to offer "Leer ahora" without reading the whole panel.

*`ReadNowButton`* (shared with F13) takes `onRead` from `useReadNow` and `onDone` (what to reload). It shows "Leyendo…" while the request runs (the server answers when the read ends, F7), then the result or the refusal; the server's `until` decides the time shown. Hidden unless `canRead`.

Worked by hand against the sketch (`not yet run`):

- Panel answer `{connection: {state: 'connected', validUntil: '2027-03-30T…', daysLeft: 10, renewSuggested: true}, bank: {chosenId: 'revolut', …}, …}`: frame 2, with "Renovar" primary and the banner reading "La conexión con el banco caduca en 10 días".
- `state: 'reconnect_needed', reason: 'CLOSED_SESSION'`: frame 3, with "Revolut cerró la sesión".
- `selection: 'choose'` with two EUR accounts: frame 4.

*Manual Test Plan guidelines* (2.10):

1. On a phone-width browser (375 px), compare frames 1 to 4 with the panel in each state (the fake bank in a local run). The cards fit with no horizontal scroll, and the account shows only type, currency and last 4.
2. With the deployed app, press "Conectar con Revolut" while signed in, approve, and land on the panel with "Conectado hasta …".
3. Sign out in another tab before approving, approve, and land on the login. After signing in, the panel shows the same message.
4. The banner shows on every admin tab when 14 days or fewer remain, and never in "Ver como jugador".

**Impacted Units.**

| Unit | Action |
| ---- | ------ |
| `web/src/pages/Manage.tsx` (section "Banco"; controlled section) | Modify |
| `web/src/pages/AdminShell.tsx` (banner; return from the bank; Manage's section) | Modify |
| `web/src/components/BankPanel.tsx`, `BankConnectionCard.tsx`, `BankAccountChoice.tsx`, `BankReadingSettings.tsx`, `KeywordLists.tsx`, `BizumPairingsList.tsx`, `BankBanner.tsx`, `ReadNowButton.tsx` | Create |
| `web/src/hooks/useBankPanel.ts`, `useBankActions.ts`, `useBizumPairings.ts`, `useBankBanner.ts`, `useReadNow.ts`, `useBankReturn.ts` | Create |
| `web/src/lib/bankMessages.ts`, `bankPanel.ts`, `readNow.ts` and their tests | Create |
| `web/src/api.ts` (the bank and pairing calls and types) | Modify |
| `web/src/index.css` (banner, cards; existing tokens) | Modify |
| `server/src/repo/bank-connection-service.ts` `banner()` (`canRead`) | Modify (F5) |

**Test Methodology.** Tier 1: the three `lib` modules, table-tested against the frames above and every code. Tier 3, one journey in `e2e/tests/the-bank-panel.spec.ts` against the fake bank (F15):

1. The panel lists Revolut and Banco Ficticio (success criterion row 7).
2. Connect: the browser goes to the fake's consent page and returns through the real callback.
3. "Conectado hasta …" shows; choose the second EUR account; set the start date.
4. "Leer ahora" ends with a result, and pressing it again shows "Espera unos minutos".
5. Disconnect with its confirmation, back to "Sin conexión".

The manual plan above covers the phone layout and the signed-out return.

**Data Contract Verification.** Reads `GET /bank` (F5 + F6 + F7 parts), `GET /bank/banner`, `GET /bizums/pairings`; writes through F5's, F6's and F8's routes. Every field shown is a code, a date, a count or the account's type/currency/last 4; the panel never receives a session id, state, code or raw account (F5). A code that `bankMessages` does not know is shown as "Error del banco (<code>)", never as a blank.

**Patterns and Conventions.** One component per card, composed by `BankPanel`; one hook per remote resource and one for actions; codes in, Spanish out in `lib/`; a controlled section in `Manage` instead of a second state copy; the existing dialog, tokens and card classes.

**File Changes.** As Impacted Units; tests: `bankMessages.test.ts`, `bankPanel.test.ts`, `readNow.test.ts`, `e2e/tests/the-bank-panel.spec.ts`.

#### F13 — "Bizums en espera" and its dialogs in Deudas, with "Leer ahora"

**Current Implementation.** `Debts` shows a filters card, the owed shares grouped by debtor with `PaymentCell`, and WhatsApp copy; data comes from `useDebts` and payments from `useDebtPayments` (`web/src/pages/Debts.tsx`). `verified — source`. The routes behind this element are F8's (list, pair, rule, dismiss, pairings) and F10/F11's (undo, detail). `verified — source` (this document). The sketch draws the list at the top of Deudas (frame 5), the empty list (frame 6), "Asignar jugador" (7), "Pagar cuotas" (8), "Descartar" (9), the payment detail (11) and the undo of a two-share Bizum (12). `verified — document`.

**Approach.**

*The section.* `WaitingBizums` is the first card of `Debts`: the title "Bizums en espera", the count and `ReadNowButton` (when the banner's `canRead`), then one `WaitingBizumItem` per Bizum, or "No hay Bizums en espera." (UC-006-04-S2). An item shows:

- the sender as the bank showed it;
- the date and the subject in « », or "sin asunto";
- "= <player>" when the sender is a player;
- the amount;
- the reason line, from `lib/waitingBizums.ts`.

| Reason (F3, F10) | Line |
| ---------------- | ---- |
| `not_enough_debts` | "<jugador> debe N cuotas y el Bizum son M." |
| `include_word`, not whole | "El importe no es un número de cuotas, pero el asunto menciona <palabra>." |
| `include_word`, whole | "El asunto menciona <palabra>." |
| `sender_unknown` | "No sabemos quién es el remitente." plus "¿Es <a> o <b>?" when there are suggestions |
| `sender_ambiguous` | "Puede ser <a> o <b>." |
| `no_season` | "No existe la temporada de esa fecha." |
| `kept`, `amounts_differ` | "Revisa este Bizum." |
| `undone` | "Se deshizo su pago." |

The buttons come from `waitingActions(item)`:

- "Asignar jugador" when the sender is not a player.
- "Pagar cuotas" unless the reason is `sender_unknown` or `sender_ambiguous` with a whole amount. That is R7: there, the sender must be paired first, as in frame 5.
- "Descartar" always.

*The dialogs* (each in `ResolveDialog`; each closes with the list reloaded):

- `AssignPlayerDialog` (UC-006-05-S1, S3): the Bizum's data; a player select with the suggestions first, then everyone; a line saying what is saved (the Bizum name, or the phone) and, if the player already has one, "Sustituirá «…»" (from the pairings). On confirm it shows the result: what settled, what still waits, and the warning when `sharedWith` is not empty. It does not predict the result beforehand, because the server's re-judgment is the only authority.
- `RuleSharesDialog` (UC-006-05-S2): a player select (the identified player, else the first suggestion) and the number of shares, from 1 up to the most the open shares and the amount allow. It shows which debts it pays, the rest, and "Solo se pagan deudas de la misma temporada que el Bizum." (frame 8). The open shares come from **`GET /bizums/:id/open-shares?playerId=`**, read-only, which **amends F8**: the same read F3 does (season, on or before the booking date, nearest first). `lib/rulingPreview.ts` computes the lines and the maximum.
- `DismissBizumDialog` (UC-006-05-S5): frame 9's text, "Descartar para siempre".
- `UndoBizumDialog` (UC-006-06-S1, S2): frame 12, listing every payment of the Bizum from F11's detail ("Deshacer los dos pagos" when there are two). It is opened from F11's `PaymentDetail` "Deshacer pago", and from the "Deshacer" of a payment chip whose payment has a Bizum. A manual payment's "Deshacer" stays direct, as today (UC-006-06-S3).

Hooks: `useWaitingBizums` (`useLoaded` of the list), `useWaitingActions` (pair, rule, dismiss; each reloads the list and the debts), `useOpenShares(bizumId, playerId)`. "Leer ahora" here reloads the list and the debts when it ends, so a Bizum read appears without leaving the tab (2.10, F13's manual row).

Worked by hand against frame 5 (`not yet run`):

| Item | Reason line | Buttons |
| ---- | ----------- | ------- |
| `Luis P.R.`, 12,00 €, player Luis, `not_enough_debts` (2, 3) | "Luis Pérez debe 2 cuotas y el Bizum son 3." | Pagar cuotas, Descartar |
| `Marta G.L.`, 4,50 €, «pachanga», unknown, `include_word` not whole | "El importe no es un número de cuotas, pero el asunto menciona pachanga." | Asignar jugador, Pagar cuotas, Descartar |
| `+34 611 11 11 11`, 8,00 €, `sender_unknown`, no suggestions | "No sabemos quién es el remitente." | Asignar jugador, Descartar |
| `Marta G.L.`, 8,00 €, `sender_ambiguous` (García, Gómez) | "Puede ser Marta García o Marta Gómez." | Asignar jugador, Descartar |

*Manual Test Plan guidelines* (2.10):

1. At phone width, compare frames 5 to 9 and 12 with the list and each dialog. Every button can be reached with a thumb, and the dialogs fill the screen.
2. "Leer ahora" in Deudas shows the same result and refusal as in the panel, and a Bizum read appears in the list without leaving the tab.
3. With the setup incomplete or the bank disconnected, Deudas offers no "Leer ahora".
4. In "Ver como jugador", Deudas is not reachable and no Bizum data appears anywhere.

**Impacted Units.**

| Unit | Action |
| ---- | ------ |
| `web/src/pages/Debts.tsx` (the section first) | Modify |
| `web/src/components/WaitingBizums.tsx`, `WaitingBizumItem.tsx`, `AssignPlayerDialog.tsx`, `RuleSharesDialog.tsx`, `DismissBizumDialog.tsx`, `UndoBizumDialog.tsx` | Create |
| `web/src/components/PaymentDetail.tsx`, `PaymentCell.tsx` (open the undo dialog for a Bizum payment) | Modify (F11) |
| `web/src/hooks/useWaitingBizums.ts`, `useWaitingActions.ts`, `useOpenShares.ts` | Create |
| `web/src/lib/waitingBizums.ts`, `rulingPreview.ts` and their tests | Create |
| `web/src/api.ts` (waiting list, pair, rule, dismiss, open shares) | Modify |
| `server/src/routes/bizum-admin-router.ts`, `bizum-resolution-service.ts` (`openShares`) | Modify (F8) |

**Test Methodology.**

- Tier 1: `waitingBizums.test.ts` (each reason row; the actions per reason) and `rulingPreview.test.ts` (UC-006-05-S2's rows: the maximum, the debts paid, the rest).
- Tier 2: the open-shares route (F8's tests gain it).
- Tier 3, two journeys against the fake bank (F15), at most the HLD's budget of four with F12's one:
  - `the-waiting-bizums.spec.ts`: the fake adds a Bizum from an unknown sender; "Leer ahora" in Deudas; it is listed with "No sabemos quién es el remitente."; "Asignar jugador" settles it; the chip reads "Pagado 4 € · Bizum".
  - `the-bizum-correction.spec.ts`: a 4,50 € Bizum with «pachanga» is ruled for 1 share, leaving "0,50 € sin asignar" in the detail; it is undone through the confirmation and is listed again with "Se deshizo su pago."; then it is dismissed.
- A fourth journey checks, as a player, that "Pagos" shows the method and nothing of the Bizum (UC-006-07-S4).

**Data Contract Verification.** Reads F8's list and open shares, and F11's detail. Writes only through F8's and F10's routes. The reason arrives as a code with player ids and a name map (F8); `lib/waitingBizums` renders an unknown code as "Revisa este Bizum.". Amounts arrive in cents and are shown with `euros()`.

**Patterns and Conventions.** As F12: a card and an item component, one dialog per action, codes to Spanish in `lib/`, one hook per resource, the shared `ReadNowButton`.

**File Changes.** As Impacted Units; tests: `waitingBizums.test.ts`, `rulingPreview.test.ts`, the three E2E specs above (`e2e/tests/the-waiting-bizums.spec.ts`, `the-bizum-correction.spec.ts`, `the-own-view.spec.ts` extended).

#### F14 — Production settings and secrets of the bank

**Current Implementation.** The chart passes the application one Secret through `envFrom`, holding `JWT_SECRET` alone (`templates/secret.yaml` uses `required`), and the container has no plain `env:` entry (`deploy/helm/pachanguero/templates/deployment.yaml`, `values.yaml`, `values.secrets.yaml.example`). `verified — source`. `docs/deployment.md#deployment-impact-of-a-change` lists what a new setting and a new secret must update: `.env.example`, `docs/commands.md`, a value and an `env:` entry for a setting the operator sets, the Secret, `values.yaml`'s `secrets:` and the example for a secret, and to tell the operator about their own `values.secrets.yaml`; then `helm lint` and `helm template` with the example values. `verified — document`. The deployment-settings test finds a chart setting by its `- name: X` entry or an indented `X:` key in any template (`server/src/deployment-settings.test.ts:47-56`). `verified — source`. Helm 3.17.3 renders a multi-line value given as a YAML block, through `b64enc` under the Secret's `data:`, back to the exact PEM, and an optional entry inside `with` disappears when the value is empty (run here on a scratch chart, 2026-10-19). `verified — invocation`.

**Approach.**

| Setting | Where | Template |
| ------- | ----- | -------- |
| `PACHANGUERO_PUBLIC_URL` | `values.yaml` `publicUrl: 'https://pachanguero.duckdns.org'` | the chart's **first** `env:` entry on the app container: `- name: PACHANGUERO_PUBLIC_URL`, `value: {{ .Values.publicUrl \| quote }}` |
| `ENABLE_BANKING_APP_ID` | `values.yaml` `secrets.enableBankingAppId: ''`; set in `values.secrets.yaml` | `secret.yaml`, `stringData`, inside `{{- with … }}` |
| `ENABLE_BANKING_PRIVATE_KEY` | `values.yaml` `secrets.enableBankingPrivateKey: ''`; set in `values.secrets.yaml` as a YAML block (`\|`) | `secret.yaml`, `data:`, `{{ . \| b64enc \| quote }}` inside `{{- with … }}` |
| `ENABLE_BANKING_API_URL` | not in the chart | `LEFT_TO_APPLICATION_DEFAULT` (F5) |

The two bank secrets are **optional** in the chart (no `required`): without them the application starts and the Banco panel names what is missing (UC-006-01-S2, VISION §5). `JWT_SECRET` stays `required`. The application id is kept with the secrets for convenience (2.4).

`values.secrets.yaml.example` gains both entries with placeholders. It also gets three comments:

- how to make the key and certificate (the `openssl req -x509 -newkey rsa:4096 -nodes …` line of the WP-005 guide §2);
- that the certificate goes to the Enable Banking Control Panel and the key stays here;
- that `https://pachanguero.duckdns.org/api/bank/callback` must be listed exactly as an allowed redirect URL of the production application.

**The operator's own `values.secrets.yaml`** is not in the repository and is not edited by the implementation. The release that carries this element says so to the author, as `docs/deployment.md` asks.

Worked (`not yet run` with the real chart; the mechanism `verified — invocation` above): `helm template` with the example values shows `PACHANGUERO_PUBLIC_URL` under `env:`, and `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY` in the Secret. With the two secrets empty, only `JWT_SECRET` is in the Secret.

*Manual Test Plan guidelines* (2.10): after the release, `helm template` (or `kubectl get secret pachanguero -o jsonpath='{.data}'` key names only, never values) shows the three keys, and the Banco panel in production names no missing setting.

**Impacted Units.**

| Unit | Action |
| ---- | ------ |
| `deploy/helm/pachanguero/values.yaml` (`publicUrl`, two `secrets` entries) | Modify |
| `deploy/helm/pachanguero/templates/deployment.yaml` (`env:`) | Modify |
| `deploy/helm/pachanguero/templates/secret.yaml` (two optional entries) | Modify |
| `deploy/helm/pachanguero/values.secrets.yaml.example` | Modify |
| `.env.example` (the three settings, commented, with the same guidance) | Modify |

**Test Methodology.** The deployment-settings test passes: it finds the three names in the chart and `ENABLE_BANKING_API_URL` in its list. `helm lint` and `helm template` pass with the example values, as `docs/deployment.md` asks. The manual plan is above.

**Data Contract Verification.** The chart's values become environment variables that `PublicUrl.fromEnv` and `EnableBankingConfig.fromEnv` (F5) read. The key arrives as the exact PEM with real newlines (verified above); the one-line `\n` form F5 also accepts covers a `.env` file.

**Patterns and Conventions.** Plain settings as `env:` entries, secrets in the Secret, both guarded by the deployment-settings test (2.11); optional secrets with `with`, so a chart without bank values still renders.

**File Changes.** Modify the five files above. The documents are in section 4 (`docs/commands.md`, `docs/deployment.md`).

#### F15 — A second, fake bank; a fake Enable Banking server; the shared connector contract; the opt-in sandbox suite

**Current Implementation.**

- `npm test` in `server/` is `vitest run` with no config file, so vitest's default pattern (`*.test.ts`, `*.spec.ts`) decides what runs (`server/package.json`; no `vitest.config.*` in `server/`). `verified — source`. Test helpers are plain classes in files named `*test-support.ts` (`repo/game-flow-test-support.ts`, `domain/clock-test-support.ts`), which the deployment-settings scan skips (`deployment-settings.test.ts:120-124`). `verified — source`.
- The E2E suite starts the API server and the web server as Playwright `webServer` entries with their own environment and ports 8788/5174 (`e2e/playwright.config.ts`). `verified — source`.
- What the Mock does, which the fake copies (WP-005 sandbox guide, `verified — document`): pages of 100 with a `continuation_key`, newest first, `date_from` inclusive (§6); exact matching of redirect URLs (§5); the failures of §7 (`EXPIRED_SESSION`, `CLOSED_SESSION`, `ACCOUNT_DOES_NOT_EXIST` 404, `WRONG_REQUEST_PARAMETERS`, `DATE_FROM_IN_FUTURE`, `WRONG_DATE_INTERVAL` 422, `REDIRECT_URI_NOT_ALLOWED` 400); a session still reading `AUTHORIZED` after its validity passed (§7); the bank name `Mock ASPSP` with `ES` (§6). The sandbox application shares the API host with production, and a script once reached production because a variable was unset (§2). Calls should be few, with no retry after a rate-limit answer (`pachanguero-sandbox-testing.md` §5).

**Approach.** Four pieces of test support. None is used by the production composition; the boundary test of F2 keeps the fakes out of the core.

*1. `FakeBankDialect`* (`server/src/bank/fake/fake-bank-dialect.ts`): a second bank shaped unlike Revolut, so the rules, tables and screens are proved against two shapes (success criterion row 7; 2.9). Its raw entry is `{id, kind: 'BIZUM_IN' | 'BIZUM_OUT' | 'CARD', state: 'DONE' | 'PENDING', bookedAt, cents, ccy, from: {name, phone}, to: {name, phone}, concept}`: it fills both name **and** phone of the sender, the receiver, and an integer amount, where Revolut fills a sender text and a string amount. `bank` is `{name: 'Banco Ficticio', country: 'ES'}`, `id` `fake`, `displayName` `Banco Ficticio`. It is registered beside Revolut only in test compositions (F4's catalogue takes its list through its constructor), and an E2E run lists both banks in the panel (F12).

*2. `FakeBankConnector`* (`server/src/bank/fake/fake-bank-connector.ts`): an in-memory `BankConnector` for service tests (F5, F7, F8): scripted accounts and entries, `failNext(error: BankError)`, a record of calls (`begun`, `completed`, `closed`, `read`), and a `ManualClock` for session validity. No HTTP.

*3. `FakeEnableBankingServer`* (`server/src/bank/fake/fake-enable-banking-server.ts`): an Express app on a loopback port that speaks the part of the Enable Banking API this work package calls, so the **real** `EnableBankingConnector` and `RevolutDialect` run over HTTP without a network.

| Endpoint | Behaviour |
| -------- | --------- |
| every call | verifies the bearer token: RS256 with the public key it was started with, `kid` = its application id, `iss`, `aud`, `exp` in the future; otherwise 401 `UNAUTHORIZED` |
| `POST /auth` | `redirect_url` must equal one of the registered URLs exactly, else 400 `REDIRECT_URI_NOT_ALLOWED`; `aspsp` must be a known bank, else 400 `WRONG_ASPSP_PROVIDED`; returns `{url: <fake>/consent/<id>}` |
| `GET /consent/:id` | the bank's page: 302 to `redirect_url?state&code`, or, when armed with `denyNext()`, to `?state&error=access_denied&error_description=…`; a code is single-use and lives 60 s |
| `POST /sessions` | an unknown or used code → 400 `WRONG_AUTHORIZATION_CODE`; a late one → 400 `EXPIRED_AUTHORIZATION_CODE`; else `{session_id, accounts: [{uid, identification_hash, …}]}` with **new** `uid`s per session and the same hashes |
| `GET /sessions/:id` | `status`, `valid_until`; `AUTHORIZED` even after expiry, as the Mock |
| `DELETE /sessions/:id` | `CLOSED` |
| `GET /accounts/:uid/details` | currency, `cash_account_type`, `account_id` |
| `GET /accounts/:uid/transactions` | newest first, `date_from` inclusive, 100 per page with an opaque `continuation_key`; unknown uid 404 `ACCOUNT_DOES_NOT_EXIST`; bad date or key 422 `WRONG_REQUEST_PARAMETERS`; future date 422 `DATE_FROM_IN_FUTURE`; closed 401 `CLOSED_SESSION`; past validity 401 `EXPIRED_SESSION`; revoked 401 `REVOKED_SESSION`; armed rate limit 429 `ASPSP_RATE_LIMIT_EXCEEDED` |

Errors are `{error: <code>, message: <text>}`, the shape the PoC read (`poc/ebpoc.py:71`). Control is a class API for in-process tests (`addEntry`, `removeEntry`, `denyNext`, `expire(sessionId)`, `revoke(sessionId)`, `rateLimitNext(n)`, `clock`) and the same under `POST /__control/*` for the E2E, where the fake runs as its own process (`server/src/bank/fake/fake-enable-banking-main.ts`, port and key file as arguments, never environment variables, so the deployment-settings scan stays clean). Its state starts from fixtures: `server/src/bank/fake/fixtures/accounts.json` (the four accounts of UC-006-01-S6: EUR, USD, GBP, EUR) and `entries.json` (anonymised, Revolut-shaped entries as guide §6: Bizums in and out, a "Dinero de …" top-up, a pending Bizum, a phone sender, more than 100 entries to force a second page; invented names and numbers only). F4's dialect tests read the same fixture.

What only the fake can show, because the Mock cannot: `REVOKED_SESSION`, a rate-limit answer, expiry driven by a clock (2.10).

*4. `BankConnectorContract`* (`server/src/bank/bank-connector-contract.ts`): one class that declares vitest cases over a `ContractTarget` (`{connector, account: AccountRef, dateFrom, expectedCount, control: FakeControl | null}`), run by two suites:

| Case | Fake | Sandbox |
| ---- | ---- | ------- |
| a read yields every entry from `dateFrom` on, `expectedCount` of them, across pages | yes | yes (fixture of more than 100) |
| two reads yield the same `entry_reference`s, none twice | yes | yes |
| a future `dateFrom` fails `rejected` `DATE_FROM_IN_FUTURE` | yes | yes |
| an unknown account fails `rejected` `ACCOUNT_DOES_NOT_EXIST` | yes | yes |
| a closed, expired or revoked session fails `session_ended` with that code | yes | no: closing ends the standing session |
| a rate-limit answer fails `rate_limited` with `retryAfter` | yes | no: never provoked |
| `begin` with an unregistered redirect fails `misconfigured` | yes | no: needs a new consent |
| `complete` gives a session, its validity and the accounts; a reused code fails `authorization_failed` | yes | no: needs a person |

`enable-banking-connector.contract.test.ts` runs it against the fake on every commit. A disagreement between the two suites means the fake drifted, and the fake is what changes.

*The sandbox suite* (`npm run test:sandbox`, tier 4): `server/src/bank/sandbox/enable-banking.sandbox.test.ts` runs the contract's read-only cases through the real connector and `RevolutDialect` against the Mock from a **standing session**. It is excluded from `npm test` by a new `server/vitest.config.ts` (`exclude: [...configDefaults.exclude, '**/*.sandbox.test.ts']`) and run by `server/vitest.sandbox.config.ts` (`include: ['src/**/*.sandbox.test.ts']`); the root gets `test:sandbox`. Its configuration is read only inside that suite and its `SandboxSettings` (`sandbox-settings-test-support.ts`), from the organiser's local `.env`:

| Variable | Meaning |
| -------- | ------- |
| `ENABLE_BANKING_SANDBOX` | must be `1`; anything else and the suite is skipped with a message naming what is missing |
| `ENABLE_BANKING_SANDBOX_APP_ID`, `ENABLE_BANKING_SANDBOX_PRIVATE_KEY` | the sandbox application, never the production one |
| `ENABLE_BANKING_SANDBOX_SESSION_ID`, `ENABLE_BANKING_SANDBOX_ACCOUNT_UID`, `ENABLE_BANKING_SANDBOX_ACCOUNT_HASH` | the standing session and its account |
| `ENABLE_BANKING_SANDBOX_DATE_FROM`, `ENABLE_BANKING_SANDBOX_EXPECTED_COUNT` | the fixture's known shape |

**The guard** (`SandboxGuard`), before any call: refuse when the sandbox application id equals `ENABLE_BANKING_APP_ID` or the sandbox key equals `ENABLE_BANKING_PRIVATE_KEY` (the production pair, if the same `.env` holds it); then `GET /sessions/{id}` must answer `AUTHORIZED` for that application (a production session does not exist for a sandbox application); then one read must count exactly `EXPECTED_COUNT`, or the suite stops with "the fixture changed". **Gentle:** a run is two full reads and two failing calls, about eight requests for a fixture of 101 to 200 entries; a rate-limit answer stops the run at once with no retry. The Mock maps to the Revolut dialect only here, in the test's own composition, never in the production catalogue (2.10). F7 adds its own read-only cases (the ledger across two reads, the start date) to this suite.

*E2E wiring.* `e2e/playwright.config.ts` makes an RSA key pair with `node:crypto` at start (PKCS#8 PEM, nothing written to the repository), starts the fake as a third `webServer` on port 8789 with the public key and the registered redirect `http://localhost:5174/api/bank/callback`, and gives the API server `ENABLE_BANKING_APP_ID=e2e-app`, the private key, `ENABLE_BANKING_API_URL=http://localhost:8789` and `PACHANGUERO_PUBLIC_URL=http://localhost:5174`. The specs drive the fake through `e2e/support/fake-bank.ts` (a class over `/__control`). The journeys themselves are F12's and F13's.

**Impacted Units.**

| Unit | Location | Action |
| ---- | -------- | ------ |
| `FakeBankDialect` | `server/src/bank/fake/fake-bank-dialect.ts` | Create |
| `FakeBankConnector` | `server/src/bank/fake/fake-bank-connector.ts` | Create |
| `FakeEnableBankingServer`, `FakeControl` | `server/src/bank/fake/fake-enable-banking-server.ts` | Create |
| the fake's process entry | `server/src/bank/fake/fake-enable-banking-main.ts` | Create |
| fixtures | `server/src/bank/fake/fixtures/accounts.json`, `entries.json` | Create |
| `BankConnectorContract`, `ContractTarget` | `server/src/bank/bank-connector-contract.ts` | Create |
| the contract against the fake | `server/src/bank/enable-banking-connector.contract.test.ts` | Create |
| the sandbox suite, `SandboxSettings`, `SandboxGuard` | `server/src/bank/sandbox/enable-banking.sandbox.test.ts`, `sandbox-settings-test-support.ts` | Create |
| vitest configs | `server/vitest.config.ts`, `server/vitest.sandbox.config.ts` | Create |
| scripts | `server/package.json`, root `package.json` (`test:sandbox`) | Modify |
| E2E wiring | `e2e/playwright.config.ts`, `e2e/support/fake-bank.ts` | Modify / Create |
| `.env.example` | the sandbox variables, commented out, under a "tests only" heading | Modify |

**Test Methodology.** The fakes are test code; they are proved by use. The contract suite against the fake is tier 2 and runs on every commit; the sandbox suite is tier 4, on request (2.10). Two checks on the fakes themselves: `fake-enable-banking-server.test.ts` checks the token verification (a token signed by another key, or with the wrong `kid`, is refused) and the paging arithmetic (101 entries give 100 then 1); `fake-bank-dialect.test.ts` checks that it recognises its own shape. The guard is tested with settings only (no network): the production id refused, the missing variables skip. Fully automatable, except the sandbox suite needing the standing session, which the guided checklist of F16 covers.

**Data Contract Verification.** The fixtures are the stored data: `entries.json` must be shaped like guide §6's entry (the keys the dialect reads: `entry_reference`, `status`, `credit_debit_indicator`, `transaction_amount {amount, currency}`, `booking_date`, `remittance_information` of two strings), so that F4's `RevolutDialect` reads the fake's entries and the Mock's alike; a test in F4 runs the dialect over the whole fixture and checks the expected counts of Bizums, non-Bizums and pending. `accounts.json` must carry `uid`-less templates (the fake mints `uid`s per session) with `identification_hash`, currency, `cash_account_type` and `account_id`. Nothing is written by the fakes outside memory.

**Patterns and Conventions.** Test doubles as classes (`*-test-support` naming where the file must escape the deployment scan); one contract run against two implementations (a fake and the real thing) so they cannot drift silently; opt-in suites by file suffix and their own vitest config, never by an environment switch inside `npm test`; a guard that fails closed; no secret, real name or real number in a fixture.

**File Changes.**

- Create: everything in Impacted Units marked Create.
- Modify: `server/package.json`, root `package.json`, `e2e/playwright.config.ts`, `.env.example`.
- Tests: `enable-banking-connector.contract.test.ts`, `fake-enable-banking-server.test.ts`, `fake-bank-dialect.test.ts`, the guard's test, the sandbox suite.

#### F16 — The test strategy as a decision tree, with the Bizum tiers and the guided checklist

**Current Implementation.** `docs/test-strategy.md` has sections for unit, integration, the deployment settings test and E2E, and a rule of thumb (`docs/test-strategy.md:22,44,75,92,145`). `verified — source`. The release skill has a "Steps" section and a "When production fails" section (`ai-kit/skills/pachanguero-release/SKILL.md:19,47`). `verified — source`. The content was decided with the HLD and is in section 4 (`#### docs/test-strategy.md`), written in full at the author's request.

**Approach.** The task writes `docs/test-strategy.md` as section 4 describes: the axes, the tree, the table of tiers with time and gate, the limits, the guided checklist and the worked examples. It refreshes each measured figure with the command that reproduces it, on the day the task runs. It adds one step to the release skill's "Steps": before a release that touches the bank feed, run `npm run test:sandbox` if the standing session is configured, and the guided checklist of `docs/test-strategy.md`. The skill is edited under `skill: ai-docs-editor`. No identifier of this work package appears in either file (section 4, opening rule).

**Impacted Units.**

| Unit | Action |
| ---- | ------ |
| `docs/test-strategy.md` | Modify (restructured) |
| `ai-kit/skills/pachanguero-release/SKILL.md` "Steps" | Modify (one step) |

**Test Methodology.** Not automatable (a document). Read against section 4: every tier has a trigger, a time budget, a gate and a limit; the tree reaches every tier; each figure has its command and date.

**Data Contract Verification.** Not relevant: stores nothing.

**Patterns and Conventions.** System documentation: one source of truth for test placement (`docs/test-strategy.md`), which `AGENTS.md` already points to; a decision tree read top to bottom; figures with their date and command, so they can be refreshed.

**File Changes.** Modify `docs/test-strategy.md` and `ai-kit/skills/pachanguero-release/SKILL.md`.

#### F17 — A one-time rehearsal on a copy of production with the real account

`author decision` (2026-10-19): a manual test at the very end of the work package that validates the complete solution with real data. A throwaway copy of the production database has its payments since 2026-09-01 put back as debts. The real Revolut account is read from 2026-09-01. What the system settles, keeps waiting or discards is then compared with what the organiser recorded by hand. Nothing of it reaches production.

**Current Implementation.**

- The backup sidecar keeps daily copies of the production database in `/backups`, and one is fetched with `kubectl cp <pod>:/backups/<file>.db <file>.db -c backup` (`docs/deployment.md:93`). `verified — document`. Every `kubectl` operation goes through `ai-kit/skills/pachanguero-deployment-management/SKILL.md` (`AGENTS.md`).
- The server opens whatever `PACHANGUERO_DB` names and migrates it after a backup beside it (`server/src/db/index.ts:13-40`). So a local server on a copy also **rehearses the production migration** (steps 3 to 5) on real data. `verified — source`.
- Each payment the organiser recorded is a `payments` row with game, member, payer, amount and date. `ShareSettler.unsettle` puts one back as a debt (R1), and F1 marks every one before this feature as `otro`. `verified — source`.
- `*.db` files are git-ignored, but other files under `data/` are not (`.gitignore`). `verified — source`. The rehearsal's outputs hold real names and amounts, so they live outside the repository.
- WP-005 tried a `http://localhost…` redirect on a sandbox application only: "not tried on the production application" (guide §2). `verified — document`.

**Approach.** A throwaway tool, kept inside the work package, plus a written procedure. No shipped code changes for it.

*The tool* (`specs/active/WP-006-bizum-payment-detection/rehearsal/rehearsal.ts`, run with `npx tsx`). It imports the server's classes by relative path and has two commands:

| Command | Does |
| ------- | ---- |
| `reset --db <copy> --from 2026-09-01` | Refuses unless `<copy>` is given explicitly, is not the default `data/pachanguero.db`, and sits in a folder outside the repository. Writes the **ground truth**, every payment paid on or after `--from` (game, date, member, holder, payer, amount, paid on, names), to `<folder>/ground-truth.json`. Then, in one transaction, puts each back as a debt with `ShareSettler.unsettle`. Finally it writes a marker row (`rehearsal_marker`), so `report` knows the file is a rehearsal copy. |
| `report --db <copy>` | Refuses without the marker. Compares the copy now with `ground-truth.json` and writes `<folder>/report.md`. |

The report classifies every share and every Bizum:

| Class | Meaning | Expected |
| ----- | ------- | -------- |
| **agreed** | an automatic payment for the same game and member the organiser paid by hand; paid-on dates shown side by side | most Bizum-paid shares |
| **disagreed** | an automatic payment for a member the organiser had not paid for that game, or paid by another payer | **none**: each is a wrong payment |
| **extra** | an automatic payment where the organiser recorded none | none, or each explained |
| **open** | a share paid by hand that no Bizum settled | cash, "otro", or a Bizum still waiting |
| **waiting** | each waiting Bizum with its reason and suggestions | reasons that make sense to the organiser |
| **discarded** | counts by rule (R1, R2, R6), and not-a-Bizum entries | no football payment among them, judged from the counts and the organiser's memory, since a discarded Bizum keeps no data |

The report also shows the read's counts and the pairings made during the rehearsal. It names real players and amounts, so it stays in that folder and is never committed. Only its counts (agreed, disagreed, extra, open, waiting, discarded) are copied into the work package's retrospective as evidence.

*The procedure* (written in `rehearsal/README.md`, beside the tool):

1. Through the deployment-management skill, fetch the latest daily backup from the sidecar into `~/pachanguero-rehearsal/` (read-only on production).
2. Run `reset` on it with `--from 2026-09-01`.
3. Build and start the application locally on the copy. Set `PACHANGUERO_DB` to the copy, `PACHANGUERO_BACKUPS` to `~/pachanguero-rehearsal/backups`, and `PACHANGUERO_PUBLIC_URL=http://localhost:8787`, with the production Enable Banking id and key in the local `.env` (never in the repository). Note that the migration to the new schema ran and wrote its backup.
4. In the production application of the Enable Banking Control Panel, add `http://localhost:8787/api/bank/callback` to the allowed redirect URLs. **If it is refused**, stop: the rehearsal needs another way back from the bank, and the author decides it (it is not tried by the design).
5. In Ajustes › Banco: connect on a desktop browser, approve in the Revolut app, choose the EUR account, set the start date to 2026-09-01, and press "Leer ahora".
6. In Deudas, go through "Bizums en espera". Pair senders with players, helped by the suggestions, and note each pairing; that also tests re-evaluation after pairing. Rule or dismiss only where the organiser would really do so.
7. Run `report` and read it with the organiser.
8. In the panel, press "Desconectar". This closes the rehearsal's session at the bank and leaves the production connection, if any, untouched (sessions are separate, guide §7). Remove the localhost redirect URL from the Control Panel. Keep or delete the folder at will; nothing of it is in the repository.

**Passes when:** the report has **no disagreed** payment and every extra one is explained (VISION's "never settled wrongly"). Every waiting Bizum's reason is one the organiser understands. The migration ran on the real file without error. **Fails** on any wrong payment, which is then an escalation on F3's rules or F4's dialect.

**Impacted Units.**

| Unit | Location | Action |
| ---- | -------- | ------ |
| the rehearsal tool (`RehearsalReset`, `RehearsalReport`, a small command entry) | `specs/active/WP-006-bizum-payment-detection/rehearsal/rehearsal.ts` | Create |
| the procedure | `specs/active/WP-006-bizum-payment-detection/rehearsal/README.md` | Create |

Nothing under `server/`, `web/`, `deploy/` or `docs/` changes for it, and nothing outside the work package names it.

**Test Methodology.** Manual, once, last in the work package, after F1 to F16 are done and pass their own tests. It is tier 6 of 2.10 (the live check), here made into a comparison with ground truth. The tool itself gets one quick check before use: on a copy of the local database, `reset` then `report` with no bank read lists every ground-truth share as **open** and nothing else.

**Data Contract Verification.**

| Data | From | To | Note |
| ---- | ---- | -- | ---- |
| ground truth | `payments` joined with games and players, on the copy | `ground-truth.json` (local folder) | read before any change |
| reverted payments | `ShareSettler.unsettle` | `share_debts`, participations reset | the invariant "a share is in one table or the other" holds |
| marker | `reset` | `rehearsal_marker` (a table only the tool creates) | `report` refuses a file without it, so it never runs on a real database |
| report | the copy plus `ground-truth.json` | `report.md` (local folder) | real names: never committed |

**Patterns and Conventions.** A throwaway tool lives with the work package that needs it, guarded so it cannot touch a real database. Personal data stays outside the repository, and only counts enter the work package's records.

**File Changes.** Create the two files above. Nothing else.

## 4. Documentation Impact

One subsection per document made untrue. The first was written in full with the HLD because the author asked for it to be the output of a task of this work package (element F16).

#### docs/test-strategy.md

**What stops being true.** It describes three layers (unit, integration, E2E) and a deployment settings test, and its rule of thumb ("the smallest layer that can make this claim false") is the only guidance on choosing. It says the repository has no precedent for an external HTTP dependency (study Q-13). Neither holds once the bank exists: there are now tiers with a network, a person, a credential and a time cost, and the choice among them is not a matter of layer alone.

**What replaces it.** The document gains a **decision tree** and a **table of limits**, and keeps the existing per-layer sections, each with a new "Time" and "Gate" line. Content, to be written by the task:

1. *The axes of the decision, in this order:* (a) what claim can be false (the smallest layer that can show it); (b) what the test needs: network, a credential, a signed-in person, a real bank; (c) how long it takes; (d) whether it is deterministic; (e) where it may run (the pre-commit hook, before merging, before a release, on request).
2. *The tree, asked top to bottom, stopping at the first yes:* a rule or calculation with no I/O → unit; SQL or route wiring, or our code against an in-process fake → integration; a setting the deployment must provide → deployment settings test; our connector talking HTTP to the aggregator → the contract tests against the fake Enable Banking server (integration tier), and the same contract against the sandbox when asked; a journey across screens that no lower layer can show → E2E, with its justification; whether the fake still matches the real API → the sandbox suite; something only a signed-in person can do → the guided checklist; something only the real bank shows → the live check.
3. *A table of tiers with time and gate:* for each tier its home, runner, command, what it needs, its time budget and the measured time, and its gate (hook, before merge, before release, on request). Starting values: `npm test` 29 s wall for both workspaces, each unit test under 100 ms, each integration test under 1 s; E2E 4 min 15 s for 40 tests (6 to 9 s each), a new journey must name what no lower layer shows and fit in about 10 s; the sandbox suite about 2 minutes, never in the hook. Measured on 2026-10-17; the document states the date and the command that reproduces each figure, so the figures can be refreshed.
4. *Limits and constraints:* nothing run by the hook or by `npm test` touches a network or a secret; the sandbox suite is read-only, refuses to run unless its configuration names the sandbox, never edits the fixture, skips (not fails) when unconfigured, and its key and session stay in the local `.env`; E2E shares one database and one worker and stays small; a test that needs a person is a checklist item, not a suite.
5. *The guided checklist* for a release that touches the feed (a fresh consent through the callback on `localhost`, an entry added after a read, a pending entry becoming booked), with what to observe after each action, and the matching step in the `pachanguero-release` skill.
6. *Worked examples* from this work package: the Bizum scenarios and the tier each lands in (the table of 2.10).
7. *The rule of thumb stays*, now ending: "…and prefer the cheaper and faster of two layers that can both show it."

#### docs/domain-model/glossary.md and ciclo-del-partido.md (Spanish)

**Stops being true:**

- The glossary's payment entry ("al pagarse deja de ser deuda y pasa a ser un pago", line 105) does not say how a payment was made or that the system can make one.
- `ciclo-del-partido.md` § "Pago después de jugar" (lines 132-140) describes manual payment and undo only, and nothing happens to Bizums when a game becomes played.

**Replaces it:**

- In the glossary: **método de pago** (efectivo, Bizum, otro; the old payments read "otro"); **Bizum** (a credit read from the bank, kept only when the rules keep it); **nombre de Bizum** (how a player appears on Bizum, a property of the player, not an alias); **Bizums en espera** (what the rules did not settle, with its reason); **descartar** (forever: only the bank's identification stays).
- In `ciclo-del-partido.md`:
  - a payment can be made by the system from a Bizum, by the rules R1–R7, in order;
  - marking a game played also settles the waiting Bizums that now qualify, never discarding one;
  - undoing a payment that came from a Bizum undoes all of that Bizum's payments and returns it to the list;
  - debts are not carried across seasons, by a Bizum or by a ruling.

#### docs/users-and-roles.md

**Stops being true:**

- "What a player sees of the others" says nothing of payment methods.
- The contact data paragraph says "The application sends nothing with them; they are there so the organiser knows how to reach them". The phone now also identifies the player as a Bizum sender.

**Replaces it:**

- Bank data, Bizums, sender names and the Banco panel are admin only, and are refused in "Ver como jugador" and "Ver como otro jugador".
- A player sees the method of each of their payments, and nothing of the Bizum behind it.
- The phone the player keeps is also how the system recognises a Bizum sent from it, so changing it changes that.

#### docs/commands.md and .env.example

**Stops being true:** the Configuration table lists every setting the server reads, and the npm scripts list every script; neither has the bank.

**Replaces it:**

- The table gains `PACHANGUERO_PUBLIC_URL` (no default; the address the browser reaches the app at; the bank's return address is it plus `/api/bank/callback`), `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY` (no default; without them the app runs and the Banco panel says what is missing), and `ENABLE_BANKING_API_URL` (the real host by default; set only by the end-to-end tests).
- The scripts gain `npm run test:sandbox` and its settings (F15), with "tests only".
- `.env.example` gains the same, commented, with the key's `openssl` line.

#### docs/backup_and_restore.md

**Stops being true:** a backup is described as the group's data.

**Replaces it:** a backup now also holds bank data. That includes the bank session id, which reads the account until the consent ends, and the senders, subjects and amounts of the kept Bizums. A backup copy must be kept as private as the bank account itself. A restored backup taken under an earlier connection may hold a closed session: the panel then asks to reconnect.

#### docs/deployment.md

**Stops being true:**

- The deployment-impact table's setting row says no `env:` entry exists yet and the Secret carries only `JWT_SECRET`.
- The document has no step for the bank.

**Replaces it:**

- That row reads that `PACHANGUERO_PUBLIC_URL` is the first `env:` entry and the Secret also carries the two optional bank secrets.
- A short section, "The bank connection", covers:
  - registering the production application in the Enable Banking Control Panel;
  - making the key (the `openssl` line);
  - listing `https://pachanguero.duckdns.org/api/bank/callback` exactly as an allowed redirect URL;
  - putting the id and key in `values.secrets.yaml`;
  - connecting from the Banco panel on a desktop browser.

#### AGENTS.md

**Stops being true:**

- The Architecture map lists `server/src/domain/`, `db/`, `repo/`, `routes/`, `cli/` and the web folders, and nothing reads a bank.
- The Commands list has no sandbox suite.
- The invariants have no payment method.

**Replaces it:**

- The map gains `server/src/bizum/` (the bank-neutral Bizum core; it imports nothing of the application, and a test enforces it) and `server/src/bank/` (the Enable Banking connector, the Revolut dialect, the catalogue, the fakes). It also gains the new services (`BizumHandler`, `BizumSettlementService`, `BizumResolutionService`, `SenderPairingService`, `BizumUndoService`, `BankConnectionService`, `BankSettingsService`), the routers, and the poller started by `index.ts`.
- The invariants gain: every payment has a method; a Bizum payment links its Bizum; a Bizum is processed once, keyed by the bank's identification; a sender is identified only by a stored Bizum name or phone; only `server/src/bank/` names a bank.
- Commands gain `npm run test:sandbox`.

#### .agents/rules/coding-standard.md

**Stops being true:** nothing, but the core's boundary is a rule a coder must know before touching `server/src/bizum/`.

**Replaces it:** one line under "What this changes about the existing codebase": the Bizum core in `server/src/bizum/` imports nothing outside itself but Node built-ins (and `better-sqlite3` in `sqlite/`), checked by `architecture-boundaries.test.ts`.

#### README.md

**Stops being true:** "What it does" lists sign-ups, payments and the selection, but not reading Bizums.

**Replaces it:** one item: the organiser can connect the bank account, and the Bizums of players settle their debts by themselves, the uncertain ones waiting for the organiser.

#### Not this work package's

The stale Raspberry Pi statements of the Study's doc map (2.8) remain as they are.

Every document named here is written without any identifier of this work package (requirement, element, scenario or work-package name), so that it reads on its own.

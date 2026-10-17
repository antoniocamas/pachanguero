# Design — WP-006-bizum-payment-detection

**Depth: deep** (agreed with the author, 2026-10-17). At stake: money recorded against players, a schema change on the live production database, a bank secret, and a public callback; a wrong shape is expensive to take back. **Budget:** the HLD about 8 pages; one Low Level Design subsection per element once the HLD and the agenda are approved.

**Artifact types:** Code (backend classes, per `.agents/rules/coding-standard.md`), Frontend (components, hooks), Database (tables, columns, a migration step), Infrastructure (Helm chart values and templates), System documentation.

**Status of this document:** the HLD, approved by the author on 2026-10-17 with the confirmations of the owed list below, and with the test methodology as amended in 2.10 (the sandbox questions M-1 to M-7 were answered by WP-005, `output/enable-banking-sandbox-testing.md` and `pachanguero-sandbox-testing.md`, taken as reference). The agenda, section 3 and the rest of section 4 follow. The agenda and the Low Level Design (section 3) and the top-level Documentation Impact (section 4) are written after the HLD is approved.

## 1. Current Implementation

Confirmed for this approach only; the study did the discovery (`study/`).

- **Payments have one writer.** `PaymentService.pay` and `undo` (`server/src/repo/payment-service.ts`) move a share between `share_debts` and `payments`; `settle` is private and runs inside the `pay` transaction, after `lifecycle.require(gameId, 'pay')`. `verified — source`. The `payments` table has no method and no link to anything (`server/src/db/schema.sql`, the `payments` table). `verified — source`.
- **Played effects run inside the lifecycle transaction.** `GameLifecycleService.perform` writes the new state and then calls every `PlayedEffect.apply` in one transaction; `BillingEffect` is the one that creates debts (`server/src/repo/game-lifecycle-service.ts`, `billing-effect.ts`). `PaymentService` takes `GameLifecycleService` in its constructor, and the lifecycle service takes its effects in its constructor, assembled in `server/src/repo/index.ts`. An effect that needed `PaymentService` would make a cycle. `verified — source`.
- **Access control is by mount order.** `ApiRoutes` mounts the public router, then `Authenticate`, then the session, own (`/me`) and admin routers; the admin router is the module-level `api` in `routes/api.ts` (`server/src/routes/api-routes.ts`). `verified — source`. The session cookie is `HttpOnly; SameSite=Strict; Path=/api/auth` (`routes/cookie-jar.ts`). `verified — source`.
- **Settings come from the environment**, read by `AuthConfig.fromEnv` and `index.ts`; the deployment-settings test fails when a variable the server reads is neither in the `Dockerfile`, the chart nor its allow-list (`server/src/deployment-settings.test.ts`). `verified — source`. In production the chart passes only a Secret through `envFrom`; it carries `JWT_SECRET` alone, and the chart has no plain `env:` entries yet (`deploy/helm/pachanguero/templates/deployment.yaml`, `secret.yaml`). `verified — source`.
- **Production is deployed and known.** The application runs at `https://pachanguero.duckdns.org` on `erebor`, one replica, `Recreate`, one SQLite file on a PVC (`docs/deployment.md`; `deployment.yaml`). `verified — document`. This falsifies the Study's "deployment is undecided" and the requirements' placeholder address: the address is now a known value of `PACHANGUERO_PUBLIC_URL`, set in the chart (`author decision`, 2026-10-17: the address is a configuration parameter).
- **Name matching is equality, not abbreviation.** `NameMatcher` matches a whole name or alias, case- and accent-insensitively, and reports `ambiguous` rather than guess (`server/src/domain/name-matcher.ts`). A Bizum sender is `First S.S.` (guide §6), which `NameMatcher` never matches; UC-006-03-S1 row 2 needs a looser, still never-guessing fit. `verified — source`, and `verified — invocation` for the players: 43 players in the local database, of which 27 have a one-word name, 14 two words, 2 more (read-only count, 2026-10-17).
- **JWT signing and HTTP exist.** `jose` 6.2.12 is already a dependency; a PKCS#8 RSA key (what `openssl req -newkey rsa:… -nodes` writes) imported with `importPKCS8` signs an RS256 token whose header is `{typ: JWT, alg: RS256, kid}` (run here, 2026-10-17). Node 26 ships `fetch` (`node --version`; `Dockerfile` `FROM node:26-slim`). `verified — invocation`.
- **The bank's behaviour** (a Bizum is a booked credit whose remittance has two strings, the last starting `Bizum payment from: `; the entry is identified by `identification_hash` plus `entry_reference`; closed sessions answer 401 with an error code) is the WP-005 guide's, observed on the real account (`specs/active/WP-005-enable-banking-bizum-poc/output/enable-banking-revolut-integration.md` §5–§7, §9). `verified — document`.

## 2. High Level Design

### 2.1 Architecture

**Three layers, one direction of dependency** (`author decision`, 2026-10-17: the Bizum handling is designed as if it were a reusable library, though it will not be extracted). The **Bizum core** knows what a Bizum is and how to read, remember and hand on Bizums, and nothing about Pachanguero or any bank. **Bank adapters** translate a bank's entries into the core's model. **Pachanguero integration** decides what a Bizum means for players, debts and payments. Arrows point only downward: integration and adapters import the core; the core imports neither (a test enforces it, element F2).

Units first, in the artifact types' own vocabulary; the components are groupings of them.

| Component | Units | Responsibility |
| --------- | ----- | -------------- |
| **Bizum core** (new, `server/src/bizum/`) | Model: `Bizum`, `BizumParty`, `BizumDirection`, `BizumKey`. Ports: `BizumDialect`, `BankConnector`, `BizumPolicy`, `BizumStore`, `Clock` (the existing one). Engine: `BizumFeed`, `BankEntryLedger`, `BankPoller`. SQLite implementations of the stores and the core's own tables in `server/src/bizum/sqlite/` | The generic Bizum, the ports around it, and the read loop: read, recognise, judge once, keep or forget, remember. |
| **Bank adapters** (new, `server/src/bank/`) | `EnableBankingConnector` (implements `BankConnector`: JWT, authorisation, sessions, pages), `EnableBankingConfig`, `RevolutDialect` (implements `BizumDialect`), `BankCatalogue` | Everything that names Enable Banking or Revolut. A new bank on the same aggregator is one dialect class and one catalogue line; a new aggregator is one connector class. |
| **Pachanguero integration** (new, `server/src/domain/bizum-*.ts`, `server/src/repo/bizum-*.ts`) | Domain: `BizumRuleSet` (R1–R7, implements `BizumPolicy`), `KeywordList`, `SenderNameFit`, `SenderIdentification`, `NearestDebtOrder`, `ConnectionClock`, `PublicUrl`. Repo: `BizumHandler` (the keep side of the policy), `BizumSettlementService`, `BizumResolutionService`, `SenderPairingService`, `BizumUndoService`, `BizumReevaluationEffect`, `BankConnectionService`, `BankSettingsService` and their repositories | The rules of the group: who a sender is, which shares a Bizum pays, the waiting list, the organiser's rulings, the panel's state. |
| **Payments** (existing, modified) | `PaymentService`, `ShareSettler` (new, extracted), `PaymentRepository`, `DebtRepository`, `OwnDataService`, `OwnDisclosure` | Settling shares; now with a method and an optional Bizum link; nearest-first debt reads. |
| **Database** (existing, modified) | `schema.sql`, `schema-migrator.ts` (`MigrationStep` 3, `LATEST_SCHEMA_VERSION` 3) | The core's tables, the integration's tables, the new `payments` columns. |
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
| `schema.sql`, `schema-migrator.ts`, migration step 3 | schema | `server/src/db/` | Modify | the core's tables, the integration's tables, `payments` columns |
| composition root | module | `server/src/repo/index.ts` | Modify | wires core, adapters, integration and the effect |
| callback and admin routers; `ApiRoutes`, `ServerApp`, `server/src/index.ts` | class | `server/src/routes/`, `server/src/` | Create / Modify | |
| Banco panel, banner, waiting list, dialogs, method field, detail, hooks | component, hook | `web/src/components/`, `web/src/hooks/`, `web/src/pages/` | Create / Modify | Spanish copy |
| `values.yaml`, `deployment.yaml`, `secret.yaml`, `values.secrets.yaml.example`, `.env.example` | chart, env | `deploy/helm/pachanguero/`, repository root | Modify | |
| `FakeBankDialect`, `FakeBankConnector`, `FakeEnableBankingServer`, fixtures, the boundary test | class, test | `server/src/bizum/`, `server/src/bank/`, `e2e/` | Create | |

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
type Recognised = { kind: 'bizum'; bizum: Bizum } | { kind: 'ignore'; why: 'not_a_bizum' | 'pending' };

interface BizumDialect {               // what one bank's entries look like
  readonly id: string;  readonly displayName: string;
  recognise(raw: RawEntry): Recognised;
  describeAccount(raw: RawAccount): AccountChoice;   // currency, type, last 4 of the identifier
}
interface BankConnector {              // how entries and consent are obtained
  begin(redirectUrl: string, state: string, validUntil: Date, bank: BankRef): Promise<string>;
  complete(code: string): Promise<{ sessionId: string; validUntil: Date; accounts: RawAccount[] }>;
  close(sessionId: string): Promise<void>;
  entries(account: AccountRef, dateFrom: string): AsyncIterable<RawEntry>;   // follows every part
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
| `ENABLE_BANKING_PRIVATE_KEY` | yes | PEM PKCS#8, multi-line. |

Absent keys are not a start-up error: the server starts, the Banco panel names the missing setting (UC-006-01-S2) and manual payments are unaffected (VISION §5). The deployment-settings test makes the chart carry all three.

**Database** (all in `schema.sql` and in `MigrationStep` 3). Core tables carry no Pachanguero column; integration tables reference them, never the reverse.

| Owner | Table | Holds |
| ----- | ----- | ----- |
| core | `bizum_entries` | the ledger: account, bank reference, outcome — unique on the pair (D-2) |
| core | `bizums` | kept Bizums: key, direction, booked on, `amount_cents`, currency, sender name/phone, receiver name/phone, subject |
| core | `bizum_feed_state` (one row) | last read time and result, the account read |
| adapters | `bank_connection` (one row at most) | bank id, session id, `valid_until`, state (`connected`, `reconnect_needed` with reason code), accounts as last 4 / currency / type / hash |
| adapters | `bank_pending_authorization` | single-use `state`, `expires_at` (15 minutes) |
| integration | `bank_settings` (one row) | bank id, currency (default `EUR`), chosen account hash, start date |
| integration | `bank_keywords` | `list` (`include` / `exclude`), `word` (stored folded) |
| integration | `bizum_handling` | per kept Bizum: `waiting` or `settled`, reason code, `unallocated_cents`, how settled (`automatic`, `organiser`) |
| existing, modified | `payments` | + `method`, + `bizum_id` |

Sender pairings reuse `player_aliases` (name senders) and `player_contacts.phone` (phone senders) (`author decision`, UC-006-05-S1); no new table.

**Routes.** Public: `GET /api/bank/callback?state&code|error`. Admin (behind `requireEffective('admin')`): `GET /api/bank` (panel state), `PUT /api/bank/settings`, `PUT /api/bank/words`, `POST /api/bank/connect` (returns the bank's URL), `POST /api/bank/disconnect`, `POST /api/bank/read` (force a read; answers when it ends, with the number of entries processed or the refusal), `GET /api/bank/banner`; `GET /api/bizums/waiting`, `POST /api/bizums/:id/pair`, `POST /api/bizums/:id/rule`, `POST /api/bizums/:id/dismiss`, `GET|DELETE /api/bizums/pairings`, `GET /api/payments/:id/bizum`; the existing `POST /games/:id/payments` gains `method`, and `DELETE /games/:id/payments/:id` also undoes the other payments of the same Bizum. Nothing is added under `/me`; `OwnRouter` only gains `method` in the payment rows.

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
| F2 | The Bizum core's model and ports, and the boundary that keeps it free of Pachanguero | Bizum core, Test support | `Bizum`, `BizumParty`, `BizumKey`, the ports, a boundary test over `server/src/bizum/` imports | UC-006-02-S1 (the record), constraint "no code outside the bank support names Revolut" | terminal | unit tests; the boundary test fails if the core imports `repo/`, `domain/` rules, `routes/` or a bank adapter | this document §2.4, `.agents/rules/coding-standard.md` |
| F3 | The ordered rules R1–R7 as the policy; keyword lists, sender fit, nearest-first, season-restricted debts | Pachanguero integration | `BizumRuleSet`, `KeywordList`, `SenderNameFit`, `SenderIdentification`, `NearestDebtOrder`, `DebtRepository` read | UC-006-03-S1–S4, S7, S8; UC-006-11-S1, S2 | terminal | unit table tests over the rows of the scenarios | `docs/domain-model/README.md`, F2 |
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
| F15 | A second, fake bank; a fake Enable Banking server; the shared connector contract tests; the opt-in sandbox suite and its guard | Test support | `FakeBankDialect`, `FakeBankConnector`, `FakeEnableBankingServer`, `BankConnectorContract`, `test:sandbox` suite, fixtures | success criteria rows 7 and 8 of the requirements | terminal | the contract tests pass against the fake server on every commit; the sandbox suite passes on request | `docs/test-strategy.md` (as amended by F16), `specs/active/WP-005-enable-banking-bizum-poc/output/pachanguero-sandbox-testing.md`, F2 |
| F16 | The test strategy as a decision tree, with the Bizum tiers and the guided checklist | Documentation | `docs/test-strategy.md`, the checklist, the `pachanguero-release` step | the requirements' success criteria (how each is tested) | terminal | read against 4: every layer has a trigger, a time budget, a gate and a limit | `docs/test-strategy.md`, this document 2.10 and 4 |

All 17 elements are `terminal`; no deferral is carried. Every scenario of the requirements has an element behind it (UC-006-01-S11 and S12 are carried by F5: the poll error codes and the no-secrets constraint).

### 2.8 Documentation Impact

From the Study's doc map, re-read against the code of today:

- `docs/domain-model/glossary.md`, `ciclo-del-partido.md` (Spanish): payment method, a payment created by the system, the Bizum, the waiting list.
- `docs/users-and-roles.md`: bank data and sender names are admin only; the player's payments show the method.
- `docs/commands.md`: three new settings and the production values; the `Configuration` table.
- `docs/backup_and_restore.md`: backups now hold bank data (session id, senders, subjects).
- `docs/deployment.md`: the deployment-impact table now has a first plain `env:` entry and new secrets.
- `docs/test-strategy.md`: rewritten as a decision tree for when to use each layer (4, element F16).
- `AGENTS.md`: the new components, the payment method invariant, and `PACHANGUERO_PUBLIC_URL`.
- `.env.example`: the three keys.
- **Not this work package's:** the stale Raspberry Pi statements the Study listed (`README.md`, `docs/commands.md`, `docs/backup_and_restore.md`, `deploy/pachanguero.service`, the comment in `server-app.ts`) predate it; they remain true or false independently of Bizums and are left as they are.

### 2.9 Risks

| Risk | Handling |
| ---- | -------- |
| A wrong player is paid by a name fit | R3 needs a sender that fits *exactly one* player, a whole number of shares, and open debts that cover them; the fit is the stricter reading of "first name plus initials" (F3); every automatic payment is undoable (F10) and traceable (F11). Measured live, not by replay (the history is not in the database). |
| The one-word player names (27 of 43) make a "Marta G.L." fit the one-word player "Marta" | Intended by the author (UC-006-03-S1). A second "Marta" turns the sender ambiguous, so it waits (R7). |
| A migration on the live database | Step 3 runs after the automatic `…-before-migration.db` backup (`SchemaMigrator`); it only adds columns/tables and backfills `otro`; tested on a copy of the 67-payment shape. |
| The forced read exhausts the bank's allowance | One read at a time; a minimum gap of 5 minutes between the end of one read and the start of the next, scheduled or forced (refusal: "Espera unos minutos"); after a rate-limit answer the button is disabled until the stated retry time. The gap is a constant. |
| Rate limit unknown (Q-11) | Default every 6 hours (4 a day, the documented background allowance); on `ASPSP_RATE_LIMIT_EXCEEDED` the poller waits 6 hours; the failure is shown in the panel. Tuned after the probe; the interval is a constant. |
| A pending Bizum shows differently than assumed | Only `BOOK` entries are processed; anything else is skipped and read again next time, so the worst case is delay. |
| Secrets leak through logs or responses | One class (`EnableBankingConnector`) holds the key; errors it throws carry the bank's error code, never the request; no route returns session, state or code; a test greps responses and the log of a fake run. |
| The cross-site redirect loses the sign-in | Checked in the E2E and by hand; if it fails, the panel shows the login first and the result remains in the URL code (UC-006-01-S4). |
| The generic model hides a bank-specific need (a second bank has a field or meaning the model lacks) | The model is the superset the author listed (direction, sender, receiver, name, phone, subject, id, date, amount); `FakeBankDialect` (F15) fills a different subset than Revolut, so the rules are proved against two shapes; the model grows by adding an optional field, never by branching on a bank. |
| The core quietly starts importing Pachanguero code | A boundary test (F2) fails the suite on any import from the core into `repo/`, `domain/`, `routes/` or `bank/`. |
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

**Constraints of the sandbox suite** (from WP-005 §2, §9 and the author's choice): it only reads, because `DELETE /sessions` ends the standing session and a person must authorise again; it never edits the fixture (uploaded once by hand; the upload is behind a CAPTCHA that must not be bypassed); it lists the account first and refuses to run if the entry count differs from the expected one; it refuses to start unless its configuration names the sandbox application and the Mock ASPSP, because selecting the sandbox by an unset variable once sent real calls to the production account; its key and session live in the organiser's local `.env`, never in the repository; the Mock bank maps to the Revolut dialect only in the test composition, never in the production catalogue (`inferred`: honest for the recognition fields, which match the real payload in presence, type and wording); the sandbox and production share one API host, so the connector takes the base URL through its constructor and no setting or chart entry is added.

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

The Manual Test Plan guidelines for each `No` are written in that element's Low Level Design subsection.

### 2.11 Patterns and Conventions

- **Backend (coding standard):** classes only, no free functions or stateless statics; ports (`BizumDialect`, `BankConnector`, `BizumPolicy`, `BizumStore`, `PlayedEffect`) with narrow roles; Adapter for each bank and aggregator (anti-corruption layer: raw entries never leave `server/src/bank/`); Strategy for judging (`BizumRuleSet` is an ordered list of rule objects, so a rule is a class, not a branch, and the order is data); dependency direction enforced by a test; composition root `repo/index.ts`; routers as classes with `.router()` like `AuthRouter`; the clock injected (`Clock`) so the poller and the expiry are driven by tests.
- **Transactions:** one `conn.transaction` per Bizum settled, as `PaymentService.pay` does today.
- **Frontend** (`.agents/rules/frontend-coding-standard.md`): function components, one hook per remote resource, pure display logic in `lib/` with vitest tests; Spanish copy.
- **Schema:** new tables in `schema.sql` and the same change as `MigrationStep` 3; money in integer cents; dates as ISO text.
- **Chart:** secrets in the Secret, plain settings as `env:` entries, both guarded by the deployment-settings test.

### Completeness record

| Detector | Result |
| -------- | ------ |
| D1 grounding | Every claim of §1 carries its tag and citation. Unverified at HLD altitude: that Enable Banking accepts the production address as an allowed redirect URL (`verified — document` for the mechanism, WP-005 guide §2, §9 `REDIRECT_URI_NOT_ALLOWED`; the registration of `https://pachanguero.duckdns.org/api/bank/callback` is an operator step, `assumed` done until the first connection). |
| D2 assumptions | (1) The 6-hour interval is within the bank's limit — `inferred` from the guide §8, carried as a risk. (2) A pending Bizum is never `BOOK` — `inferred`, handled by skipping. (3) The strict cookie survives the cross-site redirect — `inferred`, checked in E2E. (4) A 15-minute authorisation lifetime is enough for the owner to approve in the Revolut app — `assumed`, a constant. (5) `SameSite` sign-in behaviour of a phone browser on return — manual. |
| D3 reachability | Every component lists named units; every element names its units and scenarios; no part is described as "figure out X". |
| D4 pre-mortem | F2/F4: "what if the next bank gives a Bizum with no subject, or both parties named?" — the model's fields are all optional except direction, date, amount and key; `FakeBankDialect` exercises it. F3: "what if `Luis P.R.` also fits a second Luis next season?" — it becomes ambiguous and waits (R7). F7: "what if the bank returns the same entry with another `entry_reference`?" — the guide says it is stable, `verified — document`; a duplicate would be a second Bizum, the one case the rules cannot detect (listed in Risks of F7's LLD). F9: "what if `perform` is called with no debts?" — the effect finds nothing to settle and returns. F10: "what if a Bizum paid games that are no longer `played`?" — undo refuses the whole set (the existing `require('pay')`), nothing changes. |

Deferrals: **0**; reason distribution: —.

### Owed to the author before the HLD is approved

*Decisions:* none (no R2 deferral).

*Confirmations* (each is a choice the design made for the author):
1. The meaning of "a name fits a player" (F3): the sender's first name equals the player's first name (case and accents ignored); the sender's initials, if any, must equal the initials of the player's further words, and if the player has a one-word name the initials are ignored. Worked: `Marta G.L.` fits the player "Marta" and the player "Marta García López", not "Marta García Pérez"; `Marta` alone fits both. `inferred` from UC-006-03-S1 and the WP-005 tiers; `not yet run`.
2. A read every 6 hours, a 15-minute authorisation lifetime, and the 14-day banner threshold as constants, not settings.
3. The names `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY`, and `PACHANGUERO_PUBLIC_URL` (as you chose).
4. Requirements place the panel under Manage, while the sketches call it "Ajustes › Banco"; the design follows the requirements text (Manage → Banco).
5. The folder layout of the library-shaped parts: core in `server/src/bizum/`, adapters in `server/src/bank/`, and a vitest boundary test (F2) instead of an ESLint rule, so no lint rule is touched. A new `no-restricted-imports` rule would be an addition, not a downgrade; say if you prefer it.
6. The generic `Bizum` fields (2.4): direction, sender and receiver (each a displayed name and a phone), subject, bank key, booking date, amount in cents and currency. Say if a field you had in mind is missing.
7. The forced read: "Leer ahora" in the Banco panel and in Deudas, a 5-minute minimum gap between reads, and a new scenario UC-006-02-S9 that the requirements do not yet contain. The requirements are settled, so adding S9 (and its sketch on the Banco screen) is an amendment of `REQUIREMENTS.md` through `auctor-requirements` before the Design phase closes; say if you want it handled that way.

## 3. Low Level Design

To follow, one subsection per element, after the agenda is approved.

## 4. Documentation Impact

One subsection per document made untrue. The first is written in full because the author asked for it to be the output of a task of this work package (element F16); the others are stated at HLD altitude and are detailed with the Low Level Design.

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

#### Other documents (HLD altitude)

- **`docs/domain-model/glossary.md`, `ciclo-del-partido.md`** (Spanish): gain payment method, a payment created by the system, the Bizum, the waiting list.
- **`docs/users-and-roles.md`:** gains the disclosure rule: bank data and sender names are admin only; the player's payments show the method.
- **`docs/commands.md`, `.env.example`:** gain `PACHANGUERO_PUBLIC_URL`, `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` and the optional sandbox settings for `npm run test:sandbox`.
- **`docs/backup_and_restore.md`:** backups now contain bank data (the session id, senders, subjects).
- **`docs/deployment.md`:** the impact table's setting row now has its first plain `env:` entry and new secrets.
- **`AGENTS.md`:** the new components, the payment-method invariant, the Bizum core and its boundary, and the new commands in the list of commands.
- **`.agents/rules/coding-standard.md`:** one line naming the Bizum core's boundary (it imports nothing of the application).

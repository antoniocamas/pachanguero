# Task 04 — Bank access: the fakes, the contract, the connector, the connection and the chart

## Type

**Feature.** Iteration 1. Elements absorbed: **F15**, **F5**, **F14**. Depends on: task 03.

## Mandatory Reading

- `DESIGN_PLAN.md`: the HLD (2.4, 2.5, 2.9, 2.10), and section 3 `#### F5`, `#### F14` and `#### F15`; the diagram `design/diagrams/connect.puml`.
- `REQUIREMENTS.md`: UC-006-01 (S1–S5, S8–S13).
- WP-005 guides: `specs/concluded/WP-005-enable-banking-bizum-poc/output/enable-banking-revolut-integration.md` §2–§4, §7–§9; `enable-banking-sandbox-testing.md` §2, §5–§9; `pachanguero-sandbox-testing.md`.
- `docs/deployment.md#deployment-impact-of-a-change`.
- `AGENTS.md`; `.agents/rules/coding-standard.md`; `docs/test-strategy.md`.
- Before running `helm`, read `ai-kit/skills/pachanguero-deployment-management/SKILL.md` (local `helm lint`/`helm template` only; no cluster operation).
- The `jose` 6 documentation for `SignJWT` and `importPKCS8`, and the Express 5 router documentation.
- Discover, through `AGENTS.md`, the guidelines for each file touched.

## Description

Make the organiser able to connect, complete, renew, disconnect and see the expiry of the bank access, on the server. Secrets never leave it. The chart carries the settings and secrets. Because the connector is written against them, this task also builds the test support:

- the fake bank and the fake Enable Banking server;
- the shared contract;
- the opt-in sandbox suite with its guard;
- the E2E wiring.

## Guidelines

1. **F15, the fakes first.** Write:
   - `server/src/bank/fake/` (`FakeBankDialect`, `FakeBankConnector`, `FakeEnableBankingServer`, its process entry, `fixtures/accounts.json` and `fixtures/entries.json`, anonymised, more than 100 entries);
   - `bank-connector-contract.ts`;
   - `server/vitest.config.ts`, which excludes `*.sandbox.test.ts`, and `vitest.sandbox.config.ts`;
   - the `test:sandbox` scripts.
2. **F5, the connector.** Write `EnableBankingConfig`, `EnableBankingToken` and `EnableBankingConnector` with the error mapping table, then run the contract against the fake (`enable-banking-connector.contract.test.ts`).
3. **F5, domain and repo.** Write:
   - `PublicUrl` and `ConnectionClock`;
   - the two tables (no migration step), with `bank_connection` including `deep_read_done` (F7's amendment);
   - `BankAuthorizationRepository` and `BankConnectionRepository`;
   - `BankConnectionService` with the `SetupCheck`, `BankChoice` and `StateSource` ports. Until task 05, the composition passes a `BankChoice` that returns no dialect, so connect refuses with "no supported bank".
4. **F5, HTTP.** Write `BankCallbackRouter` (public; a 302 to the relative `/?bank=<code>`) and `BankAdminRouter` (`GET /bank`, `POST /bank/connect`, `POST /bank/disconnect`, `GET /bank/banner` with `canRead`, false until task 06). Compose them in `ServerApp`, and read the settings in `index.ts`. Add `ENABLE_BANKING_API_URL` to `LEFT_TO_APPLICATION_DEFAULT`.
5. **F15, the sandbox suite and E2E wiring.** Write:
   - `bank/sandbox/enable-banking.sandbox.test.ts`, which runs the contract's read-only cases;
   - `SandboxSettings` and `SandboxGuard` (a `-test-support` file);
   - the E2E: `e2e/playwright.config.ts` makes a key pair, starts the fake as a third `webServer`, and passes the settings; plus `e2e/support/fake-bank.ts`.
6. **F14.** Edit `values.yaml`, the `env:` entry in `deployment.yaml`, the optional secrets in `secret.yaml` (the app id under `stringData`, the key under `data` with `b64enc`), and `values.secrets.yaml.example`. Update `.env.example`. Then run `helm lint` and `helm template` with the example values. **Do not touch** the operator's `values.secrets.yaml`; tell the author.

## Tests

Per the Test Methodology of F5, F14 and F15:

- **Unit:**
  - `public-url.test.ts`, `connection-clock.test.ts`, `enable-banking-config.test.ts`;
  - `enable-banking-token.test.ts`, verified with the public half of a key made in the test;
  - `fake-bank-dialect.test.ts`; the guard's settings test, with no network.
- **Integration (contract):** `enable-banking-connector.contract.test.ts`, with every case of the contract table run against the fake, including every error mapping row the fake produces; also `fake-enable-banking-server.test.ts` (token refusal, paging 101 = 100 + 1).
- **Integration (service)** `bank-connection-service.test.ts`:
  - every callback outcome;
  - renewal closes the old session after the new row exists, and survives a failing close;
  - disconnect with the bank down;
  - `markEnded`; a passed date reads `reconnect_needed`;
  - the state is stored only hashed.
- **Route:**
  - `bank-callback-router.test.ts`: no login; 302 with only the code; an over-long parameter is refused;
  - `bank-admin-router.test.ts`: 403 for a player and for "Ver como jugador".
- **Integration (secrets):** connect, callback, panel and disconnect against the fake, capturing the log. No body, header or log line contains the key, a token, the code, the state or the session id.
- **Deployment:** `deployment-settings.test.ts` passes; `helm lint` and `helm template` with `values.secrets.yaml.example` pass, the latter showing the three keys, and showing only `JWT_SECRET` in the Secret when the bank secrets are empty.
- **Sandbox (opt-in):** `npm run test:sandbox` skips with a message when unconfigured. It is run against the standing session in task 11.
- **Hard requirements:** `server/src/repo/bank-connection-requirements.test.ts` with `describe` blocks `UC-006-01-S1`, `S2`, `S3`, `S4`, `S5`, `S8`, `S9`, `S10` (server data), `S11`, `S12`, `S13`.

## Definition of Done

- [x] Every test above passes, and `npm test` touches no network: the fake server binds to loopback only.
- [x] `npm run test:sandbox` exits 0 with a skip message when no sandbox variable is set.
- [x] **Graduation:** UC-006-01-S1–S5, S8–S13 (server) → marked tests; the live parts are in task 11.
- [x] **Hard requirements:** the marked tests exist and pass.
- [x] **Documentation:**
  - `docs/commands.md`: the settings table (`PACHANGUERO_PUBLIC_URL`, `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY`, `ENABLE_BANKING_API_URL`) and the `test:sandbox` script;
  - `.env.example`;
  - `docs/deployment.md`: the impact table's setting row, and a new section "The bank connection";
  - `docs/backup_and_restore.md`: backups hold bank data;
  - `AGENTS.md`: the `server/src/bizum/` and `server/src/bank/` folders, and `npm run test:sandbox`.
- [x] The author is told to add the two bank secrets to their own `values.secrets.yaml`.
- [x] **Tests:** `npm test`; `npm run test:e2e`, with the existing journeys still passing alongside the new fake `webServer`.
- [x] **Regression:** `npm test`.
- [x] **Code checks:** `npm run lint`, `npm run format:check`; the coding standard.

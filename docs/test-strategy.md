CODENAME: SD-TEST-STRATEGY-337

# Test strategy

Each layer of the pyramid verifies a different kind of claim and has its own home, runner, time budget and gate. Beside the pyramid sit tiers that need a network, a credential or a person: the bank's sandbox, a guided checklist, a live check.

```
        ▲  slow, few, expensive
        │
        │   E2E (Playwright)
        │   real browser + real server + real DB
        │
        │   Integration (Vitest, server workspace)
        │   route handlers + the repository/service layer against a real SQLite file
        │
        │   Unit (Vitest, server/src/domain + web lib/ tests)
        │   pure functions
        │
        ▼  fast, many, cheap
```

## When to use each type

Take the smallest layer that can make the claim false; when two can both show it, take the cheaper and faster one.

| The claim                                                 | Use                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| A calculation or rule, input → output                     | unit test                                                                  |
| SQL, route wiring, or our code against an in-process fake | integration test                                                           |
| A setting the deployment must provide                     | deployment settings test                                                   |
| Our connector speaking HTTP to the aggregator             | connector contract, against the fake                                       |
| A journey across screens that no lower layer can show     | E2E test: one per critical journey, never for what integration could catch |
| Whether the fake still matches the real API               | sandbox suite                                                              |
| What only a signed-in person can do                       | guided checklist                                                           |
| What only the real bank shows                             | live check                                                                 |

What `npm test` and the pre-commit hook run never touches a network beyond the loopback, or a secret.

## Tiers: time and gate

| Tier                     | Home                                                                                | Command                                                                                      | Needs                                                            | Time                                      | Gate                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unit                     | `server/src/domain`, `server/src/bizum`, `web/src/lib`                              | `npm test`                                                                                   | nothing                                                          | each under 100 ms                         | every commit (`server/`); `web/src/lib` with `npm test`                                                                         |
| Integration              | `server/src/routes`, `server/src/repo`, `server/src/bank` (not the unit folders)    | `npm test`                                                                                   | nothing (fakes on a loopback port)                               | each under 1 s                            | every commit                                                                                                                    |
| Deployment settings test | `server/src/deployment-settings.test.ts`                                            | `npm test`                                                                                   | nothing                                                          | negligible                                | every commit                                                                                                                    |
| E2E                      | `e2e/tests/`                                                                        | `npm run test:e2e`                                                                           | the real servers and a fake bank                                 | minutes; a new journey fits in about 10 s | before merging a feature; a release runs it only when it moved the web framework, the server framework or the browser test tool |
| Sandbox suite            | `server/src/bank/sandbox/`                                                          | `npm run test:sandbox`                                                                       | sandbox key and a standing session                               | not measured                              | on request                                                                                                                      |
| Release checks           | `scripts/verify-release.sh`, tested by `server/src/verify-release-script.test.ts`   | `scripts/verify-release.sh image`, then `scripts/verify-release.sh deployed --version X.Y.Z` | docker (`image`); `kubectl` and the cluster context (`deployed`) | seconds to a minute                       | every release (`skill: pachanguero-release`)                                                                                    |
| Guided checklist         | [`bank-feed-release-checklist.md`](../.agents/rules/bank-feed-release-checklist.md) | by hand                                                                                      | a person                                                         | minutes                                   | see the rule                                                                                                                    |
| Live check               | the real account, read-only                                                         | by hand                                                                                      | the real bank                                                    | manual                                    | rarely                                                                                                                          |

## Unit and integration tests

- **Unit:** a calculation or rule that is input → output, with no database, network or filesystem. The web side is the pure modules in `web/src/lib/`; a component is left to E2E unless its logic moves into `lib/`.
- **Integration:** an HTTP route, or the repository and service layer. Most Given/When/Then scenarios of a work package land here. Performance claims too (`server/src/repo/debt-query-cost.test.ts`).

## Deployment settings test

`server/src/deployment-settings.test.ts` verifies that every environment variable the server reads is accounted for in production: set by the `Dockerfile`, passed by the Helm chart, or listed in the test as deliberately left to the application's default. It fails until the deployment catches up with a setting, so a variable that works locally through `.env` cannot be silently missing in the cluster. It does not check values or whether the chart renders (`helm lint` and `helm template` do). What else a change owes the deployment: [`deployment-impact.md`](../.agents/rules/deployment-impact.md).

## Bank connector contract and sandbox suite

One set of assertions about the connector runs through the real connector and dialect, in two places:

- **On every commit** (`server/src/bank/`), against a fake aggregator server on a loopback port that copies what the real sandbox was observed to do. Only the fake can produce a revoked session, a rate-limit answer or expiry driven by a clock.
- **On request** (`server/src/bank/sandbox/`, `npm run test:sandbox`), against the aggregator's Mock bank from a standing session read with the application key alone. It is the only automated check that the fake has not drifted from the real API. It only reads and skips with a message unless its `ENABLE_BANKING_SANDBOX*` variables (`.env.example`) are set.

## E2E tests

A full user journey through a real browser against the real server and an isolated SQLite file. The bank access runs against a fake Enable Banking server (`server/src/bank/fake/`). Nothing is mocked: that is what makes it E2E rather than a frontend smoke test. It is not part of the pre-commit hook, which it would make too slow. A press-and-hold drag on a real phone cannot be driven faithfully by the runner and is checked by hand.

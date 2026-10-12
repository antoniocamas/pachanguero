# Study — WP-004-authentication-and-roles

| Q    | Question                                                                     | Lens                          | Raised | Status | Closed | Signal     | Answer                        |
| ---- | ---------------------------------------------------------------------------- | ----------------------------- | ------ | ------ | ------ | ---------- | ----------------------------- |
| Q-01 | Which routes exist, which mutate, how does the web client call them?         | Reachability                  | Study  | closed | Study  | expected   | [01](01-surface-and-tests.md) |
| Q-02 | What do route and E2E tests assume about access; what breaks?                | Reachability, Runtime         | Study  | closed | Study  | surprising | [01](01-surface-and-tests.md) |
| Q-03 | Where do per-player debts, payments and statistics come from?                | Reachability                  | Study  | closed | Study  | expected   | [01](01-surface-and-tests.md) |
| Q-04 | Which players can be users; guests, merges, players without accounts?        | Variants                      | Study  | closed | Study  | expected   | [02](02-data-and-deploy.md)   |
| Q-05 | Schema for email/phone and users; migration needs and safety?                | Variants, Runtime             | Study  | closed | Study  | surprising | [02](02-data-and-deploy.md)   |
| Q-06 | Deployment, secrets, first-admin creation?                                   | Runtime                       | Study  | closed | Study  | expected   | [02](02-data-and-deploy.md)   |
| Q-07 | What does standard protection mean for a home-hosted app; library options?   | Reference completeness        | Study  | closed | Study  | expected   | [03](03-security-and-docs.md) |
| Q-08 | Doc map: which documents does this make untrue?                              | Governing docs                | Study  | closed | Study  | expected   | [03](03-security-and-docs.md) |
| Q-09 | Variant inventory: what else do the roles touch?                             | Variants                      | Study  | closed | Study  | expected   | [03](03-security-and-docs.md) |
| Q-10 | What could this Study's method miss?                                         | Blind spot                    | Study  | closed | Study  | expected   | [03](03-security-and-docs.md) |
| Q-11 | How is the first admin created, and can an admin reset a forgotten password? | Runtime (from Q-06)           | Study  | closed | Study  | surprising | [04](04-author-decisions.md)  |
| Q-12 | What can a regular user see besides their own data (e.g. standings)?         | Variants (from Q-09)          | Study  | closed | Study  | expected   | [04](04-author-decisions.md)  |
| Q-13 | May a JWT library be added as a dependency? Cookie or header for the token?  | Reference completeness (Q-07) | Study  | closed | Study  | expected   | [04](04-author-decisions.md)  |

# Design agenda — WP-006-bizum-payment-detection

**Status: approved**

Order in which the Low Level Design of each element is drafted. Grouped by shared use-case ancestry; elements enabling several groups come first. `Checkpoint-worthy` marks an element whose subsection is presented to the author on its own (money paths, a live migration, a secret or a public route, data that is destroyed). The author approves by changing `Status: proposed` to `approved` above.

| # | Element | Realizes | Enables | Checkpoint-worthy | Increment | Status |
| - | ------- | -------- | ------- | ----------------- | --------- | ------ |
| R1 | Extract `ShareSettler` from `PaymentService` | UC-006-08-S2, UC-006-03-S5 | F7, F9, F10 | yes: the one money path, no behaviour change allowed | 1 | pending |
| F2 | The Bizum core's model, ports and boundary test | UC-006-02-S1 (the record) | F3, F4, F5, F7, F15 | no | 1 | pending |
| F1 | Payment method on every payment; schema step 3 begins | UC-006-08-S1, S3–S5; UC-006-07-S1, S5 | F7, F10, F11 | yes: a migration of the live database | 2 | pending |
| F3 | The ordered rules R1–R7 as the policy | UC-006-03-S1–S4, S7, S8; UC-006-11 | F7, F8, F9 | yes: "a wrong payment is never recorded" lives here | 3 | pending |
| F15 | Fake bank, fake Enable Banking server, contract tests, sandbox suite | success criteria rows 7 and 8 | F5, F7 | no | 4 | pending |
| F5 | Connect, complete, renew, disconnect, expire the bank access | UC-006-01-S1–S5, S8–S13 | F6, F7, F12 | yes: a secret, a public route, an external API | 4 | pending |
| F4 | The Revolut dialect and the bank catalogue | UC-006-02-S1, S2, S4, S5; UC-006-01-S15 | F7 | no | 5 | pending |
| F6 | The reading settings: account, currency, start date, keyword lists, bank | UC-006-01-S6, S7, S14, S15; UC-006-09 | F7, F12 | no | 5 | pending |
| F7 | The feed: scheduled and forced read, once-only ledger, automatic settlement | UC-006-02-S1–S10; UC-006-03-S5, S6; UC-006-04-S3 | F8, F9, F13 | yes: automatic money, exactly once | 6 | pending |
| F8 | The waiting list with reasons; pairing, ruling, dismissing | UC-006-04-S1, S2, S4; UC-006-05 | F10, F13 | yes: dismissal deletes data for good | 7 | pending |
| F9 | A waiting Bizum settles when its game is played | UC-006-10 | — | no (close relative of F8) | 7 | pending |
| F10 | Undo an automatic payment as a whole | UC-006-06 | F13 | no | 8 | pending |
| F11 | Traceability: admin detail; the player sees the method only | UC-006-07-S2–S4 | F13 | no | 8 | pending |
| F12 | The Banco panel (with "Leer ahora") and the expiry banner | UC-006-01 screens; UC-006-09; UC-006-02-S9, S10 | — | no | 9 | pending |
| F13 | "Bizums en espera" and its dialogs in Deudas (with "Leer ahora") | UC-006-04, -05, -06 screens; UC-006-02-S9, S10 | — | no | 9 | pending |
| F14 | Production settings and secrets of the bank | UC-006-01-S2 (setup) | — | no | 10 | pending |
| F16 | The test strategy as a decision tree; the guided checklist | success criteria (how each is tested) | — | no | 10 | pending |

Notes for the order: F15 comes before F5 so the connector is written against its contract tests; F14 and F16 close the work because the first documents the settings that exist by then and the second the test tiers that exist by then. Schema step 3 accumulates: F1 starts it and each later element that stores data adds its tables to the same step and to `schema.sql`.

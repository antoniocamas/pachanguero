# Use case agenda — WP-006-bizum-payment-detection

Status: approved

| UC        | Name                                                        | Need                    | Checkpoint-worthy | Increment | Status  |
| --------- | ----------------------------------------------------------- | ----------------------- | ----------------- | --------- | ------- |
| UC-006-01 | Operator authorises, checks and renews the bank access      | N1, C1, A3              | yes (external)    | 1         | settled |
| UC-006-02 | System reads the new incoming Bizums on a schedule          | N1, N8, Q-delay         | no                | 2         | settled |
| UC-006-09 | Organiser sets the start date                               | N1, C2                  | no                | 2         | settled |
| UC-006-08 | Organiser records a manual payment with its method          | N5, C2                  | no                | 2         | settled |
| UC-006-03 | System settles a Bizum from a known sender                  | N2, N6, N7              | yes (core rule)   | 3         | pending |
| UC-006-04 | A Bizum that cannot be matched with certainty waits         | N7, N4                  | no                | 4         | pending |
| UC-006-05 | Organiser resolves a waiting Bizum and teaches the sender   | N4, N3                  | no                | 4         | pending |
| UC-006-10 | A waiting Bizum settles when its debt appears               | N2, N7                  | no                | 4         | pending |
| UC-006-06 | Organiser corrects an automatic payment                     | N3, N9                  | no                | 5         | pending |
| UC-006-07 | Organiser sees how each payment was paid and its Bizum      | N5, N6, N9, P1          | no                | 5         | pending |

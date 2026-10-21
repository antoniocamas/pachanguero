# Matching a Bizum to a player and to debts (Q-04, Q-05, Q-10, Q-12)

Sources: the WP-005 guides and its local data (read-only; counts only below), `server/src/domain/name-matcher.ts`, `server/src/db/schema.sql` (`player_aliases`, `player_contacts`), and a read-only look at `data/pachanguero.db`.

## Q-04 Can the real Bizums be replayed against the real debts?

**Only in part.** The database holds the 2024/2025 and 2026/2027 seasons; **the 2025/2026 season, which holds most of the 412 Bizums, is not in it**, and 2024/2025 was imported without real payment dates. The 2026/2027 season has 5 played games, 67 recorded payments (4.00 each, by 21 payers) and 2 open debts. In that season, from 2026-09-01, there are **51 Bizums totalling 1,314 EUR**, against 268 EUR of recorded payments, so most Bizum money is not game shares or was not settled yet.

Matching those 51 Bizums to players, with WP-005's tiers: 4 by first name plus initials, 17 by first name only, 2 phone numbers, 28 unresolved. The 6 players that matched have payments recorded: for 3 the Bizums total equals the recorded payments, for 2 the Bizums exceed them, for 1 the payments exceed them (cash or another route). Of the 21 payers in the database only 6 correspond to a Bizum sender found by name.

So a faithful historical replay is **not possible**; the accuracy of the never-wrong rule must be measured **live**, for instance by running the matching in a recording-only mode for some weeks and comparing it with what the organiser settles by hand.

## Q-05 Identifying a sender

- `player_aliases` holds `(player_id, alias)`, 5 rows, single words; `NameMatcher` matches whole names and aliases, case- and accent-insensitive, and reports `ambiguous` rather than guessing.
- `player_contacts` has `email` and `phone` columns but **0 rows**, so no player has a phone stored; the 20 Bizums that show a phone number (5%) cannot be matched by phone today. The number is only useful once a sender is mapped.
- No sender-to-player mapping exists. It would be a new table (sender text, optionally phone, player), populated when the organiser confirms a sender once.

## Q-10 Variants and how often (412 Bizums, 13 months; WP-005)

| Case | Share of Bizums |
| --- | --- |
| exactly one share (4.00) | 72% (298) |
| whole multiples of a share | 19% (80) |
| other amount | 7% (29) |
| below a share | 1% (5) |
| sender shows a phone number | 5% (20) |
| sender's name matches no player | about half of the name-senders (199 Bizums) |
| same day, sender and amount repeated | 5 cases |

Guests: a host holds the debts of their plus-ones (`share_debts.holder_player_id`), so a Bizum from a host for several shares can be settled with `pay` using several shares.

## Q-12 Privacy of the bank data

`docs/users-and-roles.md` and `OwnDisclosure` fix that a player sees only their own data and the server decides; `OwnDisclosure` is the one place where every disclosure rule lives. Bank fields (sender text, phone, bank ids) are other people's personal data and must not enter `PaymentInput` or `OwnPaymentRow`. There is no retention rule or data-protection statement in the repository (searched `docs`, `AGENTS.md`, `README.md`); backups (`DatabaseBackup`, `VACUUM INTO`, mode 0600) copy the whole database, so anything stored for the Bizums would be in every backup. Whether to store raw payloads or only the extracted fields is a decision for the requirements.

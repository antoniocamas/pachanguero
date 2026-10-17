# Integrating the Revolut Bizum feed with Pachanguero

What the proof of concept learned that matters to Pachanguero, and what a production design has to decide. The bank side (setup, limits, errors) is in `enable-banking-revolut-integration.md`; this document only covers how the data meets Pachanguero. Tags: **[PoC]** observed on the real account, **[code]** read from Pachanguero's source, **[inferred]** reasoned, **[not determined]**.

## 1. Today and the goal

Players pay a share by Bizum into the organiser's Revolut account; the organiser then settles the share in Pachanguero by hand (`POST /games/:gameId/payments` with the shares, the payer and an optional date) **[code]**. The goal is for Pachanguero to **propose** those settlements from the bank feed.

## 2. What the feed contained (13 months, 2025-09 to 2026-10) [PoC]

- **412 incoming Bizums** from **63 distinct senders**: about 30 a month in season, 1 to 2 in the summer months. 185 of the 412 booked on a Monday, 99 on a Tuesday; they do not cluster on the Wednesday game day, so a payment cannot be tied to a game by its date.
- All EUR. **72% (298) are exactly 4.00**, the usual share; **19% (80) are multiples of 4.00** (46 of 8.00, 15 of 12.00, 3 of 16.00, a few of larger multiples: one person paying for several shares); **7% (29) are other amounts** (up to 800.00) and **5 are below 4.00**.
- 5 combinations of the same day, same sender and same amount occur twice: two identical payments are possible and must not be merged as duplicates (identity is the bank's `entry_reference`).
- The share the application uses is `price_cents / slots` of the season **[code]**; the 4.00 seen is consistent with that, but the PoC did not read it from the season.

## 3. How a Bizum maps onto the payment model

| Pachanguero | From the Bizum | Note |
| --- | --- | --- |
| `payer_player_id` | the player the sender maps to (section 4) | the sender is *who handed over the money*, which is what `payer` means **[code]** |
| `amount_cents` | `transaction_amount.amount` as decimal, times 100 | integer cents, never a float **[code]**; amounts arrive as strings **[PoC]** |
| `paid_on` | `booking_date` | the date the money arrived, as the project rule wants **[code]**; equals `value_date` for all Bizums **[PoC]** |
| which shares | not in the data | the share(s) and game(s) must be inferred or chosen; see 5 |
| idempotency key | `identification_hash` + `entry_reference` | no column exists for it today **[code]**; a production design needs one |

`PaymentService.pay` accepts a payer only if it is the share's **holder or beneficiary**, and takes a custom amount **only for a single share** **[code]**. A Bizum from someone who is neither (a partner paying for a player) cannot be recorded as is.

## 4. Sender → player

The sender is an abbreviated name (first name plus surname initials, 392 of 412 Bizums) or, for 20 one-off Bizums, a phone number **[PoC]**. Against the 43 players and 5 aliases in the database, matching with the existing exact rule (`NameMatcher`) matched **none**; with two abbreviation-aware tiers:

| Result | Senders | Bizums |
| --- | --- | --- |
| matched by first name plus initials | 5 | 40 (10%) |
| matched by first name only (player stored by first name) | 7 | 117 (28%) |
| phone number only | 20 | 20 (5%) |
| name matches no player | 31 | 235 (57%) |

For about half of all Bizums (199) the sender's first name equals no player's first name **[PoC]**. The data cannot say why (**[not determined]**): another person paying for a player, a nickname, or someone not in the database. **Recommendation [inferred]:** automatic name matching is not enough. Keep a **persistent mapping from the sender string to a player**, created when the organiser confirms the first Bizum from that sender: 63 confirmations would have covered all 412 payments in 13 months. This also fits the project's rule that pasted names are never guessed **[code]**: an unmapped sender is shown to the organiser, never assigned silently. A sender mapped to a player who then pays for another player needs the payer and beneficiary distinction of the existing model, with the confirmation made by the organiser.

## 5. Variants the production design must handle [PoC]

| Case | Seen | Handling to decide |
| --- | --- | --- |
| exactly one share (4.00) | 72% | propose settling the payer's oldest open share |
| several shares (8.00, 12.00, ...) | 19% | propose that many shares; which games and whose is a choice |
| another amount, or below one share | 12% | cannot be proposed blindly; show to the organiser (could be a refund, a different event, a partial payment) |
| payer unknown or not a player | 57% of Bizums | needs the mapping of section 4 first |
| duplicate-looking payments | 5 cases | rely on `entry_reference`, not on content |
| outgoing Bizums, non-Bizum credits | 34 and 64 | ignore (`DBIT`, no Bizum marker) |
| the sender's message text (e.g. a word or a date) | always present | free text; may help, never rely on it |
| a payment before the game is played | not measured | `pay` needs the game in the played state **[code]**; hold the Bizum until then |

## 6. Suggested shape for the production work package [inferred]

Not a design: the shape the findings point to, for that work package to decide.

1. **Poll, never push**: the bank has no transaction webhook; poll a few times a day with a scheduled job (the PoC saw no rate limit in at least 60 transaction calls, but the real limit is not determined).
2. **A suggestion queue, not auto-settlement**: new Bizums become *proposed payments* shown to the admin, who confirms; confirmation calls the existing `PaymentService`. This respects the invariants that a share is in exactly one of debt or payment, and that nothing is guessed.
3. **Layering as in the codebase [code]**: a pure domain class (recognising a Bizum from a transaction, parsing the sender, deciding what to propose), a repository for the stored bank transactions and sender mappings, a service for the use case, a thin command or route for the operator. The only code that knows the bank API stays in one class, as `TokenService` does for JWT.
4. **Operator commands** next to `pachanguero-admin`: authorise (print the URL, accept the redirected address), renew, status; the app and key stored like the other secrets, never in the repository.
5. **Renewal is a recurring chore**: consent ends after at most 180 days and needs the owner's approval in the Revolut app. The system should show the expiry and warn in advance.

## 7. Decisions the production work package must take

- Where bank transactions and sender mappings live (a table keyed by `identification_hash` and `entry_reference`), and whether raw payloads are stored or only the extracted fields.
- How an unmapped or partial payment is shown to the admin, and the confirmation flow.
- How a Bizum is tied to a share or a game (oldest open share? the admin picks?), given that dates do not align.
- Who may see the bank data (the player role sees only their own data **[code]**): no sender name of another person may reach a player.
- Which of the account's currencies and accounts are read (only the owner's EUR account), given that authorisation exposed another person's account.
- Scheduling, failure handling and the renewal procedure.
- Personal data: sender names are other people's data; retention and the project's privacy stance need an explicit rule.

## 8. Not determined

Why about half of the Bizums come from names that are not players; how pending Bizums look; the real rate limit; what happens when a payment arrives before the game is played.

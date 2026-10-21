# Payments in Pachanguero today (Q-01, Q-02, Q-03, Q-08, Q-09)

Sources: `server/src/repo/payment-service.ts`, `payment-repository.ts`, `debt-repository.ts`, `billing-effect.ts`, `participation-repository.ts`, `server/src/domain/game-lifecycle.ts`, `server/src/db/schema.sql` and `schema-migrator.ts`, `server/src/routes/api.ts` (payments section), `server/src/routes/own-router.ts`, `server/src/domain/own-disclosure.ts`, `web/src/hooks/usePayments.ts`, `server/scripts/import-season.ts`, and a read-only look at `data/pachanguero.db` (counts only).

## Q-01 Who writes and reads payments

- **One writer.** `PaymentService.pay` and `undo` are the only code that moves a share between `share_debts` and `payments`; the routes `POST /games/:gameId/payments` and `DELETE /games/:gameId/payments/:paymentId` (admin-only router) are their only HTTP callers, and `usePayments` (web) the only UI caller. `BillingEffect` creates the debts when a game enters the `played` state and never touches payments.
- **Readers:** `GameViewService` (the game screen), `DebtRepository.outstanding/outstandingFor` (the Debts tab and a player's own Deudas), `PaymentRepository.paidFor` through `OwnDataService` and `OwnDisclosure` (a player's Pagos), `PlayerMergeService` (re-points payer, holder and beneficiary ids), and the points/standings reading of `participations.paid_cents`.
- A settled beneficiary player also gets `participations.paid_cents` and `paid_on` set in the same transaction (`PaymentService.settle`); the `payments` table is the record, `participations` the player's own-game mirror.

## Q-02 Rules of `pay` against what a Bizum does

| Rule (in `PaymentService`) | Effect on a Bizum |
| --- | --- |
| The game must be in the `played` state (`pay` capability, `GameLifecycle`) | A Bizum arriving before the organiser marks the game played has no debt to settle yet |
| The payer must be the share's holder or beneficiary; payers are `players` rows (`payer_player_id NOT NULL`) | Somebody who is not a player (a partner) cannot be recorded as payer; the payment would carry the beneficiary as payer and only the bank link would say who really paid |
| A custom amount only with a single share | A Bizum whose amount is not a multiple of the share cannot be split by the service; whole-share multiples settle several shares in one request |
| One payment per (game, beneficiary) or (game, holder, guest ordinal), by unique index | A share cannot be paid twice, but nothing stops the same Bizum being applied to two different shares |
| `paid_on` defaults to today and is accepted from the request | A Bizum's `booking_date` can be passed as `paid_on` |

Debts carry the standard share, `price_cents / slots` of the season (`SeasonRepository.shareCents`): 4.00 EUR in both seasons of the database.

## Q-03 What the payment method and the Bizum link touch

- **Tables:** `payments` gains the new columns (a method, a link to the bank record or to a new table); `share_debts` is unchanged. Schema changes follow the migration rule in `AGENTS.md` and `schema-migrator.ts`: a new `MigrationStep`, `LATEST_SCHEMA_VERSION` raised (now 2), the same change in `schema.sql`, an automatic backup before migrating.
- **Writers/readers to adapt:** `PaymentRepository.append/list/find/paidFor`, `PaymentRow`/`PaidShare`, `PlayerMergeService` (a new column that names a player would need adding to its list), `GameViewService`, the web `api.ts` types and `PaymentCell`. `OwnDisclosure` must not receive the bank fields (section Q-12).
- **Existing data:** 519 participations are imported with `note = 'imported: settlement date unknown'` and `paid_on` equal to the game date (`import-season.ts`), 12 imported unpaid. The `payments` table holds only 67 real payments, all dated 2026-10-07 to 2026-10-09, all 4.00, none paid on the game date; 2 debts are open. Old payments therefore have no method; a default (unknown or cash) is a design choice.

## Q-08 Correcting a payment today

`DELETE /games/:gameId/payments/:paymentId` undoes a payment (only while the game is `played`): it deletes the row and re-inserts the debt at the **standard** share (`PaymentService.undo`), so an adjusted single-share amount is not restored as it was. The web `usePayments.undo` calls it. Nothing shows who or what created a payment, so an automatic payment would need that visible and an undo that also frees the Bizum for re-matching.

## Q-09 Timing and idempotency

- Bizums arrive mostly on Mondays and Tuesdays (WP-005 data), after the Wednesday game, so a debt normally exists, **if** the organiser has marked the game played by then; otherwise the payment waits.
- No unit of work exists for "this bank transaction was processed": the unique indexes protect shares, not bank records. Exactly-once needs the bank identity (`identification_hash`, `entry_reference`) stored next to the payment, with a unique constraint.
- `PaymentService.pay` is transactional per request (`conn.transaction`), a good unit for "settle these shares for this Bizum and record the link".

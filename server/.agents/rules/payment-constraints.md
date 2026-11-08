CODENAME: DC-PAYMENT-313

# Payment constraints

- Keep a share as one `share_debts` row (with a holder who answers for it and a beneficiary whose share it is) until settled, then as a `payments` row; never both. `paid_cents` is the player's own share, settled by whoever paid it. Debts: `docs/domain-model/glossary.md#deuda`.
- Respect the writers: `BillingEffect` creates the debts when a game is played; `PaymentService` settles and undoes them; `DebtHolderService` is the only writer that changes a holder (merging players aside).
- Store money as integer cents (`price_cents`, `paid_cents`), never floats.
- Every payment records its method (`efectivo`, `bizum`, `otro`; `PaymentMethods`). The route requires and parses it, with no default at the boundary. Never edit a recorded method: undo and record again.
- Never read imported payment dates as real dates: `server/scripts/import-season.ts` stamps them with the game date and a note.

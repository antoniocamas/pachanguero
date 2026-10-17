# Iteration 1 — Design resolution

Resolves F4 (the Bizum recognition rule). F7 (the guides' outline) is still open: it waits for the limit probe (task 03). All data below is anonymised shapes; the raw payloads stay in `poc/local/`.

## F4 — How a Bizum is recognised

Evidence: 979 real transactions fetched from the main EUR account (2025-09-01 to 2026-10-11): 476 credits, of which **412 are Bizums** (`verified — invocation`: counts computed over `poc/local/transactions.jsonl`; README).

**Rule.** A transaction is an incoming Bizum when:

1. `credit_debit_indicator` is `CRDT`, **and**
2. `status` is `BOOK`, **and**
3. `remittance_information` has two elements and the last one starts with `Bizum payment from: `.

**Fields.**

| Need | Where | Shape |
| --- | --- | --- |
| Amount | `transaction_amount.amount` (string) and `.currency` | EUR in all 412 |
| Sender | the text after `Bizum payment from: ` in the last `remittance_information` element | 392 of 412: a name as first name plus surname initials (e.g. `Name S.S.`), 43 distinct; 20 of 412: a phone number `+<country><digits>`, 20 distinct, each once |
| Message | the first `remittance_information` element | free text the sender wrote (may hold the game or a phone number; 9 of 412 contain 6+ digits) |
| Date | `booking_date` (also `value_date`, `transaction_date`) | date only |
| Identity | `entry_reference` | present in 979 of 979 |

**What does not identify a Bizum:** `debtor` and `creditor` are all-null in every Bizum; `debtor_account`, `debtor_agent`, `note`, `reference_number`, `merchant_category_code` are null; `bank_transaction_code` is `TOPUP` for Bizums but also for 59 other credits and so cannot be used alone. Outgoing Bizums (34) and non-Bizum credits ("Dinero de ..." top-ups, transfers, card refunds) fail rule 1 or 3.

**Sender identity (feeds F5).** The phone number is available for only 5% of Bizums (one-off senders), so matching must work on the abbreviated name; 5 of 37 first names are shared by more than one sender (`verified — invocation`). Why Revolut shows a number instead of a name for some senders is `unknown` (possibly the sender is not in the organiser's contacts; `inferred`).

**Result.** F4 becomes terminal. Implementation task: `recognise` (and `inspect` as a diagnostic) in `poc/ebpoc.py` — see task 06.

## F7 — The guides' outline

Two documents in `output/`, written from the PoC's results, each claim tagged *verified in PoC*, *from docs* or *not determined*.

**Generic guide** (`enable-banking-revolut-integration.md`): what it can and cannot do; setup (registration form, certificate, linking); JWT; authorisation flow; the accounts exposed; reading transactions (paging, dedup, pending); recognising a Bizum (the F4 rule above); limits; consent and re-authorisation; errors; guidelines and limitations; data handling; what is not determined.

**Pachanguero guide** (`pachanguero-integration.md`): the data the PoC saw (volumes, amounts, senders); mapping onto the payment model; sender-to-player matching and its measured rate; variants that occur; a proposed integration shape and the decisions the production work package must take; operational constraints.

Experiments: answered E-02, E-05, E-07, E-08, E-11, E-12; partly answered E-06b (history at least 13 months right after authorisation; behaviour after an hour or a day not measured); **not determined**: E-04 (`localhost` redirect URL), E-06 (rate limit, waits for the limit probe, task 03).

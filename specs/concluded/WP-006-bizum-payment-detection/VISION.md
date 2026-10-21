# Vision — WP-006-bizum-payment-detection

## 1. Problem Statement

The organiser settles every Bizum payment in Pachanguero by hand, although the bank already knows who paid what and when.

## 2. Key Stakeholder or User Needs

The organiser wants the Bizums received in the Revolut account matched automatically to the debts they pay, with no manual work, and wants to be able to correct anything that turns out wrong. Teaching the system who each sender is is not wanted for its own sake; the organiser accepts it only as a means to get the automatic matching.

## 3. Scope

In: reading the incoming Bizums of the organiser's own Revolut account automatically; matching each to debts and settling them without manual action; recording on every payment how it was paid (cash, Bizum or other) and, for a Bizum, the link to that Bizum with its metadata (date, identifier, and so on); letting the organiser correct a payment.
Out: showing bank data or sender names to players (admin only); other banks and payment types; outgoing Bizums and refunds, which are ignored.

## 4. Quality Ranges

A wrong payment must never be recorded; a delay of up to a day is acceptable. A Bizum that cannot be matched with certainty waits instead of being guessed. Every automatic payment is traceable to its Bizum and correctable.

## 5. Constraints

Every Bizum payment is fully traceable: the payment method and the link to the Bizum with its metadata are stored, which most likely needs new database fields. The bank key and tokens never reach the repository, logs or the web interface. Settling payments by hand keeps working exactly as today, with or without the bank feed. The work follows the project's coding standards, layering and test strategy.

## 6. Assumptions and Dependencies

- The feed can be read and a Bizum recognised by its remittance text: `verified` by the proof of concept (WP-005 guides, 412 Bizums on the real account).
- The sender is only a shortened name (or, in 5% of cases, a phone number), and about half of the Bizums come from names that are no player's, cause unknown: `verified` by the proof of concept; a sender-to-player mapping is therefore needed, which the organiser accepts as a means.
- Consent to read the account lasts at most 180 days and its renewal needs the account owner to approve in the Revolut app, so "no manual work" has this one exception: `verified` by the proof of concept.
- Revolut's real rate limit and recovery time: `unverified` until the proof of concept's limit probe has run.
- Enable Banking's restricted production mode stays available for personal use, and Revolut keeps the Bizum wording stable: `unverified`.
- The existing payment rules (a payer must be the holder or the beneficiary; a custom amount only for a single share) may not fit what Bizums do: `verified — source` (`server/src/repo/payment-service.ts`).

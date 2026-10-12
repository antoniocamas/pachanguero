# Vision — WP-005-enable-banking-bizum-poc

## 1. Problem Statement

Most players pay by Bizum into the organiser's personal Revolut account, and the organiser reconciles every payment into Pachanguero by hand. Whether Enable Banking can feed those Bizums in automatically is unknown, so no production design can be trusted yet.

## 2. Key Stakeholder or User Needs

The organiser needs to learn, with as little effort as possible, everything Enable Banking and Revolut Bizum actually do on their own account, in order to decide whether and how to automate payment detection later.

## 3. Scope

In: a standalone, throwaway script (no change to the app, its database schema or its auth) that exercises the whole Enable Banking lifecycle on the organiser's own Revolut account: finding Revolut in `GET /aspsps`, authorising and creating a session, reading transactions (continuation keys, history depth, deduplication, pending), recognising incoming Bizums and their sender, matching senders to Pachanguero players (reported only), measuring rate limits, and re-authorisation when the consent expires or the session fails.
Out: settling debts or writing payments in Pachanguero, production hosting (scheduler, deployment, secrets management, UI), and any bank or payment type other than Revolut and Bizum.

## 4. Quality Ranges

The deliverable is knowledge, not code, in two documents. (1) A generic guide to integrating any application with Enable Banking + Revolut (Bizum included): procedure, guidelines, limitations, rate limits, consent expiry and re-authorisation, and the real shape of a Bizum in the payload, every claim verified against the real account. (2) A guide to integrating that with Pachanguero: how detected Bizums map to players and debts, and what the production design must decide. Together they let the next work package design production with no open questions. The PoC code only has to be good enough to produce them.

## 5. Constraints

Enable Banking in restricted production mode (individual, non-commercial use, only the linked accounts, read-only). Keys, tokens, session data and raw transaction payloads stay local in git-ignored files; the repository and the docs get only anonymised findings. No software is installed without explicit permission.

## 6. Assumptions and Dependencies

The starting material is `material/enable-banking-revolut-bizum-guide.md` (inside this work package), whose claims below are all taken from it.

- Enable Banking can read the organiser's personal Revolut account in restricted production mode (`unverified`, taken from the guide).
- Revolut is listed under country `ES` or `LT` in `GET /aspsps` (`unverified`).
- A Bizum is distinguishable in the payload, and exposes its sender through `debtor.name` or `remittance_information` (`unverified`).
- A local address is accepted as a whitelisted `redirect_url` (`unverified`).
- Polling is limited to roughly 4 background fetches a day, with a ~6 hour wait after a 429 (`unverified`, per the guide).
- Consent lasts at most `maximum_consent_validity`, usually 180 days, after which session and account ids change and accounts are matched by `identification_hash` (`unverified`).
- Dependencies outside our control: Enable Banking's API and Control Panel, Revolut's consent flow, and the organiser's Revolut mobile app for approving each authorisation.

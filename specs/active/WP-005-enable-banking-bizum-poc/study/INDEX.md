# Study — WP-005-enable-banking-bizum-poc

| Q    | Question | Lens | Raised | Status | Closed | Signal | Answer |
| ---- | -------- | ---- | ------ | ------ | ------ | ------ | ------ |
| Q-01 | Which claims of the guide are confirmed, contradicted or missing in the official Enable Banking docs (auth, sessions, JWT, accounts, transactions, errors)? | Reference completeness | 0 | closed | 0 | expected | enable-banking-docs.md |
| Q-02 | What do the docs say about Revolut: listing (`ES`/`LT`), account types, consent flow, history depth, populated transaction fields? | Runtime | 0 | closed | 0 | surprising | enable-banking-docs.md |
| Q-03 | What do the docs say about restricted production mode: linking, limits, an app with no linked accounts? | Variants | 0 | closed | 0 | expected | enable-banking-docs.md |
| Q-04 | Is a `localhost`/non-HTTPS `redirect_url` accepted; otherwise what is the lightest way to capture `?code=`? | Runtime | 0 | carried forward | — | — | enable-banking-docs.md (experiment E-04) |
| Q-05 | Which transaction fields can identify a Bizum and its sender, and what do the docs say about Revolut/Bizum labelling? | Runtime | 0 | closed | 0 | surprising | enable-banking-docs.md |
| Q-06 | What are the documented limits and error codes (429, PSU headers, `strategy`, `EXPIRED_SESSION`, consent validity, early session end)? | Runtime | 0 | closed | 0 | expected | enable-banking-docs.md |
| Q-07 | What does re-authorisation involve (ids that change, `identification_hash`, early renewal, expiry signalling)? | Variants | 0 | closed | 0 | expected | enable-banking-docs.md |
| Q-08 | What are the dedup/ordering semantics (`entry_reference` vs `transaction_id`, `PDNG`→booked, continuation keys, empty pages)? | Runtime | 0 | closed | 0 | expected | enable-banking-docs.md |
| Q-09 | Which technical options for the PoC script need no new software (language, RS256 JWT, HTTP client, local persistence)? | Reachability | 0 | closed | 0 | expected | pachanguero-today.md |
| Q-10 | How does Pachanguero record a payment today, and which fields would a detected Bizum fill? | Reachability | 0 | closed | 0 | expected | pachanguero-today.md |
| Q-11 | How are pasted names matched to players today, and can that serve Bizum sender names? | Reference completeness | 0 | closed | 0 | expected | pachanguero-today.md |
| Q-12 | Variant inventory: what else can arrive in the account besides a plain Bizum for one share? | Variants | 0 | closed | 0 | expected | pachanguero-today.md |
| Q-13 | Doc map: which documents does the output make untrue or need extending? | Governing docs | 0 | closed | 0 | expected | pachanguero-today.md |
| Q-14 | Blind spot: which answers rest only on documentation and need real-account confirmation (PoC experiments)? | Blind spot | 0 | closed | 0 | expected | poc-experiments.md |

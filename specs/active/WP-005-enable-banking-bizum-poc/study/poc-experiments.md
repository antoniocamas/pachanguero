# Claims that only the real account can confirm (Q-14)

Everything below is `unknown` after the docs and the code; each is an experiment the PoC must run, and its result is a finding in the generic guide.

| Id | Experiment | Closes |
| -- | ---------- | ------ |
| E-02 | `GET /aspsps` for `ES` and `LT`: exact Revolut `name`, `country`, `maximum_consent_validity`, `required_psu_headers`, `psu_types`, `auth_methods` | Q-02 |
| E-04 | Whether `localhost` / plain http / a pasted-URL page is accepted as `redirect_url` in the Control Panel and by `POST /auth` | Q-04 |
| E-05 | Dump (locally) a few real Bizums received, plus a card payment and a bank transfer; compare `debtor`, `remittance_information`, `bank_transaction_code`, `note`, `status`, `reference_number` to find a reliable Bizum marker and the sender | Q-05 |
| E-06 | Count background fetches until a 429; time to the next success; effect of sending PSU headers (if Revolut requires them) | Q-06 |
| E-06b | History depth right after authorisation with `strategy=longest`, and again after an hour and after a day | Q-06 |
| E-07 | Re-authorisation: start a new authorisation while the old session is valid; does the old one survive; do `uid`s change; is `identification_hash` stable; what `EXPIRED_SESSION` / `REVOKED_SESSION` look like (e.g. after `DELETE /sessions`) | Q-07 |
| E-08 | Paging: an empty page carrying a `continuation_key`; `entry_reference` presence and stability for `BOOK` vs `PDNG` and across two fetches | Q-08 |
| E-11 | Match the real senders against the player names and aliases with `NameMatcher`'s rules (read-only copy of the names) and report matched / ambiguous / unresolved | Q-11 |
| E-12 | Classify the received Bizums into the variants listed in `pachanguero-today.md` (Q-12) | Q-12 |

Blind spot of this study: it read documentation and code, not a running system, and the fetch tool summarises pages, so a field description or a limit stated only in an image or a Control Panel screen could be missing. Revolut-specific behaviour is the largest unknown.

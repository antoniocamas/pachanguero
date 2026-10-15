# Requirements — WP-006-bizum-payment-detection

## Use Case Audit

**Component:** the integration of the organiser's Revolut account (read through Enable Banking) with `PaymentService`, the debts and the admin UI.
**Actors:** the operator (command line), the organiser (admin UI), the system (in-process poller).

### Needs taken from `VISION.md`

| Id | Need (VISION §) | Answered by |
| -- | --------------- | ----------- |
| N1 | Incoming Bizums of the organiser's own account are read automatically (§2, §3) | UC-006-01, -02, -09 |
| N2 | Each Bizum is matched to debts and settled with no manual action (§2) | UC-006-03, -10 |
| N3 | The organiser can correct anything that turns out wrong (§2) | UC-006-05, -06 |
| N4 | Teaching who a sender is, only as a means to automatic matching (§2) | UC-006-04, -05 |
| N5 | Every payment records how it was paid: cash, Bizum or other (§3) | UC-006-07, -08 |
| N6 | A Bizum payment links to its Bizum and metadata (date, identifier…) (§3) | UC-006-03, -07 |
| N7 | A wrong payment is never recorded; uncertain Bizums wait, not guessed (§4) | UC-006-03, -04, -10 |
| N8 | A delay of up to a day is acceptable (§4) | UC-006-02 |
| N9 | Every automatic payment is traceable to its Bizum and correctable (§4) | UC-006-06, -07 |
| C1 | Bank key and tokens never reach repository, logs or web interface (§5) | UC-006-01 (+ constraint) |
| C2 | Manual settlement keeps working as today, with or without the feed (§5) | UC-006-08, -09 |
| P1 | Bank data and sender names are admin only (§3 Out) | UC-006-07 (+ constraint) |
| A3 | Consent lasts at most 180 days; renewal needs the owner's approval in the Revolut app (§6) | UC-006-01 |

No row is empty.

### Not covered

Players seeing bank data or sender names; other banks and payment types; outgoing Bizums and refunds (ignored); the 2025/26 history (not in the database); notifications for waiting Bizums (author decision: none); Revolut's real rate limit (Q-11, carried forward — fixes only the polling schedule, set in the design).

## Use Cases

Diagram: `requirements/diagrams/use-cases.puml` (drawn when every use case has settled).

### UC-006-01 — The organiser connects, checks and renews the bank access from the admin view

**Actor:** the organiser (admin), and the bank's redirect arriving at the application. **Goal:** the system may read the organiser's Revolut account, and the organiser always sees how long that lasts and can renew it before it ends, without a command line. **Graduation:** hard requirement (proposed). **Rests on:** Q-06, Q-07, WP-005 guide `enable-banking-revolut-integration.md`. **Sketch:** `requirements/examples/banco-panel.html` (not yet built; the copy is Spanish as the app's).

**Where.** A "Banco" panel in the admin shell, under the Manage tab (`inferred`; placement is for the design). It is part of the admin view only: not shown, and its routes refused, to a player and to an admin who has switched to "Ver como jugador" or "Ver como otro jugador".

**The redirect goes to the application itself.** The bank sends the browser back to `<public URL>/api/bank/callback`; the server completes the authorisation and sends the browser on to the app, which shows the result in the panel. The public URL is a setting (`PACHANGUERO_PUBLIC_URL`) because the deployment is undecided, and it is the address registered as the allowed redirect URL at Enable Banking. Examples use the placeholder `https://pachanguero.example.org`, to be replaced once deployed. The application id and the private key stay in the environment (secrets, like `JWT_SECRET`), never editable in the UI. The operator command line gets no bank commands (`author decision`).

#### UC-006-01-S1 — The panel before any connection

Given no bank access is stored, the application id, the private key and `PACHANGUERO_PUBLIC_URL` are set
When the organiser opens Manage → Banco
Then the panel shows the state "Sin conexión", a sentence saying what connecting does (read only the incoming Bizums of the organiser's Revolut account; nothing is ever paid or moved), the consent length (up to 180 days) and a button "Conectar con Revolut"

#### UC-006-01-S2 — The panel when the setup is incomplete (outline)

Given <missing> is not set
When the organiser opens Manage → Banco
Then the button "Conectar con Revolut" is disabled and the panel says which setting is missing, by name and never by value

| missing |
| ------- |
| the application id |
| the private key |
| `PACHANGUERO_PUBLIC_URL` (or it is not an absolute `https` address; `localhost` allowed for development) |

#### UC-006-01-S3 — Connecting starts

Given the panel is in "Sin conexión" and `PACHANGUERO_PUBLIC_URL` is `https://pachanguero.example.org`
When the organiser presses "Conectar con Revolut"
Then the server stores a pending authorisation (a unique single-use state and its expiry) and the browser goes to the bank's authorisation page, whose redirect address is `https://pachanguero.example.org/api/bank/callback`

`inferred`: the pending authorisation lives in the database so that the server can complete it when the bank redirects back. The WP-005 guide recommends a desktop browser for the owner's approval in the Revolut app (`verified — document`, guide §4), so the panel says that before the button is pressed.

#### UC-006-01-S4 — The bank redirects back and the connection completes

Given a pending authorisation with state `s-1` and the owner approved in the Revolut app
When the browser, redirected by the bank, requests `https://pachanguero.example.org/api/bank/callback?state=s-1&code=c-1`
Then the server exchanges the code for a session, stores the session id, its `valid_until` and the accounts it exposes (as in S6, S7), closes the pending authorisation, and sends the browser to the app, where the panel shows "Conectado hasta 30/03/2027"

`verified — document`: `POST /sessions` returns `session_id` and accounts; `identification_hash` is stable (guide §4, §7). The code is short-lived, so the exchange happens inside this request (guide §4). The callback route needs no login, because the single-use state authorises it; it sits outside the admin-only router (`inferred` from `AGENTS.md`: a route added to `api.ts` is admin-only). If the organiser is not signed in when the browser returns, the app shows the login first and then the panel (`inferred`).

#### UC-006-01-S5 — Refusals at the callback (outline)

Given a pending authorisation with state `s-1`, created 5 minutes ago
When the browser requests the callback with <query>
Then the app shows <message> in the panel, stores no session, and the panel offers "Conectar con Revolut" again

| query | message |
| ----- | ------- |
| `state=other&code=c-1` (no such pending authorisation) | "No reconocemos esta autorización. Empieza de nuevo." |
| `state=s-1&code=c-1`, requested a second time after S4 | "Esta autorización ya se usó." |
| `state=s-1` after the pending authorisation expired | "La autorización caducó. Empieza de nuevo." |
| `state=s-1&error=access_denied` | "No se aprobó el acceso en Revolut." |

`verified — document`: `EXPIRED_AUTHORIZATION_CODE` and `WRONG_AUTHORIZATION_CODE` exist (guide §9). The shape of the error redirect and the lifetime of a pending authorisation are `assumed`; the lifetime is for the design.

#### UC-006-01-S6 — The account to read is chosen by a parameter

Given the Revolut login exposes 4 accounts, all the organiser's: EUR, USD, GBP and a second EUR account, and the setting "currency to read" is EUR (its default)
When the bank redirects back and the server completes the connection
Then the connection is stored but no account is read yet, and the panel asks the organiser to choose between the two EUR accounts, each shown by currency, account type and the last 4 characters of its identifier

#### UC-006-01-S7 — The choice, outline

Given the authorisation exposed the accounts of S6 and the setting "currency to read" is <currency>
When the connection completes
Then the panel <result>

| currency | result |
| -------- | ------ |
| USD | selects the one USD account by itself and shows it as the account to read |
| EUR | asks the organiser to choose between the two EUR accounts; reading starts once chosen |
| CHF | says no account in CHF was found, offers to change the currency, and reads nothing |

The organiser changes the currency setting, and re-chooses among the matches, in the same panel at any time; the choice is stored by the account's `identification_hash`, which survives renewals (`verified — document`, guide §7). Only the transactions of the chosen account are ever read or stored; for the others only the currency, type and the last 4 characters of the identifier are read, to build the choice, and none is stored.

`verified — document`: the PoC saw this exact set (guide §4: "four accounts: three pockets of the owner (EUR, USD, GBP) and a fourth EUR account"), and `GET /accounts/{uid}/details` gives currency and type. The guide read the fourth account as another person's; the author states that all accounts are the organiser's (`author decision`), so the guide's holder-name test is not used. Where the setting is stored (the database, edited in the panel; the environment is the alternative) and the default EUR are `inferred`.

#### UC-006-01-S8 — The panel while connected

Given access valid until 2027-03-30, today is 2027-03-10, and the feed last read the account yesterday at 07:30
When the organiser opens Manage → Banco
Then the panel shows "Conectado", the end date, "20 días restantes", the last read with its result, and the account being read as its currency, type and the last 4 characters of its identifier only, with a way to change it

#### UC-006-01-S9 — Renewal while the access is valid

Given access valid until 2027-03-30 with session `A`
When the organiser presses "Renovar" and the owner approves, so the bank redirects back as in S4
Then the new session is stored, the feed continues from the same account without re-reading or duplicating any Bizum, session `A` is closed only after the new one works, and the panel shows the new end date

`verified — document`: two sessions coexist and the same `identification_hash` continues the history (guide §7). "Renovar" is always available, and is the primary action once 14 days or fewer remain.

#### UC-006-01-S10 — The organiser is warned before it ends

Given access valid until 2027-03-30, today is 2027-03-20, and the organiser has an admin account
When the organiser signs in and the admin view opens
Then a banner at the top of the app, above the tabs and visible on the first screen without opening Manage or any panel, reads "La conexión con el banco caduca en 10 días" with a link to the Banco panel, and it stays on every tab

The banner is part of the admin shell, so it is never shown to a player, to an admin using "Ver como jugador" or "Ver como otro jugador", and never before sign-in: it appears right after the admin login (`inferred` from the disclosure rule: bank state is admin-only). Its server data is one admin-only read of the connection's state and end date, with no account or bank details. `author decision`: the banner must be visible on opening the app; the 14-day threshold is proposed.

#### UC-006-01-S11 — The access ends early (outline)

Given access stored with a session that was valid yesterday
When the system's poll receives the bank error <code>
Then the feed stops polling, the panel shows "Reconexión necesaria" with that reason and the button "Conectar con Revolut", and manual payments keep working as today

| code |
| ---- |
| `CLOSED_SESSION` |
| `EXPIRED_SESSION` |
| `REVOKED_SESSION` |

`verified — document` for `CLOSED_SESSION` (HTTP 401 observed); `EXPIRED_SESSION` and `REVOKED_SESSION` are stated by the docs only (guide §7, §9). The same banner as S10 shows while the state is "Reconexión necesaria".

#### UC-006-01-S12 — Secrets never leave

Given an application key, a pending authorisation and a stored session
When the organiser uses the panel, the callback is requested, or the server logs a bank call
Then no private key, token, authorisation code, state or session id appears in any API response, page, log or the repository

Non-behavioural: the session is stored in the database, which is backed up (`inferred`). The panel shows the account only as in S8.

#### UC-006-01-S13 — The organiser disconnects

Given access valid until 2027-03-30 and the feed running
When the organiser presses "Desconectar" in the Banco panel and confirms in the dialog that follows
Then the session is closed at the bank, the stored session is deleted, the feed stops, the panel shows "Sin conexión", and every payment and Bizum already recorded stays as it was

Needed because consent otherwise lingers at the bank for up to 180 days and there is no other way to stop the feed: it has no on/off switch (UC-006-09). `verified — document`: `DELETE /sessions/{id}` closes a session and later calls fail with `CLOSED_SESSION` (guide §7). `author decision`: add it only if needed; judged needed, for that reason. The confirmation is a step in the page, not a browser dialog.

**Decided by the author:** the panel is under Manage; the 14-day banner threshold; "currency to read" is kept in the database and edited in the panel; the address registered at Enable Banking is `<public URL>/api/bank/callback` and the setting is `PACHANGUERO_PUBLIC_URL`; "Desconectar" is wanted (S13; confirmed in a comment on the artifact, 2026-10-15); the session is stored in the database, which is backed up (confirmed in a comment, 2026-10-15).

**Settled** by the author, 2026-10-15.

### UC-006-02 — The system reads the account on a schedule and keeps the Bizums that may be Pachanguero's

**Actor:** the system. **Goal:** every incoming Bizum that matches a player or is dubious is kept once and within a day, with nobody asking; Bizums clearly unrelated to Pachanguero are not kept; nothing is processed twice. **Graduation:** hard requirement (proposed). **Rests on:** Q-09, Q-10, Q-11 (carried forward). It works whenever the connection works (UC-006-01), the account is chosen and the start date is set (UC-006-09); it has no switch (`author decision`: it is always automatic; disconnecting is what stops it). Judging a Bizum matched, dubious or clearly unrelated is UC-006-03.

#### UC-006-02-S1 — A Bizum judged matched or dubious is kept (outline)

Given the connection works, the start date is <start>, and the account holds a Bizum credit of <amount> EUR booked on <booked> from <sender> with message <message>, which the system has not processed
When the system reads the account on its schedule
Then the Bizum is kept with its amount, booking date, sender as the bank shows it, message and the bank's own identification of it, marked <judgement>

| start | amount | booked | sender | message | judgement |
| ----- | ------ | ------ | ------ | ------- | --------- |
| 2026-09-01 | 4.00 | 2026-10-12 | `Marta G.L.` | `pachanga` | matched |
| 2026-09-01 | 8.00 | 2026-10-13 | `+34600000000` | (empty) | dubious |
| 2026-09-01 | 4.00 | 2026-09-01 | `Marta G.L.` | `miércoles` | matched |

`verified — document`: a Bizum is a credit, booked, whose remittance has two parts, the last starting `Bizum payment from: `; that rule matched all 412 real Bizums; the sender is the text after the prefix (392 of 412 an abbreviated name, 20 a phone number); a message is always present in the data and may be free text (WP-005 guide §6, `study/matching-and-data.md` Q-10). The third row is the start date itself: only what is booked before it is ignored (`author decision`). `author decision`: everything needed to rule a kept Bizum in or out is kept, with no limit on the information or on how long it is kept.

#### UC-006-02-S2 — What is not kept (outline)

Given the connection works and the start date is 2026-09-01
When the system reads an entry that is <entry>
Then nothing of it is kept: no sender, message or amount

| entry |
| ----- |
| an outgoing Bizum |
| an incoming top-up "Dinero de ..." that is not a Bizum |
| an incoming Bizum still pending |
| an incoming Bizum booked on 2026-08-31 |
| an incoming Bizum that the matching judges clearly unrelated to Pachanguero |

Non-behavioural, on the Then: the senders and messages of Bizums that are not the organiser's football business, which can concern the organiser's private life (`study/author-decisions.md`), are other people's data and are not kept. `verified — document`: 34 outgoing Bizums and 59 non-Bizum top-ups existed in the real data; a pending Bizum is skipped and never occurred in it (guide §5, §6; how Revolut shows a pending Bizum is `not determined`).

#### UC-006-02-S3 — An entry already processed is not processed again (outline)

Given the system already processed an entry, which ended as <outcome>
When the system reads the account <occasion>
Then the entry is not evaluated again and nothing about it changes

| outcome | occasion |
| ------- | -------- |
| matched and settled | on its next scheduled read |
| dubious and waiting | on its next scheduled read |
| clearly unrelated and not kept | on its next scheduled read |
| not a Bizum | on its next scheduled read |
| matched and settled | after the bank connection was renewed |
| clearly unrelated and not kept | after the bank connection was renewed |

`verified — document`: a repeated read, also through a new session, added nothing; an entry is told apart by the bank's own identification, never by its content (guide §5, §7). `author decision`: avoid processing the same Bizums over and over. A waiting Bizum is re-evaluated only by UC-006-10, never by being read again.

#### UC-006-02-S4 — Two Bizums that look the same are two Bizums

Given the account holds two Bizums of 4.00 EUR from `Marta G.L.` booked on 2026-10-12, each with its own bank identification
When the system reads the account on its schedule
Then both are processed, each once

`verified — document`: 5 such pairs occurred in the real data (`study/matching-and-data.md` Q-10; guide §5).

#### UC-006-02-S5 — Amounts are kept exactly (outline)

Given the account holds an incoming Bizum of <amount> EUR
When the system keeps it
Then its amount is <cents> cents

| amount | cents |
| ------ | ----- |
| 4.00 | 400 |
| 12.00 | 1200 |
| 4.50 | 450 |

`verified — document`: the bank states amounts as decimal text (guide §5). Money is integer cents (`verified — document`: `AGENTS.md`).

#### UC-006-02-S6 — A read of many Bizums

Given the account holds 150 Bizum credits booked since the start date and the bank returns them in several parts
When the system reads the account for the first time
Then all 150 are processed

`verified — document`: 979 entries came in 20 parts in the proof of concept (guide §5). That the bank still returns entries from 13 months back after a day or more is `not determined`.

#### UC-006-02-S7 — A read that fails (outline)

Given earlier reads processed 3 entries
When the bank answers a read with <failure>
Then the 3 entries keep their outcome, the failure and its time are shown in the Banco panel, and the next read processes what is left without losing or repeating any entry

| failure |
| ------- |
| its rate limit |
| no answer |

`verified — document` for the rate limit and the 6-hour wait the documentation states (guide §8, §9); the network case is `assumed`. An ended connection is UC-006-01-S11.

#### UC-006-02-S8 — A Bizum is processed within a day

Given the connection is valid, the server is running, and a Bizum was booked at the bank
When 24 hours pass
Then the Bizum has been processed

`author decision`: a delay of up to a day is acceptable (`VISION.md` §4). If the server was stopped meanwhile, it is processed on the first read after the server starts.

**Owed for this use case:**
- **Decision, in UC-006-03:** what makes a Bizum "clearly unrelated"; the last row of S2 depends on it.

### UC-006-09 — The organiser sets the start date

**Actor:** the organiser. **Goal:** choose from when the bank feed counts. **Graduation:** hard requirement (proposed). **Rests on:** Q-09 (`study/author-decisions.md`: everything booked before a date the organiser chooses is ignored).

#### UC-006-09-S1 — The organiser sets the start date

Given the Banco panel shows the connected account and no start date
When the organiser sets the start date to 2026-09-01
Then the panel shows "Se ignora todo lo anterior al 01/09/2026" and from then on only Bizums booked on or after that date are processed

#### UC-006-09-S2 — Nothing is read before the setup is complete (outline)

Given the connection is valid and <missing>
When the system's schedule comes due
Then nothing is read, and the Banco panel says what is missing

| missing |
| ------- |
| no start date is set |
| the account to read is not chosen yet |

`author decision`: so no old Bizum is read, and possibly settled, by accident.

**Owed for this use case:**
- **Decided by the author, left to implementation:** the start date can be changed; moving it could be a way to avoid reading a Bizum twice, and a workaround should that mechanism fail; whether it is used so is decided during implementation.

### UC-006-08 — The organiser records a manual payment with its method

**Actor:** the organiser. **Goal:** settle a share by hand exactly as today, and have the payment say how it was paid. **Graduation:** hard requirement (proposed). **Rests on:** Q-01, Q-02, Q-03, Q-08.

Today a payment has no method (`verified — source`: the `payments` table in `server/src/db/schema.sql`, lines 191-201, holds game, holder, beneficiary or guest, payer, amount and date).

#### UC-006-08-S1 — A manual payment records its method (outline)

Given game 12 is played and "Marta" has an open debt of one share, <share> EUR
When the organiser records Marta's share as paid with the method <method>
Then the payment exists with that method and no link to a bank Bizum, the debt is gone, and the amount, payer and date are as today

| share | method |
| ----- | ------ |
| 4.00 | Efectivo |
| 5.00 | Otro |

`verified — document`: the methods are cash, Bizum or other (`VISION.md` §3); `author decision`: the organiser can record a manual payment as "Bizum". `author decision`: the form preselects "Efectivo". The share is the season's share, which the admin sets (`verified — source`: `SeasonRepository.shareCents`, `server/src/repo/season-repository.ts`).

#### UC-006-08-S2 — The rules of payment do not change (outline)

Given "Marta" has an open debt of one share on game 12
When the organiser records <attempt>
Then it is refused with today's message and no payment is created

| attempt |
| ------- |
| a payment on game 13, which is not played |
| a payment with a custom amount for two shares |
| a payment by someone who is neither the holder nor the beneficiary |

`verified — source`: the three refusals are in `PaymentService.pay` (`server/src/repo/payment-service.ts`).

#### UC-006-08-S3 — Undoing a manual payment

Given Marta's share on game 12 was paid with the method "Efectivo"
When the organiser undoes the payment
Then the debt returns as today and nothing about the bank changes

`verified — source`: `PaymentService.undo` puts the debt back at the standard share (`server/src/repo/payment-service.ts`).

#### UC-006-08-S4 — A manual payment works with or without the bank (outline)

Given the bank connection is <connection>
When the organiser records a manual payment as in S1
Then it works exactly as when the connection is working

| connection |
| ---------- |
| working |
| ended |
| never set up |

`author decision`: settling by hand keeps working exactly as today, with or without the bank (`VISION.md` §5).

#### UC-006-08-S5 — Payments from before this feature carry a method

Given the 67 payments recorded before this feature exist
When the application is upgraded
Then each of them shows the method "Otro" and no link to a Bizum

`verified — source`: all 67 are 4.00 EUR, paid 2026-10-07 to 2026-10-09; the 519 imported participations are not payments and stay untouched (study Q-03). `author decision`: the method is "Otro".

### UC-006-03 — The system settles a Bizum from a known sender

**Actor:** the system. **Goal:** a Bizum whose sender is a known player pays that player's open debts, nearest game first, with nobody acting, and is never settled wrongly. **Graduation:** hard requirement (proposed). **Rests on:** Q-02, Q-04, Q-05, Q-10. A Bizum that cannot be settled with certainty waits (UC-006-04); how a sender becomes known by the organiser's pairing is UC-006-05. The "share" is the season's, set by the admin and read from the database (`verified — source`: `SeasonRepository.shareCents`, `server/src/repo/season-repository.ts`); examples use shares of 4.00 and 5.00 to show it is not fixed.

#### UC-006-03-S1 — A sender is recognised as a player (outline)

Given the system holds <knowledge>
When the system processes a Bizum from sender <sender>
Then the payer is <payer>

| knowledge | sender | payer |
| --------- | ------ | ----- |
| the organiser paired `Luis P.R.` with the player "Luis Pérez" | `Luis P.R.` | "Luis Pérez" |
| no pairing, and the only player whose name fits is "Marta" | `Marta G.L.` | "Marta" |
| the player "Luis Pérez" has the phone `+34600000000` | `+34600000000` | "Luis Pérez" |
| the organiser paired `Marta G.L.` with "Marta García" and with "Marta Gómez" | `Marta G.L.` | nobody: two players fit |
| no player is linked to `+34611111111` | `+34611111111` | nobody |

`verified — source`: `NameMatcher` never guesses, a name that fits two players is reported ambiguous (`server/src/domain/name-matcher.ts`); `player_aliases` holds 5 rows and `player_contacts` holds a phone column with no rows (study Q-05), so a stored phone is new data. `verified — document`: senders are an abbreviated name or, in 5%, a phone number (guide §6). `author decision`: a sender is also recognised from the players' names alone, without a pairing, when exactly one player fits; if a new player with the same first name enters (a second "Marta"), the sender then fits two players and the author expects this to need revisiting.

#### UC-006-03-S2 — A Bizum of whole shares settles the nearest open debts first (outline)

Given "Luis Pérez" has open debts of one share, <share> EUR each, on the played games of <games>
When the system processes a Bizum of <amount> EUR from him, booked on <booked>
Then it settles the debts of <settled>

| share | games | amount | booked | settled |
| ----- | ----- | ------ | ------ | ------- |
| 4.00 | 2026-09-30, 2026-10-07 | 4.00 | 2026-10-12 | 2026-10-07 |
| 4.00 | 2026-09-30, 2026-10-07 | 8.00 | 2026-10-12 | 2026-10-07 and 2026-09-30 |
| 5.00 | 2026-09-30, 2026-10-07 | 5.00 | 2026-10-06 | 2026-09-30 |

`author decision`: when a player has several open debts, a Bizum pays the one of the nearest game first, read as the most recent played game on or before the booking date, then further back for more shares (`study/author-decisions.md`). This differs from the existing debts ordering, oldest first (`DebtRepository.outstandingFor`; study). The third row shows a game after the booking date is not touched. The amount must be a whole number of the share of the games' season; otherwise S4. `author decision`: the sender is very important but not enough; settling also needs the amount to be a number of shares, a debt it pays, and/or the subject; the name alone never settles. `author decision`: the subject is never a reason to discard a Bizum; it can be used to be sure that a Bizum is for Pachanguero, by key words such as "pachanga", "fubol" and "fútbol" (the system has no language model, so only key words). `author decision`: an amount of 7 shares or less that is not matched is dubious. `author decision`: debts are not carried from one season to another.

#### UC-006-03-S3 — A host's Bizum settles the shares the host holds (outline)

Given "Marta García" holds, as host, an open debt of one share (4.00) for herself and one for a plus-one on the played game of 2026-10-07
When the system processes a Bizum of <amount> EUR from her booked on 2026-10-12
Then it settles <settled>

| amount | settled |
| ------ | ------- |
| 4.00 | one share of that game: hers, as the nearest first |
| 8.00 | both shares of that game |

`verified — source`: a host holds the debts of plus-ones and may pay them (`share_debts.holder_player_id`; study Q-10). `author decision`: of the host's shares of one game, her own goes first.

#### UC-006-03-S4 — An amount that is not whole shares settles nothing (outline)

Given "Luis Pérez" has open debts of one share, 4.00 EUR, on two played games
When the system processes a Bizum of <amount> EUR from him
Then it settles nothing and the Bizum waits for the organiser

| amount |
| ------ |
| 4.50 |
| 2.00 |
| 6.00 |

`author decision`: what cannot be settled with certainty waits, never a guess (`VISION.md` §4). `verified — document`: 29 of 412 real Bizums were other amounts and 5 were below a share (guide §2; `study/matching-and-data.md` Q-10). A payment can only adjust the amount of a single share (`verified — source`: `PaymentService.pay`).

#### UC-006-03-S5 — A settled Bizum leaves a payment that says how it was paid

Given a Bizum of 4.00 EUR booked on 2026-10-12 settles one debt
When the system settles it
Then the payment shows the method "Bizum", the link to that Bizum, and the date 2026-10-12, when the money arrived

`author decision`: every Bizum payment carries its method and the link to its Bizum (`VISION.md` §5). `verified — source`: the payment date is when the money arrived, not the game date (`AGENTS.md`).

#### UC-006-03-S6 — Nothing to settle yet

Given "Luis Pérez" has no open debt on a played game
When the system processes a Bizum of 4.00 EUR from him
Then it settles nothing and the Bizum waits

`verified — source`: a game must be played to accept a payment (`PaymentService.pay`, `GameLifecycle`); a Bizum often arrives before the organiser marks the game played (study Q-09). The waiting Bizum settles when the debt appears: UC-006-10.

#### UC-006-03-S7 — A Bizum larger than the open debts (outline)

Given "Luis Pérez" has open debts of one share, <share> EUR each, on two played games
When the system processes a Bizum of <amount> EUR from him
Then <result>

| share | amount | result |
| ----- | ------ | ------ |
| 4.00 | 12.00 (3 shares) | it settles nothing and waits in the organiser's list |
| 4.00 | 28.00 (7 shares) | it settles nothing and waits in the organiser's list |
| 4.00 | 32.00 (8 shares) | it is not kept: too much to be a game payment |
| 4.00 | 40.00 (10 shares) | it is not kept: too much to be a game payment |

`author decision`: 12.00, being just 3 shares, is reasonable to queue; 40.00 is too much; the limit is 7 shares, so up to 7 shares waits and more than 7 is not kept (`study/author-decisions.md`: unmatched or uncertain Bizums wait in a list).

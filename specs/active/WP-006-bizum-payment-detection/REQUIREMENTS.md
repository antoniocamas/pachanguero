# Requirements — WP-006-bizum-payment-detection

## Use Case Audit

**Component:** the integration of the organiser's bank account (read through Enable Banking; Revolut is the only bank implemented in this work package, and the bank is a setting) with `PaymentService`, the debts and the admin UI.
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
| N8 | A delay of up to a day is acceptable (§4); the organiser may shorten it by forcing a read (author decision, 2026-10-17) | UC-006-02 (S8, S9, S10) |
| N9 | Every automatic payment is traceable to its Bizum and correctable (§4) | UC-006-06, -07 |
| C1 | Bank key and tokens never reach repository, logs or web interface (§5) | UC-006-01 (+ constraint) |
| C2 | Manual settlement keeps working as today, with or without the feed (§5) | UC-006-08, -09 |
| P1 | Bank data and sender names are admin only (§3 Out) | UC-006-07 (+ constraint) |
| A3 | Consent lasts at most 180 days; renewal needs the owner's approval in the Revolut app (§6) | UC-006-01 |

No row is empty.

### Not covered

Players seeing bank data or sender names; support for any bank other than Revolut (the design leaves room for it, this work package implements Revolut only) and for payment types other than Bizum; outgoing Bizums and refunds (ignored); the 2025/26 history (not in the database); notifications for waiting Bizums (author decision: none); Revolut's real rate limit (Q-11, carried forward — fixes only the polling schedule, set in the design).

## Use Cases

Diagram: [`requirements/diagrams/use-cases.puml`](requirements/diagrams/use-cases.puml).

### UC-006-01 — The organiser connects, checks and renews the bank access from the admin view

**Actor:** the organiser (admin), and the bank's redirect arriving at the application. **Goal:** the system may read the organiser's account at the chosen bank, and the organiser always sees how long that lasts and can renew it before it ends, without a command line. **Graduation:** hard requirement (proposed). **Rests on:** Q-06, Q-07, WP-005 guide `enable-banking-revolut-integration.md`. **Sketch:** `requirements/examples/screens.html` frames 1 to 4 (not yet built; the copy is Spanish as the app's).

**Where.** A "Banco" panel in the admin shell, under the Manage tab (`inferred`; placement is for the design). It is part of the admin view only: not shown, and its routes refused, to a player and to an admin who has switched to "Ver como jugador" or "Ver como otro jugador".

**The redirect goes to the application itself.** The bank sends the browser back to `<public URL>/api/bank/callback`; the server completes the authorisation and sends the browser on to the app, which shows the result in the panel. The public URL is a setting (`PACHANGUERO_PUBLIC_URL`) because the deployment is undecided, and it is the address registered as the allowed redirect URL at Enable Banking. Examples use the placeholder `https://pachanguero.example.org`, to be replaced once deployed. The application id and the private key stay in the environment (secrets, like `JWT_SECRET`), never editable in the UI. The operator command line gets no bank commands (`author decision`).

**The bank is a setting** (`author decision`, 2026-10-16). The panel shows which bank is read, chosen from the banks the application supports; in this work package that list holds Revolut alone, which is the default. Everything the bank decides (how an entry is recognised as a Bizum, how the sender and the message are read, the accounts it exposes) belongs to the chosen bank's support, so a future bank is added by implementing that support and listing it, with no change to the rules of UC-006-03 to -07. The button and the messages carry the chosen bank's name (examples use Revolut).

#### UC-006-01-S1 — The panel before any connection

Given no bank access is stored, the application id, the private key and `PACHANGUERO_PUBLIC_URL` are set
When the organiser opens Manage → Banco
Then the panel shows the state "Sin conexión", the chosen bank (Revolut), a sentence saying what connecting does (read only the incoming Bizums of the organiser's account at that bank; nothing is ever paid or moved), the consent length (up to 180 days) and a button "Conectar con <banco>"

#### UC-006-01-S2 — The panel when the setup is incomplete (outline)

Given <missing> is not set
When the organiser opens Manage → Banco
Then the button "Conectar con <banco>" is disabled and the panel says which setting is missing, by name and never by value

| missing |
| ------- |
| the application id |
| the private key |
| `PACHANGUERO_PUBLIC_URL` (or it is not an absolute `https` address; `localhost` allowed for development) |

#### UC-006-01-S3 — Connecting starts

Given the panel is in "Sin conexión" and `PACHANGUERO_PUBLIC_URL` is `https://pachanguero.example.org`
When the organiser presses "Conectar con <banco>"
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
Then the app shows <message> in the panel, stores no session, and the panel offers "Conectar con <banco>" again

| query | message |
| ----- | ------- |
| `state=other&code=c-1` (no such pending authorisation) | "No reconocemos esta autorización. Empieza de nuevo." |
| `state=s-1&code=c-1`, requested a second time after S4 | "Esta autorización ya se usó." |
| `state=s-1` after the pending authorisation expired | "La autorización caducó. Empieza de nuevo." |
| `state=s-1&error=access_denied` | "No se aprobó el acceso en <banco>." |

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
Then the feed stops polling, the panel shows "Reconexión necesaria" with that reason and the button "Conectar con <banco>", and manual payments keep working as today

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

#### UC-006-01-S14 — The organiser edits the words that keep or discard a Bizum (outline)

Given the Banco panel shows the word lists of the rules R1 and R5 of UC-006-03, with the include words "pachanga", "futbol", "fútbol" and "fubol" and no exclude words
When the organiser adds the word <word> to the list <list>
Then the panel shows it in that list and the rules use it from the next Bizum processed on; Bizums already processed are not re-evaluated

| word | list |
| ---- | ---- |
| `partido` | include |
| `cena` | exclude |

`author decision`: the lists are edited by the organiser in the Banco panel and kept in the database; the include words above are the initial ones and the exclude list starts empty. A word can be removed too. A list change never brings back a Bizum already discarded (UC-006-02-S3).

#### UC-006-01-S15 — The bank is chosen in the panel (outline)

Given the application supports the banks <supported> and the organiser is <state>
When the organiser opens Manage → Banco
Then the panel shows the bank <shown>, and <result>

| supported | state | shown | result |
| --------- | ----- | ----- | ------ |
| Revolut | not connected, no bank chosen yet | Revolut, preselected | the button reads "Conectar con Revolut" |
| Revolut | connected to Revolut | Revolut, not editable | a note says to disconnect before changing the bank |
| Revolut | not connected, the stored bank is no longer supported | none | the button is disabled and the panel asks for a supported bank to be chosen |

`author decision`: the bank is chosen from a list and only Revolut is implemented in this work package (the list has one entry). `inferred`: the choice is kept in the database like the currency (S7) and cannot change while connected, because the stored session, account choice and read Bizums belong to that bank; the third row guards a database that outlives a removed bank's support.

**Decided by the author:** the panel is under Manage; the 14-day banner threshold; "currency to read" is kept in the database and edited in the panel; the address registered at Enable Banking is `<public URL>/api/bank/callback` and the setting is `PACHANGUERO_PUBLIC_URL`; "Desconectar" is wanted (S13; confirmed in a comment on the artifact, 2026-10-15); the session is stored in the database, which is backed up (confirmed in a comment, 2026-10-15).

**Settled** by the author, 2026-10-15.

### UC-006-02 — The system reads the account on a schedule and keeps the Bizums that may be Pachanguero's

**Actor:** the system. **Goal:** every incoming Bizum that matches a player or is dubious is kept once and within a day, with nobody asking; Bizums the rules discard are not kept; nothing is processed twice. **Graduation:** hard requirement (proposed). **Rests on:** Q-09, Q-10, Q-11 (carried forward). It works whenever the connection works (UC-006-01), the account is chosen and the start date is set (UC-006-09); it has no switch (`author decision`: it is always automatic; disconnecting is what stops it). Whether an entry is a Bizum, and who sent it and with what message, is read by the chosen bank's support (for Revolut, the rule below); the rest of the work package sees only a Bizum with its amount, booking date, sender, message and the bank's identification. Judging a Bizum settled, waiting or discarded is UC-006-03 (the ordered rules R1–R7).

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
| an incoming Bizum that rule R1, R2 or R6 of UC-006-03 discards |

Non-behavioural, on the Then: the senders and messages of Bizums that are not the organiser's football business, which can concern the organiser's private life (`study/author-decisions.md`), are other people's data and are not kept. `verified — document`: 34 outgoing Bizums and 59 non-Bizum top-ups existed in the real data; a pending Bizum is skipped and never occurred in it (guide §5, §6; how Revolut shows a pending Bizum is `not determined`).

#### UC-006-02-S3 — An entry already processed is not processed again (outline)

Given the system already processed an entry, which ended as <outcome>
When the system reads the account <occasion>
Then the entry is not evaluated again and nothing about it changes

| outcome | occasion |
| ------- | -------- |
| matched and settled | on its next scheduled read |
| dubious and waiting | on its next scheduled read |
| discarded and not kept | on its next scheduled read |
| not a Bizum | on its next scheduled read |
| matched and settled | after the bank connection was renewed |
| discarded and not kept | after the bank connection was renewed |

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

#### UC-006-02-S9 — The organiser forces a read

Given the connection works, the account is chosen, the start date is set, the last read ended 30 minutes ago, and a Bizum of 4.00 EUR from `Marta G.L.` was booked at the bank since then
When the organiser presses "Leer ahora" in the Banco panel, or at the top of "Bizums en espera" in the Deudas tab
Then the system reads the account at once, as on its schedule, processes the Bizum by the same rules (UC-006-03), the button shows that the read ended, and the Banco panel shows the new time of the last read

`author decision` (2026-10-17): to cut the wait and to test by hand (N8; `VISION.md` §4 accepts a delay of up to a day, it does not require one). The button is the same in both places and shows the same state. It is part of the admin view only, like the rest of the Banco panel and "Bizums en espera" (UC-006-01, UC-006-04-S4). A forced read is the scheduled read run on request: it processes nothing twice (UC-006-02-S3) and respects the start date (UC-006-09).

#### UC-006-02-S10 — A forced read that cannot run (outline)

Given <situation>
When the organiser presses "Leer ahora"
Then nothing is read and the button shows <message>

| situation | message |
| --------- | ------- |
| a read, scheduled or forced, is in progress | "Ya se está leyendo el banco." |
| the last read ended 2 minutes ago | "Espera unos minutos antes de volver a leer." |
| the bank answered the last read with its rate limit and its retry time has not come | "El banco pide esperar hasta <hora>." |
| the connection is "Sin conexión" or "Reconexión necesaria" | the button is not offered; the panel says what is missing |
| the start date is not set, or the account is not chosen (UC-006-09-S2) | the button is not offered; the panel says what is missing |

`author decision` (2026-10-17, by approving the design): at least 5 minutes pass between the end of one read and the start of the next, scheduled or forced, so that forcing does not exhaust the bank's allowance (the documentation states about 4 background reads a day, WP-005 guide §8, `verified — document`; the real limit is Q-11, carried forward). The 5 minutes are a constant of the design. A read that ends in error shows the failure as in S7.

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

**Actor:** the system. **Goal:** every incoming Bizum is judged by one ordered list of rules (settled, waiting or discarded) and a Bizum whose sender is a known player pays that player's open debts, nearest game first, with nobody acting, and is never settled wrongly. **Graduation:** hard requirement (proposed). **Rests on:** Q-02, Q-04, Q-05, Q-10. The rules below are an `author decision` (2026-10-16). A Bizum that cannot be settled with certainty waits (UC-006-04); how a sender becomes known by the organiser's pairing is UC-006-05. The "share" is the season's, set by the admin and read from the database (`verified — source`: `SeasonRepository.shareCents`, `server/src/repo/season-repository.ts`); examples use shares of 4.00 and 5.00 to show it is not fixed.

**The rules.** Written like a firewall: evaluated in this order, and the first rule that matches decides; no later rule is looked at. *Share* is the share of the season containing the Bizum's booking date; *n* is the amount divided by the share; *d* is the number of open debts the sender-player has on played games of that season (UC-006-11). *Include words* and *exclude words* are two lists the organiser edits (UC-006-01-S14); a subject matches a list when it contains one of its words, ignoring upper and lower case and ignoring accents, so "futbol" and "fútbol" are the same word (`author decision`).

| # | If the Bizum … | Action |
| - | -------------- | ------ |
| R1 | has a subject containing an exclude word | **Discard** |
| R2 | is more than 7 shares (n > 7) | **Discard** |
| R3 | has a sender that is exactly one player, n is whole (1 to 7) and d ≥ n | **Settle** n debts, nearest first |
| R4 | has a sender that is exactly one player, n is whole (1 to 7) and d < n | **Wait** |
| R5 | has a subject containing an include word | **Wait** |
| R6 | has an amount that is not a whole number of shares | **Discard** |
| R7 | is anything else (a whole number of shares, sender unknown or ambiguous) | **Wait** |

"Discard" means nothing of the Bizum is kept (UC-006-02-S2). "Wait" means it is kept and listed for the organiser (UC-006-04). Nothing else decides: the subject plays no part in R3, R4, R6 and R7, an include word does not rescue more than 7 shares (R2 comes first), and a sender's name alone never settles. `author decision`: all of the above. Consequence, accepted: a discarded Bizum cannot be recovered, and changing a list later does not bring it back.

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

`author decision`: when a player has several open debts, a Bizum pays the one of the nearest game first, read as the most recent played game on or before the booking date, then further back for more shares (`study/author-decisions.md`). This differs from the existing debts ordering, oldest first (`DebtRepository.outstandingFor`; study). The third row shows a game after the booking date is not touched. The amount must be a whole number of the share of the games' season; otherwise S4 (R5, R6). `author decision`: the sender is very important but not enough; settling also needs the amount to be a whole number of shares that the sender's open debts cover (R3); the name alone never settles. The key words are plain lists, because the system has no language model. `author decision`: debts are not carried from one season to another.

#### UC-006-03-S3 — A host's Bizum settles the shares the host holds (outline)

Given "Marta García" holds, as host, an open debt of one share (4.00) for herself and one for a plus-one on the played game of 2026-10-07
When the system processes a Bizum of <amount> EUR from her booked on 2026-10-12
Then it settles <settled>

| amount | settled |
| ------ | ------- |
| 4.00 | one share of that game: hers, as the nearest first |
| 8.00 | both shares of that game |

`verified — source`: a host holds the debts of plus-ones and may pay them (`share_debts.holder_player_id`; study Q-10). `author decision`: of the host's shares of one game, her own goes first.

#### UC-006-03-S4 — An amount that is not whole shares is discarded unless the subject names Pachanguero (outline)

Given "Luis Pérez" has open debts of one share, 4.00 EUR, on two played games
When the system processes a Bizum of <amount> EUR from him with the subject <subject>
Then <result>

| amount | subject | result |
| ------ | ------- | ------ |
| 4.50 | (empty) | it is discarded (R6) |
| 2.00 | `cena` | it is discarded (R1, the exclude word, before anything else) |
| 6.00 | `partido de la pachanga` | it settles nothing and waits in the organiser's list (R5) |
| 2.00 | `fútbol` | it settles nothing and waits in the organiser's list (R5) |

`author decision`: the rules of UC-006-03, which replace the earlier "everything uncertain waits" for amounts that are not whole shares. Row 2 assumes `cena` is in the exclude list. `verified — document`: 29 of 412 real Bizums were other amounts and 5 were below a share (guide §2; `study/matching-and-data.md` Q-10). A payment can only adjust the amount of a single share (`verified — source`: `PaymentService.pay`).

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
| 4.00 | 32.00 (8 shares) | it is discarded (R2): too much to be a game payment |
| 4.00 | 40.00 (10 shares) | it is discarded (R2): too much to be a game payment |

`author decision`: the limit is 7 shares: up to 7 shares with fewer open debts than shares waits (R4), more than 7 is discarded (R2), whoever the sender and whatever the subject.

#### UC-006-03-S8 — The first matching rule decides (outline)

Given the share is 4.00 EUR, "Luis Pérez" is the only player a sender <sender> fits and has 2 open debts, and the include word "pachanga" and the exclude word "cena" are listed
When the system processes a Bizum of <amount> EUR from <sender> with the subject <subject>
Then rule <rule> decides and the Bizum is <result>

| sender | amount | subject | rule | result |
| ------ | ------ | ------- | ---- | ------ |
| `Luis P.R.` | 4.00 | `cena pachanga` | R1 | discarded: R1 comes before R3 |
| `Luis P.R.` | 32.00 | `pachanga` | R2 | discarded: an include word does not rescue 8 shares |
| `Luis P.R.` | 8.00 | `pachanga` | R3 | settled: 2 debts |
| `Luis P.R.` | 12.00 | (empty) | R4 | waiting: 3 shares, 2 debts |
| `Marta G.L.` | 4.50 | `pachanga` | R5 | waiting |
| `Marta G.L.` | 4.50 | (empty) | R6 | discarded |
| `Marta G.L.` | 8.00 | (empty) | R7 | waiting: sender fits no player |

`inferred` from the rule table: one row per rule shows each rule is reachable and the order matters (row 1 and row 2 would differ if reordered). Row 7 assumes `Marta G.L.` fits no player.

### UC-006-11 — Debts are not carried from one season to another

**Actor:** the system. **Goal:** a Bizum only ever pays debts of the season it was booked in, so money of a new season never silently settles an old season's debt. **Graduation:** hard requirement (proposed). **Rests on:** Q-02, Q-09. `author decision`: debts are not carried from one season to another; a Bizum with no debt in its own season waits (`study/author-decisions.md`, UC-006-03-S2).

**The Bizum's season** is the one containing its booking date (`SeasonCalendar`, 1 Sept–31 Aug; `verified — source`: AGENTS.md, "The season is derived"). `verified — source`: `DebtRepository.outstandingFor` returns a player's open debts across all seasons, ordered by game date (`server/src/repo/debt-repository.ts:106`), and `PaymentService.pay` takes the share of the game's own season; so the restriction is new behaviour of the automatic settlement, not of manual payment.

#### UC-006-11-S1 — Only debts of the Bizum's own season are paid (outline)

Given "Luis Pérez" has open debts of one share, 4.00 EUR each, on the played games of <games>
When the system processes a Bizum of 4.00 EUR from him, booked on <booked>
Then <result>

| games | booked | result |
| ----- | ------ | ------ |
| 2026-06-10 (season 2025/26) | 2026-10-12 | it settles nothing and the Bizum waits in the organiser's list |
| 2026-06-10 (season 2025/26), 2026-10-07 (season 2026/27) | 2026-10-12 | it settles the debt of 2026-10-07; the one of 2026-06-10 stays open |
| 2026-06-10 (season 2025/26) | 2026-08-31 | it settles the debt of 2026-06-10: the Bizum belongs to that season |

#### UC-006-11-S2 — A Bizum larger than the season's open debts waits, whatever other seasons hold

Given "Luis Pérez" has one open debt of 4.00 EUR on the played game of 2026-10-07 and one on 2026-06-10 (season 2025/26)
When the system processes a Bizum of 8.00 EUR from him booked on 2026-10-12
Then it settles nothing and the Bizum waits in the organiser's list

`inferred` from S1 and UC-006-03-S7: the amount counts against the Bizum's season only, so 2 shares exceed its 1 open debt.

**Settled** by the author, 2026-10-16.

### UC-006-04 — A Bizum that cannot be settled with certainty waits in the Deudas view

**Actor:** the system, and the organiser (admin) who reads the list. **Goal:** every Bizum the rules say to wait (R4, R5, R7 of UC-006-03) is listed where the organiser settles payments, with enough to decide what it is, and is never settled by guessing. **Graduation:** hard requirement (proposed). **Rests on:** Q-04, Q-05, Q-08 (`study/author-decisions.md`: uncertain Bizums wait in a list the organiser resolves at will, no notification). **Where.** The list is a section "Bizums en espera" at the top of the "Deudas" tab of the admin shell (`verified — source`: the tab exists, `web/src/pages/AdminShell.tsx`, `Debts`), because the organiser settles payments there (`author decision`). The list is admin only, like every bank datum (`VISION.md` §3).

#### UC-006-04-S1 — A waiting Bizum is listed with why it waits (outline)

Given the system processed a Bizum of <amount> EUR from `<sender>` booked on 2026-10-12 with the subject <subject>, and rule <rule> decided
When the organiser opens Deudas
Then "Bizums en espera" lists it with its date, sender as the bank shows it, amount, subject and the reason <reason>

| amount | sender | subject | rule | reason |
| ------ | ------ | ------- | ---- | ------ |
| 12.00 | `Luis P.R.` (paired with "Luis Pérez", 2 open debts) | (empty) | R4 | "Luis Pérez debe 2 cuotas y el Bizum son 3" |
| 4.50 | `Marta G.L.` | `pachanga` | R5 | "El importe no es un número de cuotas, pero el asunto menciona pachanga" |
| 8.00 | `+34611111111` | (empty) | R7 | "No sabemos quién es el remitente" |
| 8.00 | `Marta G.L.` (fits "Marta García" and "Marta Gómez") | (empty) | R7 | "El remitente puede ser Marta García o Marta Gómez" |

`inferred`: the reason is shown because without it the organiser cannot tell which action the Bizum needs; the Spanish copy is a proposal. The subject is shown whatever it holds, since only the organiser reads it.

#### UC-006-04-S2 — The list when nothing waits

Given no Bizum is waiting
When the organiser opens Deudas
Then the section "Bizums en espera" shows "No hay Bizums en espera" and nothing else

#### UC-006-04-S3 — A waiting Bizum stays until something resolves it

Given a Bizum of 8.00 EUR from `+34611111111` waits
When 30 days pass and the system reads the account every day
Then the Bizum is still listed, once, unchanged

`author decision`: no notification and no expiry; the organiser resolves it at will. It leaves the list only through UC-006-05 (pairing, or the organiser's ruling) or UC-006-10 (its debt appears). A repeated read never changes it (UC-006-02-S3).

#### UC-006-04-S4 — Only the admin view shows the list

Given a Bizum waits
When <viewer> opens the application
Then "Bizums en espera" is not shown and its data is refused by the server

| viewer |
| ------ |
| a player |
| an admin using "Ver como jugador" |
| an admin using "Ver como otro jugador" |

`inferred` from `AGENTS.md`: a route added to `api.ts` is admin-only, and the player routes take no player id. No sender name or amount of a waiting Bizum reaches a player.

### UC-006-05 — The organiser resolves a waiting Bizum: pairs its sender and rules what it pays

**Actor:** the organiser. **Goal:** teach the system who a sender is, once, from a waiting Bizum, so this and every later Bizum of that sender is judged by the rules with that player as payer; and the organiser can rule that a waiting Bizum pays shares the rules would not settle, and is obeyed. **Graduation:** hard requirement (proposed). **Rests on:** Q-04, Q-05, Q-08. `author decision` (2026-10-16): the administrator is always right. What the rules cannot settle with certainty waits; once the organiser rules on it, the ruling is carried out, and the organiser may have reasons the system is not to judge.

#### UC-006-05-S1 — Pairing settles what now qualifies (outline)

Given a Bizum of <amount> EUR from `<sender>` waits (R7), "Luis Pérez" has <debts> open debts of one share (4.00 EUR) on played games, and another Bizum of 4.00 EUR from the same sender also waits
When the organiser chooses "Luis Pérez" for the sender in "Bizums en espera"
Then the sender is paired with him and the rules are applied again to every waiting Bizum of that sender, with the result <result>

| amount | sender | debts | result |
| ------ | ------ | ----- | ------ |
| 4.00 | `Luis P.R.` | 2 | both Bizums settle one debt each, the nearest first, and leave the list |
| 8.00 | `Luis P.R.` | 1 | the 8.00 Bizum waits (R4: 2 shares, 1 debt) and the 4.00 one settles; the 8.00 stays listed with its new reason |
| 4.00 | `+34600000000` | 2 | as the first row; the pairing is the phone, kept as his phone |

Each settled payment is as in UC-006-03-S5: method "Bizum", the link to its Bizum, the date it was booked. `verified — source`: a player's names are stored as aliases and a phone in `player_contacts` (study Q-05). `author decision` (agreed): a name sender is stored as an alias of the player and a phone sender as the player's phone.

#### UC-006-05-S2 — The organiser rules that a waiting Bizum pays shares, whatever its amount (outline)

Given a Bizum of <amount> EUR from `Luis P.R.`, paired with "Luis Pérez", waits, and he has 2 open debts of one share (4.00 EUR) on played games
When the organiser rules that the Bizum pays <shares> of his shares
Then it settles that many debts, the nearest game first, each with method "Bizum", the link to the Bizum, the date it was booked and the amount of the share, and the Bizum leaves "Bizums en espera" with <rest> EUR recorded on it as not allocated

| amount | shares | rest |
| ------ | ------ | ---- |
| 4.50 | 1 | 0.50 |
| 6.00 | 1 | 2.00 |
| 8.50 | 2 | 0.50 |

`author decision`: the cents beyond the share may be there for a reason the system is not to judge; the debt is settled for its share and the difference is left alone. The ruling bypasses rule R6 and the whole-shares condition of R3 only: the debts paid are still those of the Bizum's own season (UC-006-11; `author decision`: debts are not carried from one season to another, and that holds for the organiser's ruling too), and never more shares than the player has open debts. `author decision` (agreed): the nearest-first order applies; the number of shares is chosen by the organiser; the rest is stored on the Bizum, not on the payment, so a payment keeps being exactly one share (`verified — source`: `PaymentService.pay` adjusts the amount of a single share only). Correcting a ruling is UC-006-06.

#### UC-006-05-S3 — A sender that now fits two players

Given `Marta G.L.` is paired with "Marta García"
When the organiser pairs `Marta G.L.` with "Marta Gómez" from another waiting Bizum
Then the panel tells the organiser the sender now fits two players, and from then on Bizums of that sender wait (R7) until the organiser removes one pairing

`verified — source` for the outcome: a name that fits two players is ambiguous and never guessed (UC-006-03-S1; `NameMatcher`). `author decision` (agreed): the warning, so the organiser is not surprised.

#### UC-006-05-S4 — The organiser removes a pairing

Given `Luis P.R.` is paired with "Luis Pérez"
When the organiser removes that pairing
Then later Bizums of `Luis P.R.` are judged as an unknown sender, and every payment already made from earlier Bizums stays as it was

`author decision` (agreed), from N3 of the audit (the organiser can correct anything). Correcting a payment already made is UC-006-06. Where the pairings are listed and removed (the player's data, the Banco panel) is for the design.

#### UC-006-05-S5 — The organiser dismisses a Bizum forever

Given a Bizum of 187.43 EUR from `+34611111111` with the subject `reforma` waits in "Bizums en espera"
When the organiser dismisses it and confirms in the step that follows
Then it leaves the list for good, and nothing is settled

`author decision` (comment of 2026-10-15): the organiser must be able to dismiss Bizums forever. "Forever" is read as: no way back from the application, no list or panel shows it again. `author decision` (agreed): the system keeps only the bank's identification of the Bizum and that it was dismissed, so it is not processed again; its sender, subject and amount are deleted, because they can concern the organiser's private life (UC-006-02-S2). The confirmation is a step in the page, as in UC-006-01-S13.

#### UC-006-05-S6 — A dismissed Bizum stays dismissed (outline)

Given the organiser dismissed a Bizum from `Luis P.R.` of 4.00 EUR
When <event>
Then the Bizum is not listed, not evaluated and settles nothing

| event |
| ----- |
| the system reads the account again on its schedule |
| the bank connection is renewed |
| the organiser pairs `Luis P.R.` with "Luis Pérez" |
| a game of "Luis Pérez" is marked played (UC-006-10) |
| the organiser adds the include word that its subject holds |

`author decision`: forever. The same entry is told apart by the bank's own identification (UC-006-02-S3).

**Settled** by the author, 2026-10-16.

### UC-006-10 — A waiting Bizum settles when its debt appears

**Actor:** the system, triggered when the organiser marks a game played. **Goal:** a Bizum that waited only because the player had no open debt yet settles by itself once the debt exists. **Graduation:** hard requirement (proposed). **Rests on:** Q-09, Q-04. `author decision` (2026-10-16): a waiting Bizum is re-evaluated when a game becomes played, never by re-reading the bank (UC-006-02-S3), and pairing a sender re-evaluates that sender's Bizums (UC-006-05-S1).

#### UC-006-10-S1 — The game is marked played and the waiting Bizum settles

Given "Luis Pérez" is the only player `Luis P.R.` fits, and a Bizum of 4.00 EUR from `Luis P.R.` booked on 2026-10-08 waits because he had no open debt (R4), and the game of 2026-10-07 is about to be played with him in it
When the organiser marks that game played
Then the debt for that game is created, the waiting Bizum settles it (rule R3) with method "Bizum", the link to the Bizum and the date 2026-10-08, and the Bizum leaves "Bizums en espera"

`verified — source`: debts are created when a game is played (`BillingEffect`, `GameLifecycleService`; AGENTS.md); a Bizum often arrives before the game is marked played (study Q-09).

#### UC-006-10-S2 — Only Bizums that can now settle are touched (outline)

Given the waiting Bizums <waiting>, and a game of 2026-10-07 is marked played creating one open debt of 4.00 EUR for "Luis Pérez"
When the system re-evaluates the waiting Bizums
Then <result>

| waiting | result |
| ------- | ------ |
| 4.00 from `Luis P.R.` booked 2026-10-08 | settles the new debt |
| 4.00 from `Luis P.R.` booked 2026-10-06 | stays waiting: the game is after its booking date (UC-006-03-S2) |
| 4.00 from `+34611111111` (unknown sender) | stays waiting |
| 8.00 from `Luis P.R.` booked 2026-10-08 | stays waiting: 2 shares, 1 debt (R4) |
| 4.50 from `Luis P.R.` booked 2026-10-08, subject `pachanga` | stays waiting (R5) |

#### UC-006-10-S3 — Re-evaluation never discards and never touches other seasons

Given a Bizum waits, and the organiser has since added the exclude word that its subject holds
When a game is marked played and the system re-evaluates the waiting Bizums
Then that Bizum is not discarded: it settles if R3 now matches, and otherwise stays waiting

`author decision` (approved): a waiting Bizum was already kept; deleting it silently on a later list change would lose the organiser's work. Debts of another season than the Bizum's are not considered (UC-006-11).

#### UC-006-10-S4 — Several waiting Bizums, one debt

Given "Luis Pérez" has two waiting Bizums of 4.00 EUR booked on 2026-10-08 and 2026-10-09, and a game marked played creates one open debt
When the system re-evaluates the waiting Bizums
Then the one booked on 2026-10-08 settles it, the other stays waiting, and neither pays more than the debts that exist

`author decision` (approved): oldest booking first, so the result is deterministic.

**Settled** by the author, 2026-10-16.

### UC-006-06 — The organiser corrects an automatic payment

**Actor:** the organiser. **Goal:** undo a payment the system made from a Bizum (wrong player, wrong debt, wrong amount of shares) and put the Bizum back in the list where the organiser can decide again. **Graduation:** hard requirement (proposed). **Rests on:** Q-08. `verified — source`: undoing a payment exists and puts the debt back at the standard share (`PaymentService.undo`, `server/src/repo/payment-service.ts`; UC-006-08-S3). The correction is admin only (`inferred` from `AGENTS.md`: a route added to `api.ts` is admin-only).

#### UC-006-06-S1 — Undoing an automatic payment returns the debt and the Bizum

Given the system settled the debt of "Luis Pérez" for the game of 2026-10-07 from a Bizum of 4.00 EUR booked on 2026-10-12
When the organiser undoes that payment and confirms in the step that follows
Then the debt is open again as with any undone payment, and the Bizum is listed again in "Bizums en espera" with its original data, like any other waiting Bizum

`author decision` (2026-10-16): the Bizum goes back to the waiting list and is not marked or treated in any special way; the organiser typically deals with it right after undoing. The confirmation is a step in the page, as in UC-006-01-S13.

#### UC-006-06-S2 — A Bizum that paid several shares is undone as a whole

Given a Bizum of 8.00 EUR settled two debts of "Luis Pérez", on 2026-10-07 and 2026-09-30
When the organiser undoes the payment of 2026-10-07
Then the confirmation step lists both payments and, once confirmed, both are undone and the Bizum returns to the list

`inferred`: one Bizum, one decision; undoing half would leave a Bizum partly settled with an unexplained share. The organiser can then rule that it pays one share (UC-006-05-S2).

#### UC-006-06-S3 — Undoing a payment that no Bizum made is unchanged

Given a payment recorded by hand with the method "Efectivo" or "Bizum" and no link to a bank Bizum
When the organiser undoes it
Then it behaves as in UC-006-08-S3 and no Bizum is listed

**Settled** by the author, 2026-10-16.

### UC-006-07 — The organiser sees how each payment was paid and its Bizum

**Actor:** the organiser, and the player for their own payments. **Goal:** every payment says how it was paid, a Bizum payment can be traced to its Bizum and how it was settled, and a player learns the method only. **Graduation:** hard requirement (proposed). **Rests on:** Q-01, Q-02, Q-03, Q-08. `author decision`: sender names and bank data are admin only (`VISION.md` §3). Where the admin sees a payment (the game's payments, "Deudas", the player's report) the detail appears there; the exact places are for the design (`inferred`).

#### UC-006-07-S1 — The method shows on every payment (outline)

Given a payment <payment>
When the organiser looks at it
Then it shows the method <method>

| payment | method |
| ------- | ------ |
| recorded by hand as "Efectivo" | Efectivo |
| recorded by hand as "Otro" | Otro |
| recorded by hand as "Bizum" | Bizum |
| made by the system from a Bizum | Bizum |
| made by the organiser's ruling on a Bizum | Bizum |
| recorded before this feature (UC-006-08-S5) | Otro |

#### UC-006-07-S2 — A Bizum payment can be traced to its Bizum

Given the system settled a share from a Bizum of 4.50 EUR from `Luis P.R.`, booked on 2026-10-12 with the subject `pachanga`, which the organiser ruled to pay 1 share
When the organiser opens that payment's detail
Then it shows the booking date, the sender as the bank shows it, the amount, the subject, the bank's identification of the Bizum, "0.50 EUR sin asignar", and how it was settled: "Automático" or "Por decisión del organizador"

`author decision`: every Bizum payment is fully traceable (`VISION.md` §5, N9). The payment keeps its own date, the day the money arrived (UC-006-03-S5).

#### UC-006-07-S3 — A Bizum recorded by hand has no Bizum behind it

Given a payment recorded by hand with the method "Bizum"
When the organiser opens its detail
Then it shows "Registrado a mano" and no booking date, sender or bank identification

`author decision`: the organiser can record a manual payment as "Bizum" (UC-006-08-S1); it is not linked to the bank feed.

#### UC-006-07-S4 — A player sees the method and nothing of the Bizum (outline)

Given "Luis Pérez" has a payment of 4.00 EUR whose method is <method>
When Luis opens "Pagos", or the organiser uses "Ver como jugador" or "Ver como otro jugador" for him
Then the payment shows the method <method> and no booking date, sender, subject, bank identification or amount not allocated

| method |
| ------ |
| Bizum, made by the system |
| Bizum, recorded by hand |
| Efectivo |

`author decision` (2026-10-16): a player sees the method only. `verified — source`: every disclosure rule is in `OwnDisclosure` and the player's routes take no player id (`AGENTS.md`); the server decides, so the Bizum data is absent from the response, not hidden by the page.

#### UC-006-07-S5 — The method cannot be edited

Given a payment of 4.00 EUR recorded with the method "Efectivo"
When the organiser looks for a way to change its method
Then there is none; the correction is to undo it and record it again (UC-006-08-S3, S1)

`author decision` (2026-10-16).

**Settled** by the author, 2026-10-16.

## Interface Examples

- [`requirements/examples/screens.html`](requirements/examples/screens.html): thirteen phone-width screens drawn with the application's own stylesheet and markup (`web/src/styles.css`, the header, the bottom tabs, cards, rows, chips, buttons, section tabs and the full-screen dialog), so each shows where it sits: Ajustes › Banco (frames 1 to 4: bank choice, connection, expiry notice, reading settings, word lists, reconnection, account choice), Deudas with Bizums en espera and the manual payment method (5, 6), the dialogs to assign a player, pay shares and dismiss (7 to 9), the played game with its payments, the payment detail and undoing a multi-share payment (10 to 12) and the player's Pagos (13). Sketches to agree the content, not built.
- [`requirements/examples/payment-views.md`](requirements/examples/payment-views.md): what the organiser and a player see of a Bizum payment (UC-006-07). `not yet run`: worked by hand for the implementation to verify.

New interfaces, to be given their shape by the design: the callback `GET /api/bank/callback` (public, authorised by the single-use state); admin routes for the connection, forcing a read ("Leer ahora", UC-006-02-S9; the button is not yet drawn in `screens.html`), the setting of the currency, account, start date and word lists, the waiting list, pairing, ruling, dismissal and undoing; the new method and Bizum link on payments; the new fields in the player's payments response.

## File Locations

Paths below are the places the work touches, from the project layout (`AGENTS.md`); new files are named by the pattern and fixed by the design. Counts are `inferred` and are for the design to confirm.

| Kind | Path or pattern | Count |
| ---- | --------------- | ----- |
| Domain rules (new, with tests) | `server/src/domain/bizum-*.ts`, `server/src/domain/bizum-*.test.ts` | about 6 |
| Domain, existing | `server/src/domain/name-matcher.ts`, `server/src/domain/own-disclosure.ts` and its test | 2 |
| Schema and migration | `server/src/db/schema.sql`, `server/src/db/schema-migrator.ts` | 2 |
| Repositories and services (new) | `server/src/repo/bank-*.ts` (the bank-neutral parts and one support class for Revolut), `server/src/repo/bizum-*.ts` | about 8 |
| Repositories and services, existing | `server/src/repo/payment-service.ts`, `payment-repository.ts`, `debt-repository.ts`, `season-repository.ts`, `alias-repository.ts`, `contact-repository.ts`, `own-data-service.ts`, `billing-effect.ts`, and the composition root `server/src/repo/index.ts` | 9 |
| Routes | `server/src/routes/api.ts`, `own-router.ts`, a new public bank callback router, `api-routes.ts` | 4 |
| Server start-up (poller, settings) | `server/src/server-app.ts`, `server/src/index.ts` | 2 |
| Web pages and components | `web/src/pages/Debts.tsx`, `Manage.tsx`, `AdminShell.tsx`, `web/src/components/OwnPayments.tsx`, `PaymentCell.tsx`, new `Bank*.tsx` and `Waiting*.tsx` | about 8 |
| Web hooks and lib | `web/src/hooks/usePayments.ts`, `useDebtPayments.ts`, `useOwnPayments.ts`, new `useBank*.ts` | about 5 |
| End-to-end tests | `e2e/tests/*.spec.ts` | about 3 |
| Documentation | `docs/commands.md`, `docs/users-and-roles.md`, `docs/domain-model/` (Spanish), `.env.example` | 4 |

## Success Criteria

| Use cases | Check that fails if the requirement is unmet |
| --------- | -------------------------------------------- |
| UC-006-03 | A table test over rules R1–R7 with the rows of S1, S2, S4, S7 and S8; reordering the rules fails row 1 or row 2 of S8. |
| UC-006-03, -11 | A domain test with debts in two seasons: a Bizum booked on 2026-10-12 never settles a debt of 2026-06-10, and one booked on 2026-08-31 does. |
| UC-006-02 | A test feeding the same account entries twice, through a renewed session, and counting one outcome per entry; a test where a discarded entry leaves no row with sender, subject or amount. |
| UC-006-04, -05, -06, -10 | Route tests: the waiting list lists R4, R5 and R7 Bizums with their reasons; pairing, ruling and dismissal act as in the scenarios; a game marked played settles the waiting Bizum booked after it; undoing returns the Bizum to the list. |
| UC-006-07, -08 | Route tests on `OwnRouter`: the response of a player's payments has the method and none of the Bizum fields; manual payments keep the refusals of `PaymentService.pay`; the 67 earlier payments read "Otro". |
| UC-006-01 | Route tests: the callback refuses an unknown, reused and expired state; no response, page or log holds a key, token, code, state or session id. An end-to-end test of the panel against a fake bank. |
| UC-006-02 | Route tests: a forced read processes a new Bizum at once, and is refused while a read is in progress, within 5 minutes of the last read, and after a rate-limit answer until its retry time; the same state shows in both places of the web app (end to end). |
| UC-006-01, -02 | A test registers a second, fake bank next to Revolut: the panel lists both, the rules and the waiting list work unchanged on its entries, and no code outside the bank support names Revolut. |
| UC-006-01, -02 | The live check against the real Revolut account stays manual, as in WP-005 (the proof of concept); it is not part of the automated suite. |

## Constraints

- A wrong payment is never recorded; a Bizum that cannot be matched with certainty waits instead of being guessed; a delay of up to a day is acceptable (`VISION.md` §4).
- Every automatic payment is traceable to its Bizum and correctable (`VISION.md` §4).
- Every Bizum payment is fully traceable: the payment method and the link to the Bizum with its metadata are stored (`VISION.md` §5).
- The bank key and tokens never reach the repository, logs or the web interface (`VISION.md` §5).
- Settling payments by hand keeps working exactly as today, with or without the bank feed (`VISION.md` §5).
- Bank data and sender names are admin only; a player sees the method of their payments and nothing of the Bizum (`VISION.md` §3, UC-006-07-S4).
- The bank is a setting: only Revolut is implemented here, and no rule of UC-006-03 to -07 may depend on it (`author decision`, 2026-10-16).
- Consent to read the account lasts at most 180 days and its renewal needs the account owner's approval in the Revolut app (`VISION.md` §6).
- Money is integer cents; the season is derived from the date; a payment's date is when the money arrived (`AGENTS.md`).
- The work follows the project's coding standards, layering and test strategy (`VISION.md` §5; `.agents/rules/`, `docs/test-strategy.md`).

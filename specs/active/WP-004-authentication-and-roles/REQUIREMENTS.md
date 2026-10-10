# Requirements — WP-004-authentication-and-roles

## 1. Use Case Audit

Boundary: login and sessions, role-based access to the existing API and screens, user administration
by CLI, a regular user's own read-only view, their contact data and password, and a database backup.
Out: open registration, email sending, how the web is exposed (a later study).

Variants (study `09`, Q-09): two roles, **admin** (may or may not be linked to a player; everything the app does today) and
**regular** (linked to exactly one player; own debts, payments, statistics, contact data).
Not covered: standings, the debts overview, the player report picker and Manage for a regular user
(they get none of it, by author decision, Q-12).

Coverage of the vision's needs:

| Need                                                                                | Use cases                               |
| ----------------------------------------------------------------------------------- | --------------------------------------- |
| Safe to serve on the internet, organiser controls admin-only                        | UC-004-01, 02, 03                       |
| Admin creates users only; each regular user linked to a player, an admin optionally | UC-004-04                               |
| Player sees own debts, payments, statistics, read-only                              | UC-004-05, 06, 07                       |
| Player edits own email and phone                                                    | UC-004-08                               |
| Player changes own password (added by the author, no email)                         | UC-004-09                               |
| Existing data survives                                                              | UC-004-10, and the migration constraint |

## 2. Use Cases

Diagram: [`requirements/diagrams/use-cases.puml`](requirements/diagrams/use-cases.puml) (source; not rendered).

### UC-004-01 — Log in

Actor: any user (admin or regular). Goal: obtain a session.
Graduation: `hard requirement` (author decision). Rests on Q-07, Q-13.
A locked account answers with a locked response naming the remaining time, which reveals that the
username exists (author decision).

Grounding of the claims below:

| Claim                                                                                      | Tag                                                                                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Reference locks an account after 5 failed attempts for 15 minutes                          | `verified — source` (`auth_service.py`, the login method: `failed_attempts >= 5`, `lock_account(minutes=15)`) |
| Reference issues a 30-minute access token and a 30-day refresh token in an HttpOnly cookie | `verified — source` (`jwt_service.py`, `auth.py`, `settings.py` `get_cookie_config`)                          |
| Pachanguero uses the same numbers (5 attempts, 15 minutes, 30 minutes, 30 days)            | `author decision` (confirmed when UC-004-01 was approved)                                                     |
| A login names the user by a username, not by email                                         | `author decision` (confirmed when UC-004-01 was approved)                                                     |

#### UC-004-01-S1 — Successful login (outline)

Given an active user "<username>" with the role <role> and the correct password
When that user submits the login form with "<username>" and the password
Then the server answers with a 30-minute access token, sets a refresh-token cookie that is HttpOnly, Secure and SameSite=Strict, and the app opens the <screen>

| username | role    | screen                                                     |
| -------- | ------- | ---------------------------------------------------------- |
| antonio  | admin   | existing app (GameDay, Standings, Manage tabs)             |
| carlos   | regular | the user's own view (debts, payments, statistics, contact) |

#### UC-004-01-S2 — Wrong password

Given an active user "carlos" with 0 failed attempts
When carlos submits the login form with a wrong password
Then the server refuses with 401 and a generic message ("usuario o contraseña incorrectos"), issues no token and no cookie, and carlos has 1 failed attempt

#### UC-004-01-S3 — Unknown username

Given no user named "nadie"
When someone submits the login form with "nadie" and any password
Then the server refuses with the same 401 and the same message as UC-004-01-S2, in a comparable time

#### UC-004-01-S4 — Fifth failed attempt locks the account

Given an active user "carlos" with 4 failed attempts
When carlos submits the login form with a wrong password
Then the server refuses, carlos is locked for 15 minutes, and the response says the account is locked and for how long

#### UC-004-01-S5 — Locked account, correct password

Given user "carlos" locked for another 10 minutes
When carlos submits the login form with the correct password
Then the server refuses with the locked response, issues no token, and the failed-attempts count does not change

#### UC-004-01-S6 — Success clears the count

Given an active user "carlos" with 3 failed attempts
When carlos submits the login form with the correct password
Then the login succeeds as in UC-004-01-S1 and carlos has 0 failed attempts

#### UC-004-01-S7 — Deactivated user

Given a user "carlos" deactivated by the admin
When carlos submits the login form with the correct password
Then the server refuses with the same generic 401 as UC-004-01-S2 and issues no token

Attached to the `Then` of S2, S3, S7: the message never says whether the username exists or is deactivated.
Attached to S1: the password is checked against a stored salted hash, never stored or logged as text.

#### Non-behavioural, UC-004-01

- A user's password is never returned by any endpoint and never appears in logs.
- Login is the only route reachable without a token besides the SPA's static files and the
  refresh route (UC-004-02).

### UC-004-02 — Keep the session alive and log out

Actor: any logged-in user, through the app. Goal: stay logged in without re-entering the password,
and end the session on demand.
Graduation: `hard requirement` (author decision). Rests on Q-13.

Grounding:

| Claim                                                                                                | Tag                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Reference rotates the refresh token on every refresh and stores it hashed with a revoked flag        | `verified — source` (`auth_service.py` `refresh_access_token`; `auth_repository.py` `refresh_tokens`)                   |
| Reference's web client retries once after a 401 and queues concurrent requests behind one refresh    | `verified — source` (`api-axios.ts` response interceptor)                                                               |
| Pachanguero follows the same scheme                                                                  | `author decision` (Q-13)                                                                                                |
| Presenting an already-rotated refresh token only fails; it does not revoke the user's other sessions | `verified — source` for the reference (`refresh_access_token` raises 401 only); `author decision` as Pachanguero's rule |

#### UC-004-02-S1 — Access token expires during use

Given carlos is logged in and his 30-minute access token has expired
When carlos's app sends a request and gets 401
Then the app calls the refresh route once, receives a new access token and a new refresh cookie, repeats the original request, and carlos sees no login screen

#### UC-004-02-S2 — Several requests fail at once

Given carlos is logged in, his access token has expired, and the app has 3 requests in flight
When all 3 get 401
Then the app makes exactly 1 refresh call and repeats all 3 requests with the new token

#### UC-004-02-S3 — Reload the page

Given carlos is logged in with a valid refresh cookie and the page is reloaded (the access token, held only in memory, is gone)
When the app starts
Then it calls the refresh route, receives a new access token and opens carlos's view without the login screen

#### UC-004-02-S4 — Refresh rotates the token

Given carlos holds refresh token A, not revoked and not expired
When carlos's app calls the refresh route with A
Then token A is revoked, a new token B is stored hashed and set in the cookie, and presenting A again is refused

#### UC-004-02-S5 — Rotated or revoked token presented

Given refresh token A was already rotated
When someone calls the refresh route with A
Then the server refuses with 401, clears the cookie, and issues no token

#### UC-004-02-S6 — Refresh token expired

Given carlos's refresh token expired 1 day ago
When carlos's app calls the refresh route
Then the server refuses with 401 and the app shows the login screen

#### UC-004-02-S7 — Deactivated user cannot refresh

Given carlos holds a valid refresh token and the admin deactivates carlos
When carlos's app calls the refresh route
Then the server refuses with 401 and issues no token

#### UC-004-02-S8 — Log out

Given carlos is logged in with refresh token B
When carlos presses "Salir"
Then token B is revoked, the cookie is cleared, the app discards the access token and shows the login screen, and calling the refresh route with B is refused

#### Non-behavioural, UC-004-02

- The access token is held only in the app's memory, never in `localStorage` or `sessionStorage`.
- The refresh token is stored only as a hash; a copy of the database cannot be replayed as a session.
- Accepted limit (author decision): an access token already issued stays valid until it expires,
  up to 30 minutes after the user is deactivated or demoted. Refresh is refused at once (S7).

### UC-004-03 — Only an admin reaches organiser routes

Actor: anyone who calls the API or opens the app (anonymous, regular user, admin). Goal of the
system: each caller reaches exactly what their role allows.
Graduation: `hard requirement` (author decision). Rests on Q-01, Q-02, Q-12.

Grounding:

| Claim                                                                                                          | Tag                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The API has 43 routes in one router with no guard today; every route returns the whole group's data or mutates | `verified — source` (`routes/api.ts`, counted by `api.get/post/put/patch/delete`; `index.ts` mounts it with only `express.json()`) |
| A regular user sees nothing of the group: no standings, debts overview, player picker, Manage, game day        | `author decision` (Q-12)                                                                                                           |
| Every existing route is admin-only, and admin keeps today's behaviour unchanged                                | `author decision` (confirmed when UC-004-03 was approved)                                                                          |
| `/players/:playerId/report` takes any id today                                                                 | `verified — source` (`api.ts`, route `/players/:playerId/report`)                                                                  |

Routes of the new authentication and own-data views are specified in UC-004-01, 02, 05 to 09; this
use case governs every route that exists today and any added later.

#### UC-004-03-S1 — Anonymous caller (outline)

Given a caller who sends no token
When that caller requests <method> <route>
Then the server answers 401, runs nothing and returns no data

| method | route                  |
| ------ | ---------------------- |
| GET    | /api/seasons/current   |
| GET    | /api/players/details   |
| GET    | /api/debts             |
| GET    | /api/players/3/report  |
| POST   | /api/games/12/state    |
| POST   | /api/games/12/payments |
| PATCH  | /api/players/3         |
| DELETE | /api/games/12          |

#### UC-004-03-S2 — Regular user on an organiser route (outline)

Given carlos, a regular user linked to the player with id 3, logged in
When carlos requests <method> <route>
Then the server answers 403, runs nothing and returns no data

| method | route                    |
| ------ | ------------------------ |
| GET    | /api/seasons/current     |
| GET    | /api/seasons/2/standings |
| GET    | /api/debts               |
| GET    | /api/players/details     |
| GET    | /api/players/3/report    |
| POST   | /api/games/12/state      |
| POST   | /api/games/12/payments   |
| PATCH  | /api/players/3           |

The row `/api/players/3/report` is carlos's own id: the old route stays admin-only even for one's own
data; his statistics come from the own-data route of UC-004-07.

#### UC-004-03-S3 — Admin keeps everything

Given antonio, an admin, logged in
When antonio requests any of the 43 routes that exist today
Then it behaves exactly as before authentication was added, with the same status and body

#### UC-004-03-S4 — Token that is not valid (outline)

Given a caller who sends <token> as the Bearer token
When that caller requests GET /api/seasons/current
Then the server answers 401, runs nothing and returns no data

| token                                                          |
| -------------------------------------------------------------- |
| an access token that expired 1 minute ago                      |
| an access token signed with a different secret                 |
| an access token with its payload edited after signing          |
| a token with the algorithm `none`                              |
| a refresh token (type `refresh`) used as a Bearer token        |
| an access token of a user deactivated more than 30 minutes ago |

#### UC-004-03-S5 — A route nobody classified

Given the test suite lists every route registered on the API router
When the suite checks each route's access rule
Then every route is declared as public (login, refresh, logout), own-data (regular user) or admin, and a route with no declaration fails the suite and is denied to everyone at run time

#### UC-004-03-S6 — Regular user's screen

Given carlos, a regular user, logs in
When the app opens
Then it shows only carlos's own view and a "Salir" action; the GameDay, Standings, Debts, player report and Manage tabs are absent, and the app makes no call to an organiser route

#### UC-004-03-S7 — Admin's screen

Given antonio, an admin, logs in
When the app opens
Then it shows the existing tabs unchanged and, when the admin is linked to a player, the switch to the regular view of UC-004-11

#### Non-behavioural, UC-004-03

- The server decides; hiding a tab (S6) is a convenience, never the protection.
- A refused request leaves no trace in the database (nothing is written before the check).
- The static files of the app are served without a token; they contain no data.

### UC-004-04 — Admin manages users with the CLI

Actor: the admin, as operator with a shell in the running container. Goal: create and look after
accounts; there is no web screen for it and no registration.
Graduation: `hard requirement` (author decision). Rests on Q-06, Q-11, Q-12, Q-13.

Grounding:

| Claim                                                                                                                                                                         | Tag                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Users are managed by a CLI run inside the container; the reference offers create, list, reset-pwd, unlock, activate, deactivate, promote, demote, delete, update-email, stats | `verified — document` (`trading-monolith/docs/administration.md`, "User Management CLI") and `author decision` (Q-11) to use that standard |
| The role admin is granted only by the CLI; in principle there is one admin                                                                                                    | `author decision`                                                                                                                          |
| An admin may or may not be linked to a player; a regular user is always linked to exactly one                                                                                 | `author decision`                                                                                                                          |
| The password policy is the reference's: 12 or more characters, an uppercase, a lowercase, a digit, a special one                                                              | `verified — document` (`administration.md`, "Password Policy"); applying it here is `author decision`                                      |
| Merging two players when one has a user: the user follows the survivor; both having users refuses the merge                                                                   | `author decision` (`PlayerMergeService.merge(intoId, fromId)` moves every player id column, `verified — source`)                           |
| `delete`, `stats` and `update-email` of the reference are not needed; the last admin cannot be deactivated or demoted                                                         | `author decision`                                                                                                                          |

#### UC-004-04-S1 — Create a regular user

Given the player "Carlos" (id 3) has no user and no user named "carlos" exists
When the operator runs `create` with username "carlos", role regular, player "Carlos" and the password "Gol-del-Miercoles7"
Then an active user "carlos" exists, linked to player 3, with the password stored only as a hash, and the CLI confirms it

#### UC-004-04-S2 — A regular user needs a player

Given the operator runs `create` for role regular
When the operator gives no player
Then the CLI refuses, names the missing player, and creates nothing

#### UC-004-04-S3 — One user per player

Given the player "Carlos" (id 3) already has the user "carlos"
When the operator runs `create` with username "carlos2" for player "Carlos"
Then the CLI refuses, names the existing user, and creates nothing

#### UC-004-04-S4 — Username taken

Given the user "carlos" exists
When the operator runs `create` with username "carlos" for another player
Then the CLI refuses and creates nothing

#### UC-004-04-S5 — Password policy (outline)

Given the operator runs `create` with a valid username and player
When the operator types the password <password>
Then the CLI refuses, lists the failed rule <rule>, and creates nothing

| password           | rule      |
| ------------------ | --------- |
| Gol-7              | length    |
| gol-del-miercoles7 | uppercase |
| GOL-DEL-MIERCOLES7 | lowercase |
| Gol-del-miercoles  | digit     |
| Goldelmiercoles77  | special   |

#### UC-004-04-S6 — Create an admin (outline)

Given no user named "antonio" exists
When the operator runs `create` with username "antonio", role admin and <player>
Then an active admin "antonio" exists with <link>

| player               | link             |
| -------------------- | ---------------- |
| none                 | no player        |
| the player "Antonio" | player "Antonio" |

#### UC-004-04-S7 — Reset a password

Given the user "carlos" is locked with 5 failed attempts and holds 2 live refresh tokens
When the operator runs `reset-pwd` for "carlos" with a new password that meets the policy
Then the password hash is replaced, the 2 refresh tokens are revoked, the lock and the failed attempts are cleared, and carlos can log in with the new password only

#### UC-004-04-S8 — Unlock

Given the user "carlos" is locked for another 10 minutes
When the operator runs `unlock` for "carlos"
Then the lock and the failed attempts are cleared and carlos can log in with the current password

#### UC-004-04-S9 — Deactivate and reactivate

Given the active user "carlos" holds 1 live refresh token
When the operator runs `deactivate` for "carlos"
Then carlos cannot log in or refresh, the refresh token is revoked, and `activate` restores the ability to log in with the same password

#### UC-004-04-S10 — Promote and demote

Given the regular user "carlos", linked to player 3
When the operator runs `promote` for "carlos"
Then carlos is an admin and stays linked to player 3; and `demote` returns him to regular only while he is linked to a player, else the CLI refuses

#### UC-004-04-S11 — Never leave the app without an admin

Given "antonio" is the only active admin
When the operator runs `deactivate` or `demote` for "antonio"
Then the CLI refuses and says that at least one active admin must remain

#### UC-004-04-S12 — List

Given 3 users, one of them locked
When the operator runs `list`
Then the CLI shows for each its username, role, linked player, and whether it is active and locked, and never a hash

#### UC-004-04-S13 — Merging players that have users

Given player 3 has the user "carlos" and player 7 has no user
When the admin merges player 3 into player 7 in the app
Then the user "carlos" is now linked to player 7; and if both players have users, the merge is refused and names both users

#### Non-behavioural, UC-004-04

- The CLI works on the same database file as the running server; access control for it is the
  operator's access to the container, there is no network route to it.
- The CLI never prints or logs a password or a hash; passwords are read without echo.
- A command that fails changes nothing (it runs in one transaction).

### UC-004-05 — A player sees their own debts

Actor: a regular user (or an admin in the regular view, UC-004-11). Goal: know what they owe and
what is owed on their behalf.
Graduation: `hard requirement` (author decision). Rests on Q-03, Q-12.

A **share** is one player's part of one game's cost. It has a **holder** (who answers for it) and a
**beneficiary** (whose share it is, or an anonymous plus-one of the holder). A share still owed is a
row of `share_debts`.

Grounding:

| Claim                                                                                            | Tag                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| A share has a holder and a beneficiary, which may be different players; a plus-one has no player | `verified — source` (`schema.sql` `share_debts`; `debt-repository.ts` `OutstandingShare`)  |
| A guest's share is held by the player who brought them                                           | `author decision` (confirmed when UC-004-05 was approved; `introduced_by` in `schema.sql`) |
| The only other player's name a user sees is the holder of a share that is theirs                 | `author decision` (Q-12)                                                                   |
| What a user owes is the sum of the shares they hold, their own and those held for guests         | `author decision`                                                                          |
| Names of the named guests whose shares the user holds are not shown (only "invitado")            | `author decision`                                                                          |

#### UC-004-05-S1 — Own share owed

Given carlos (player 3) holds his own share of 5,00 € for the game of 2026-10-07
When carlos opens his debts
Then the list shows that game's date, the amount 5,00 € and "tu parte", and the total owed is 5,00 €

#### UC-004-05-S2 — Share held by the host

Given carlos is the guest of ana (player 5), and ana holds carlos's share of 5,00 € for the game of 2026-10-07
When carlos opens his debts
Then the list shows that game, 5,00 € and "lo paga Ana", in a separate section, and the total carlos owes does not include it

#### UC-004-05-S3 — Shares held for guests

Given ana holds her own share and the shares of her 2 guests, 5,00 € each, for the game of 2026-10-07
When ana opens her debts
Then the list shows her own share and 2 shares marked "invitado" without any name, and the total owed is 15,00 €

#### UC-004-05-S4 — Nothing owed

Given carlos holds no share and none is held for him
When carlos opens his debts
Then the screen says he is up to date and the total is 0,00 €

#### UC-004-05-S5 — Only their own

Given ana owes 15,00 € and carlos owes 5,00 €
When carlos opens his debts
Then nothing of ana's debts appears, not her name, not her amount

#### UC-004-05-S6 — Debt gone once settled

Given carlos holds a share of 5,00 € and the admin records its payment in the app
When carlos opens his debts
Then that share is no longer listed and the total owed is reduced by 5,00 €

### UC-004-06 — A player sees their own payments

Actor: a regular user. Goal: check what has been paid and when.
Graduation: `hard requirement` (author decision). Rests on Q-03, Q-12.

Grounding:

| Claim                                                                                                  | Tag                                                 |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| A settled share is a row of `payments` with its game, holder, beneficiary, payer, amount and `paid_on` | `verified — source` (`schema.sql` `payments`)       |
| Imported seasons carry the game date as `paid_on`, not the real date                                   | `verified — document` (`AGENTS.md`, last paragraph) |
| A user's payments are those where they are the payer or the beneficiary                                | `author decision`                                   |
| The payer's name is shown only when the payer is the share's holder (the host)                         | `author decision`                                   |

#### UC-004-06-S1 — Own payment

Given carlos paid his own share of 5,00 € for the game of 2026-09-30 on 2026-10-02
When carlos opens his payments
Then the list shows that game, 5,00 € and the date 2026-10-02, newest payment first

#### UC-004-06-S2 — Paid by the host

Given ana paid, on 2026-10-03, the share of 5,00 € that was carlos's for the game of 2026-09-30
When carlos opens his payments
Then the list shows that game, 5,00 €, 2026-10-03 and "pagado por Ana"

#### UC-004-06-S3 — Paid for guests

Given ana paid on 2026-10-03 her own share and the shares of 2 guests, 5,00 € each, for the game of 2026-09-30
When ana opens her payments
Then the list shows 3 payments of 5,00 € for that game, 2 of them marked "invitado" without any name

#### UC-004-06-S4 — Nothing paid yet

Given carlos has no payment
When carlos opens his payments
Then the screen says there are no payments yet

#### UC-004-06-S5 — Only their own

Given ana paid 5,00 € on 2026-10-03 for herself
When carlos opens his payments
Then nothing of ana's payments appears

Non-behavioural: a payment imported from the old spreadsheet shows the game's date as its date,
because the real one was lost; the screen does not say otherwise.

### UC-004-07 — A player sees their own statistics

Actor: a regular user. Goal: see how they are doing in the season and in each game. Read-only.
Graduation: `hard requirement` (author decision). Rests on Q-03, Q-12.

Grounding:

| Claim                                                                                                      | Tag                                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| One player's games, season figures and summary are already produced by the player report                   | `verified — source` (`PlayerReportService.report(playerId, today)`)                                         |
| Per-game statistics are `callUp` and `payment`; season statistics are `points` and `mercy`                 | `verified — source` (`call-up-stat.ts`, `payment-stat.ts`, `points-season-stat.ts`, `mercy-season-stat.ts`) |
| The regular view shows the same statistics the admin's player report shows, for the user's own player only | `author decision`                                                                                           |

#### UC-004-07-S1 — Season figures

Given carlos has 4 points and 1 mercy seat in the current season 2026/2027
When carlos opens his statistics
Then the season section shows 4 points and 1 mercy seat for 2026/2027

#### UC-004-07-S2 — Games

Given carlos played 3 games and was left out of 1 in 2026/2027
When carlos opens his statistics
Then the list shows the 4 games, newest first, each with its date, whether he played or was left out, and its payment status

#### UC-004-07-S3 — Summary

Given carlos played 3 games, was left out of 1, paid 2 and owes 1 in 2026/2027
When carlos opens his statistics
Then the summary says 3 games played and shows the paid and owed counts

#### UC-004-07-S4 — Earlier seasons

Given carlos played 5 games in 2025/2026 and 2 in 2026/2027
When carlos opens his statistics and asks for all seasons
Then the list adds the 5 games of 2025/2026 and the season figures stay those of the current season

#### UC-004-07-S5 — No current season

Given no season contains today's date
When carlos opens his statistics
Then the games are shown without season figures

#### UC-004-07-S6 — Read-only

Given carlos is viewing his statistics
When carlos looks for a way to change a game, a payment, a point or the call-up
Then the screen offers none, and the server has no route that lets a regular user change them

#### Non-behavioural, UC-004-05 to 07

- Each of the three views takes its player from the caller's token, never from an id in the request;
  a request that carries another player's id is refused (UC-004-03-S2).
- A caller with no linked player (an admin not linked to one) gets 403 from these routes.
- Money is shown from integer cents, in euros with a comma (`5,00 €`); the UI is in Spanish.

### UC-004-08 — A player edits their own email and phone

Actor: a regular user (or an admin in the regular view). Goal: keep their contact data up to date.
The email and phone are contact data only: nothing is sent to them.
Graduation: `hard requirement` (author decision). Rests on Q-04, Q-05, Q-12.

Grounding:

| Claim                                                                                                                                            | Tag                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Contact data belongs to the player; `players` has no email or phone today                                                                        | `verified — source` (`schema.sql` `players`) and `author decision` (email associated to players) |
| A user can edit only their own player's email and phone, and nothing else about the player                                                       | `author decision` (Q-12)                                                                         |
| An email is valid when it has text, one "@" and a domain with a dot; a phone when it has 9 to 15 digits, with an optional leading "+" and spaces | `author decision`                                                                                |
| Both fields are optional and may be cleared; an email may be shared by two players; the admin does not edit contact data in Manage               | `author decision`                                                                                |

#### UC-004-08-S1 — Save contact data

Given carlos (player 3) has no email and no phone
When carlos saves the email "carlos@example.com" and the phone "+34 600 123 456"
Then player 3 holds that email and that phone, and carlos sees them when he reopens the screen

#### UC-004-08-S2 — Invalid values (outline)

Given carlos has the email "carlos@example.com"
When carlos saves the <field> "<value>"
Then the save is refused, the message names the field, and player 3 keeps its previous values

| field | value            |
| ----- | ---------------- |
| email | carlos           |
| email | carlos@example   |
| email | @example.com     |
| phone | 12345            |
| phone | abc              |
| phone | 1234567890123456 |

#### UC-004-08-S3 — Clear a value

Given carlos has the phone "600123456"
When carlos saves an empty phone
Then player 3 has no phone and keeps its email

#### UC-004-08-S4 — Nothing else can be changed

Given carlos (player 3)
When carlos sends a save that also carries the name "Otro", the introducer or a game
Then the server refuses the extra fields, and the name, introducer and games of player 3 are unchanged

#### UC-004-08-S5 — Only their own

Given carlos (player 3) and ana (player 5)
When carlos sends a save that names player 5
Then the server refuses and ana's data is unchanged

#### UC-004-08-S6 — No linked player

Given the admin "antonio" is not linked to a player
When antonio opens the contact screen
Then the server answers 403 and the screen is not offered

### UC-004-09 — A logged-in user changes their own password

Actor: any logged-in user, admin or regular. Goal: replace the password the operator gave them.
No email is involved; a forgotten password is reset by the operator (UC-004-04-S7).
Graduation: `hard requirement` (author decision). Rests on Q-07, Q-13.

Grounding:

| Claim                                                                                                                                                                | Tag                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The reference checks the current password, requires new and confirmation to match, applies the strength rules, stores the new hash and revokes all the user's tokens | `verified — source` (`auth_service.py` `change_password`)                   |
| The same policy as in UC-004-04-S5 applies                                                                                                                           | `author decision`                                                           |
| A wrong current password does not count toward the lockout in the reference                                                                                          | `verified — source` (same method raises without touching `failed_attempts`) |
| Pachanguero does the same, and refuses a new password equal to the current one                                                                                       | `author decision`                                                           |

#### UC-004-09-S1 — Change the password

Given carlos is logged in with the password "Gol-del-Miercoles7" and holds 2 live refresh tokens
When carlos sends the current password, the new password "Penalti-en-Mayo42" and the same confirmation
Then the hash is replaced, both refresh tokens are revoked, the app returns to the login screen, "Gol-del-Miercoles7" no longer logs in and "Penalti-en-Mayo42" does

#### UC-004-09-S2 — Wrong current password

Given carlos is logged in
When carlos sends a wrong current password
Then the change is refused with a message about the current password, nothing changes, and carlos stays logged in

#### UC-004-09-S3 — Confirmation differs

Given carlos is logged in
When carlos sends a new password and a different confirmation
Then the change is refused and nothing changes

#### UC-004-09-S4 — New password breaks the policy (outline)

Given carlos is logged in
When carlos sends the new password <password> with the right current password
Then the change is refused, the failed rule <rule> is listed, and nothing changes

| password           | rule      |
| ------------------ | --------- |
| Gol-7              | length    |
| gol-del-miercoles7 | uppercase |
| GOL-DEL-MIERCOLES7 | lowercase |
| Gol-del-miercoles  | digit     |
| Goldelmiercoles77  | special   |

#### UC-004-09-S5 — Same password

Given carlos is logged in with the password "Gol-del-Miercoles7"
When carlos sends it as the new password too
Then the change is refused and nothing changes

#### Non-behavioural, UC-004-08 and 09

- A refused change because of the current password is not an expired session: the app shows the
  message and must not try to refresh the token or send the user to the login screen.
- A password never appears in a response or a log.
- The contact screen and the password form live in the user's own view, in Spanish.

### UC-004-11 — The admin switches between the admin view and the regular view

Actor: the admin, linked to a player. Goal: see the app exactly as a regular user sees it, to check
what players get in production, and go back.
Graduation: `hard requirement` (author decision). Rests on Q-12 and the author's request after the Study.

Grounding:

| Claim                                                                                                                             | Tag                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| The admin may or may not be linked to a player; the admin role is given only by the CLI                                           | `author decision`                                                                   |
| The switch is a button in settings; in the regular view the admin has exactly the permissions of a player, except the button back | `author decision`                                                                   |
| The regular view the admin sees is that of their own linked player                                                                | `author decision`                                                                   |
| Settings is an existing place in the app ("Ajustes", where season rules are edited)                                               | `verified — document` (`AGENTS.md`, "Rules are per-season … editable from Ajustes") |
| The chosen view survives a page reload and a token refresh; logging in again starts in the admin view                             | `author decision`                                                                   |
| Going back to the admin view asks for no password                                                                                 | `author decision`                                                                   |

#### UC-004-11-S1 — Switch to the regular view

Given antonio, an admin linked to the player "Antonio" (player 1), is in the admin view
When antonio presses "Ver como jugador" in settings
Then the app shows the regular view of player 1 (debts, payments, statistics, contact data, password), the organiser tabs disappear, and settings offers "Volver a administrador"

#### UC-004-11-S2 — Organiser routes are refused in the regular view (outline)

Given antonio is in the regular view
When antonio's app requests <method> <route>
Then the server answers 403, runs nothing and returns no data

| method | route                    |
| ------ | ------------------------ |
| GET    | /api/debts               |
| GET    | /api/seasons/2/standings |
| POST   | /api/games/12/payments   |
| PATCH  | /api/players/1           |

#### UC-004-11-S3 — Same data as a player

Given player 1 owes 5,00 € and the regular user "antonio-jugador" would see the same, being linked to player 1
When antonio, in the regular view, opens debts, payments and statistics
Then each shows exactly what a regular user linked to player 1 sees, in the same form

#### UC-004-11-S4 — Same edits as a player

Given antonio is in the regular view
When antonio saves a contact email or changes his password
Then it behaves as in UC-004-08 and UC-004-09 (the password change ends the session and returns to the login screen)

#### UC-004-11-S5 — Switch back

Given antonio is in the regular view
When antonio presses "Volver a administrador"
Then the organiser tabs return and organiser routes answer as before

#### UC-004-11-S6 — The view survives a reload

Given antonio is in the regular view
When the page is reloaded, or his access token expires and is refreshed
Then he is still in the regular view and organiser routes still answer 403

#### UC-004-11-S7 — A new login is an admin login

Given antonio is in the regular view
When antonio logs out and logs in again
Then he is in the admin view

#### UC-004-11-S8 — Admin without a player

Given the admin "root" is not linked to a player
When root opens settings
Then "Ver como jugador" is not offered, and a request to switch is refused with 403

#### UC-004-11-S9 — A regular user cannot switch up

Given carlos, a regular user
When carlos requests the switch to the admin view
Then the server answers 403 and carlos stays a regular user

#### Non-behavioural, UC-004-11

- The server decides which view applies, as with every other rule; hiding the tabs is not enough.
- The switch changes nothing in the database.
- Accepted limit (author decision): an admin-view access token issued before the switch stays valid until
  it expires, up to 30 minutes (as UC-004-02).

### UC-004-10 — The admin creates a backup of the database

Actor: the admin, as operator with a shell in the running container. Goal: hold a safe copy of the
data before anything risky, and whenever wanted. Also run by the server itself at start-up before a
schema change (S5).
Graduation: `hard requirement` (author decision). Rests on Q-05, Q-06, Q-11.

Grounding:

| Claim                                                                                                                                                          | Tag                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The live database runs with a write-ahead log: next to `pachanguero.db` sit `-wal` and `-shm` files, the `-wal` holding recent writes not yet in the main file | `verified — invocation` (`ls -la data/`: `pachanguero.db` 225 280 bytes, `pachanguero.db-wal` 873 472 bytes) |
| So copying only the `.db` file of a running server can lose data; a consistent copy needs SQLite's backup mechanism                                            | `inferred` from the line above                                                                               |
| The README already documents a backup with `sqlite3 … ".backup '/ruta/backup.db'"`                                                                             | `verified — document` (`README.md`, deployment section)                                                      |
| The `sqlite3` command-line tool is not available in this environment and need not exist in the container; the app's own CLI must do the backup                 | `verified — invocation` (`sqlite3: command not found` on this machine); the container is `unverified`        |
| The author keeps a copy before risky changes: `data/pachanguero.before-wp003.db`                                                                               | `verified — invocation` (`ls data/`)                                                                         |
| The live data is 43 players, 53 games, 67 payments, 2 outstanding debts                                                                                        | `verified — invocation` (read-only count on `data/pachanguero.db`, 2026-10-10)                               |
| Backups are kept on the mounted data volume, never deleted automatically; restoring is replacing the database file by hand, documented in the README           | `author decision`                                                                                            |

#### UC-004-10-S1 — Backup while the server runs

Given the server is running and a user is logging in
When the operator runs `backup`
Then a file `pachanguero-<date>-<time>.db` appears in the backups folder of the data volume, it opens as a database holding every table with the same row counts as the live one at that moment, and the server was not stopped

#### UC-004-10-S2 — Recent writes are in the backup

Given the live database has 12 rows in its write-ahead log that are not yet in the main file
When the operator runs `backup`
Then the backup holds those 12 rows too

#### UC-004-10-S3 — Backup fails

Given the volume has no room for the backup
When the operator runs `backup`
Then the CLI reports the failure, leaves no partial file behind, and the live database is unchanged

#### UC-004-10-S4 — Restore from a backup

Given a backup made on 2026-10-10 with 43 players and later changes in the live database
When the operator stops the server, replaces the database file with that backup and starts it again
Then the app shows the data as of the backup, including users, and the registered players and games are those 43 and 53

#### UC-004-10-S5 — Automatic backup before a schema change

Given a database at an older schema version and a new release that migrates it
When the server starts the new release
Then it first writes a backup named `pachanguero-<date>-<time>-before-migration.db`, then migrates; and if that backup cannot be written, it does not migrate and does not start

#### UC-004-10-S6 — The live data survives the migration

Given a copy of the live database with 43 players, 53 games, 67 payments and 2 outstanding debts at the schema before this work package
When the server starts the new release on that copy
Then it still has those 43 players, 53 games, 67 payments and 2 debts, every game with the same state, and each payment with the same amount, date and payer, and the new tables exist and are empty

#### UC-004-10-S7 — Migration twice

Given the copy of S6 already migrated
When the server starts again
Then nothing changes and no second backup of a migration is made

#### Non-behavioural, UC-004-10

- A backup holds password hashes and contact data: its file is readable by its owner only.
- `backup` is a command of the same CLI as UC-004-04 and has no network route.
- The migration needs no `ALTER` of an existing table only if contact data goes to a new table
  (Study Q-05); the choice is Design's, the preservation of data (S6) binds either way.

## 3. Interface Examples

Hand-worked from the scenarios and marked `not yet run`: names and paths are illustrative until
Design, and the implementation verifies them.

- [`requirements/examples/api.md`](requirements/examples/api.md): login, refresh, logout, access refusals, own-data routes, view switch.
- [`requirements/examples/cli.md`](requirements/examples/cli.md): user management and backup commands.
- [`requirements/examples/schema.md`](requirements/examples/schema.md): `users`, `refresh_tokens`, contact data (two options left to Design).

## 4. File Locations

Existing files touched (exact paths):

| Kind                       | Paths                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API composition and wiring | `server/src/index.ts`, `server/src/routes/api.ts`, `server/src/repo/index.ts`                                                                                                                                  |
| Schema and database        | `server/src/db/schema.sql`, `server/src/db/index.ts`, `server/src/db/test-support.ts`, `server/src/db/schema.test.ts`                                                                                          |
| Players, merge, report     | `server/src/repo/player-merge-service.ts`, `server/src/repo/player-edit-service.ts`, `server/src/repo/player-report-service.ts`, `server/src/repo/debt-repository.ts`, `server/src/repo/payment-repository.ts` |
| Server tests               | `server/src/routes/api.test.ts` (all 43 routes need the admin token)                                                                                                                                           |
| Web client                 | `web/src/api.ts`, `web/src/App.tsx`, `web/src/main.tsx`, `web/src/styles.css`                                                                                                                                  |
| E2E                        | `e2e/playwright.config.ts` (readiness probe on `/api/seasons`), `e2e/tests/*.spec.ts` (2 files)                                                                                                                |
| Documents made untrue      | `AGENTS.md`, `README.md`, `docs/test-strategy.md`, `docs/domain-model/glossary.md`, `docs/domain-model/README.md`, `.agents/rules/coding-standard.md` and `frontend-coding-standard.md` (check only)           |
| Deployment                 | `deploy/pachanguero.service` and `deploy/Caddyfile` (replaced by the Docker deployment, study `04`)                                                                                                            |
| Packages                   | `package.json`, `server/package.json`, `web/package.json` (a JWT library and a password hasher, each installed only with the author's go-ahead)                                                                |

New files (patterns, counts are estimates for Design to fix):

| Kind                                                                           | Pattern                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Domain: roles, password policy, lockout, view rules                            | `server/src/domain/*.ts` and `*.test.ts` (about 4 classes)                                                                 |
| Repositories and services: users, tokens, contact, own data, backup, migration | `server/src/repo/*.ts` and tests (about 8 classes)                                                                         |
| Auth middleware and routes                                                     | `server/src/routes/*.ts` and tests (2 files)                                                                               |
| CLI                                                                            | `server/scripts/*.ts` (1 tool, 9 commands: create, list, reset-pwd, unlock, activate, deactivate, promote, demote, backup) |
| Web: login, own view, settings switch, hooks, pure `lib/` helpers              | `web/src/pages/*.tsx`, `web/src/components/*.tsx`, `web/src/hooks/*.ts`, `web/src/lib/*.ts` and tests (about 12 files)     |
| E2E specs and auth fixture                                                     | `e2e/tests/*.spec.ts`, `e2e/tests/*fixture*.ts`                                                                            |
| Docker                                                                         | `Dockerfile`, `.env.example`, a build script, `docs/domain-model/usuarios-y-roles.md`                                      |

## 5. Success Criteria

| Use case           | The check that fails if it is unmet                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC-004-01          | Route tests on login: every scenario S1 to S7 with the real lockout count and the 5-attempt, 15-minute limits; a test that S2, S3 and S7 return identical bodies.                                                                        |
| UC-004-02          | Route tests on refresh and logout: rotation, replay refused, expiry, deactivated user; a web test that 3 concurrent 401s make 1 refresh call.                                                                                            |
| UC-004-03          | A test that lists every route of the API router and fails on one with no declared access (S5); the S1, S2 and S4 tables run as route tests; the existing `api.test.ts` passes with an admin token.                                       |
| UC-004-04          | CLI tests per command and per refusal (S1 to S13) against an in-memory database built from `schema.sql`.                                                                                                                                 |
| UC-004-05 to 07    | Route tests with two players' data in one database, asserting that none of the other player's rows or names appears; web `lib/` tests for totals and the host section.                                                                   |
| UC-004-08, 09      | Route tests on the invalid-value and policy tables; a test that a password change revokes every refresh token.                                                                                                                           |
| UC-004-11          | Route tests that an admin token in the regular view gets 403 on organiser routes and the player's data on own-data routes; an E2E that the switch and the return work.                                                                   |
| UC-004-10          | A test that a backup of a database with unflushed write-ahead-log rows contains them; a migration test on a copy of the live data (43 players, 53 games, 67 payments, 2 debts) comparing counts and amounts before and after, run twice. |
| Whole work package | `npm test` and `npm run test:e2e` pass; `npm run lint` and `npm run format:check` pass; E2E specs log in through the new fixture.                                                                                                        |

## 6. Constraints

Copied from `VISION.md` and the Study:

- No external services.
- The existing test suites must stay green; login and role checks get their own tests.
- The database holds valuable data that must not be lost: a schema change must preserve it. Migrations are allowed, which overrides the "no migration system" rule in `AGENTS.md` (to be updated).
- A regular user sees only their own debts, payments, statistics and contact data; no standings (Q-12).
- No email is sent; no open registration; users are created only with the CLI.
- Standard protection for an app served from home: passwords hashed, no data without a valid token, a regular user cannot reach another player's data or an admin action.
- Deployment is Docker, as in the reference project; the database file lives on a mounted volume (Q-11).
- Dependencies are installed only with the author's go-ahead at the time (Q-13).
- Any change away from legacy domain behaviour must be opt-in per season (`AGENTS.md`); this work package changes none.

# Users and roles

The application asks for a login. There are two roles, and everyone who signs in
has their own user.

## The two roles

| Role        | Who                   | What they see                                                                                                                  |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Admin**   | The organiser         | Everything: the week's game, the standings, the debts, the players and the settings, plus "Mi cuenta" to change their password |
| **Regular** | A player of the group | Only their own: **Deudas**, **Pagos**, **Estadísticas** and **Ajustes** (their contact data and password)                      |

The server decides what can be seen; hiding a tab on screen is not enough.
Anything that is not the player's own is admin-only by default: a new route on the
organiser's API is closed to regular users without anyone having to remember it.

## One user per player

- A regular user belongs to **one player**, and a player has at most one user. The
  name used to sign in (the **username**) is not the player's name: it is 3 to 32
  characters (letters, digits, dot, hyphen and underscore), case-insensitive, and
  serves only for signing in.
- An admin may or may not have a player. One who does can also
  [see the application as a player](#the-admins-view).

## How users are created

**Only the operator, with the command line** (`pachanguero-admin`). There is no
registration and no "forgot my password": whoever needs one asks the operator,
who sets a new password. Passwords are asked for on the keyboard or read from
standard input, never taken as an argument, so they do not end up in the shell
history.

The commands (`create`, `list`, `reset-pwd`, `unlock`, `activate`, `deactivate`,
`promote`, `demote`, `link`, `backup`) and how to run them in each environment are in
[`commands.md`](commands.md#the-admin-tool).

At least one active admin always remains: a command that would leave none is
refused.

## Passwords

At least 12 characters, with an uppercase letter, a lowercase letter, a digit and
a special character. Changing one from Ajustes requires the current one, and **all
the user's sessions end**: they must sign in again. Passwords are stored hashed
(scrypt); nobody, the operator included, can read them.

## Session and lock-out

- Signing in gives an **access token that lasts 30 minutes** and a renewal cookie
  (HttpOnly, `SameSite=Strict`, and `Secure` in production) that lasts **30
  days**. The application renews the access token by itself while the cookie is
  valid. Both periods can be changed with `ACCESS_TOKEN_MINUTES` and
  `REFRESH_TOKEN_DAYS`.
- **Five wrong passwords in a row lock the account for fifteen minutes.** The
  answer says how long is left, which reveals that the username exists (a
  decision taken). When the lock ends, one more wrong password locks it again.
  Only a correct sign-in, `unlock` or `reset-pwd` resets the count.
- Deactivating a user ends their sessions, but **the access token they already
  hold stays valid for up to 30 minutes** (an accepted limit).

## What a player sees of the others

Only the players tied to them by a share, and only by name:

- on a share of theirs someone else answers for, **that player's name**;
- on a share they answer for, **why**: their guest, named ("tu invitado Adri") or
  not ("tu invitado (+1)"), or a share the organiser moved to them ("por Ana").

A player sees neither the standings, nor their position in them, nor anyone
else's debts, nor anyone's identifier. These rules live in a single class,
`OwnDisclosure`; the player's routes take no player identifier: who the player is
comes from their session.

A player sees the **method** of each of their payments (Efectivo, Bizum or Otro) and
nothing of the Bizum behind it: not its booking date, sender, subject, the bank's
identification of it nor what was left unallocated. The server leaves those out of the
answer, for the player and for an admin looking as them. The organiser, in the payment
cell, opens the detail of a Bizum payment.

They do see, and can change, their own **contact data**: up to five emails and a phone, all optional; the organiser can change them too. The application sends nothing with them; they are there so the organiser
knows how to reach them. A phone also identifies its player as the sender of a
Bizum, so changing it changes whose Bizums the system recognises; the player is never
shown that, nor any other bank datum.

Bank data is admin only: the Banco panel, the Bizums waiting for the organiser and the
names senders appear under on Bizum (a player's "Bizum name") are never sent to a
player, and every route that serves them refuses a regular user and an admin using
"Ver como jugador" or "Ver como otro jugador".

## The admin's view

An admin who has a player can press **"Ver como jugador"** in "Mi cuenta" and see
the application exactly as their player sees it, without being asked for the
password; **"Volver a administrador"** (in Ajustes) takes them back. The chosen
view survives a page reload, but every sign-in starts in the admin view. In the
player view the server treats them as a regular user: they cannot call the
organiser's routes.

### Looking at the app as another player

For troubleshooting, any admin (with a player of their own or not) can choose
**"Ver como otro jugador"** in "Mi cuenta" and pick any player of the group, with
or without a user. The app then shows that player's debts, payments, statistics
and contact data, exactly as that player sees them, under a notice saying whose
view it is; "Volver a administrador" in Ajustes ends it.

- **The admin acts as that player on their own data**: they can read it and change
  the player's contact data. They cannot change a password (it would be the
  admin's own, not the player's), and they remain a regular user as far as the
  server is concerned: no organiser route answers.
- **It is logged.** Each time an admin starts looking at another player, the
  admin, the player and the time are recorded; `pachanguero-admin views` lists the
  latest 50. Looking at their own player is not logged.
- Like the choice of view, it belongs to the session: it survives a reload and a
  token renewal, ends with "Volver a administrador" or by signing out, and a new
  sign-in starts as the admin.

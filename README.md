# Pachanguero

Wednesday 7-a-side football: signing up, paying, and deciding who plays when more
than 14 sign up.

It replaces the `Futbol_Miercoles` spreadsheet and its Apps Script. The rules are
documented in [`docs/domain-model/`](docs/domain-model/) (in Spanish) — start with
its [README](docs/domain-model/README.md).

## What it does

- **Sign-up list.** You paste the WhatsApp list and the system recognises the
  names (nicknames, emojis and numbering included), tells regulars, named guests
  and anonymous guests (`+1`) apart, and lets you resolve by hand whatever it is
  unsure about. It never guesses a name.
- **Convocatoria.** Simulates and confirms who gets in, with points and the mercy
  rule when the regulars exceed 14, and by order of arrival for guests when there
  are spare places.
- **Game lifecycle.** A game goes through Abierto, Convocatoria creada,
  Convocatoria confirmada and Jugado (or Cancelado). The convocatoria can be
  corrected by hand, and marking the game as played derives who played and who
  earns an exclusion point.
- **Payment per share.** Every player, and every `+1`, is a share; payment comes
  later, share by share, and whoever brings guests answers for them.
- **Teams (optional).** You paste the Claros and Oscuros teams after playing; only
  each player's team is stored.
- **Points and debts.** Live standings and who owes how much.
- **Seasons with their own rules.** The current season comes from the date
  (September to August), and the day and time of the weekly game can be changed
  without rewriting past weeks.
- **Past games**, recorded with just their date.
- **Login with two roles.** The organiser (admin) sees everything; a player sees
  only their own debts, payments, statistics and contact data. See
  [`docs/users-and-roles.md`](docs/users-and-roles.md).

How a week flows, step by step:
[`ciclo-del-partido.md`](docs/domain-model/ciclo-del-partido.md).

## Commands and configuration

Running, configuring and operating it (npm scripts, the environment variables and
the `.env` file, the `pachanguero-admin` tool, the container, trying the app by
hand) is all in [`docs/commands.md`](docs/commands.md).

The game rules are **per season**, editable from Ajustes: places, mercy seats,
games waiting, demotion direction, and whether a mercy seat resets the counter to
zero or subtracts N from it.

## Deployment

The server serves the SPA and the API on a single port, so a reverse proxy such as
Caddy only has to forward to one upstream. The steps for the Raspberry Pi (systemd
unit, `JWT_SECRET`, Caddy) and for the container are in
[`docs/commands.md`](docs/commands.md); backups and restoring are in
[`docs/backup_and_restore.md`](docs/backup_and_restore.md).

## Users and access

The application asks for a login, with two roles: the admin (the organiser, who
sees everything) and the regular user (a player, who sees only their own data).
Users are created only by the operator, with `pachanguero-admin`; there is no
registration. The rules are in [`docs/users-and-roles.md`](docs/users-and-roles.md)
and the commands in [`docs/commands.md`](docs/commands.md#the-admin-tool).

## What changes with respect to the spreadsheet

**`*` no longer means three things at once.** In the sheet it was "I sign up",
"I played and owe you" and "I do not score yet", and paying overwrote it with a
`4`, leaving no trace that the payment came late. Here they are three separate
facts: signed up, played and paid (with the date the money arrived). That is why a
past convocatoria can be audited even though payments keep arriving whenever they
like.

**Convocatorias are frozen.** Each run stores the positions, the points it saw and
the rules it applied.

**The seniority curve is a function**, not a table looked up with `INDIRECT`, so
it does not break when a row is inserted and it works beyond 13 seasons.

The defects of the original script are catalogued in
[`legacy-script-review.md`](docs/domain-model/legacy-script-review.md). The
default behaviour **reproduces the script**, the counter's included; the season
option "the mercy seat resets the counter to zero" switches it to the rule as the
organiser describes it.

To work on the project (install, tests, code structure), see
[`AGENTS.md`](AGENTS.md).

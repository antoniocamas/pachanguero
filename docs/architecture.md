CODENAME: SD-ARCHITECTURE-316

# Architecture

Why the code is shaped as it is, for whoever designs a change that crosses layers. The layers and what binds each are in `server/AGENTS.md` and its rules; the game rules in [`domain-model/`](domain-model/) (Spanish); who may see what in [`users-and-roles.md`](users-and-roles.md).

## One process, one file

In production one Node process serves the API and the built SPA on one port, against one SQLite file, with no second writer.

## Why the server is layered

- **The rules are separate from storage and transport**, so they are unit-tested with no database and read against `domain-model/` on their own.
- **One use case per service, wired in one place**, so a use case is one place to read.
- **Handlers stay thin**, so a rule never hides in one.

## State changes drive the effects

Only a game's lifecycle triggers what follows from it, and each fact has one writer, so undoing a state undoes exactly what entering it did. The writers: [`game-lifecycle-constraints.md`](../server/.agents/rules/game-lifecycle-constraints.md).

## Access is decided by where a route is mounted

So a forgotten guard fails closed. Rules: [`own-data-access.md`](../server/.agents/rules/own-data-access.md).

## The bank is a plug-in, the Bizum is not

The Bizum core is bank-neutral: it defines ports (dialect, connector, policy, store) and a read loop ([`bizum-feed-constraints.md`](../server/.agents/rules/bizum-feed-constraints.md)). Everything bank-specific sits behind those ports, so a second bank is a new dialect and connector, not a change to what a Bizum means for the group. Setting up the bank: [`bank-connection.md`](bank-connection.md).

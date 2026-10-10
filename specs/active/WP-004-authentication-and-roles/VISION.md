# Vision — WP-004-authentication-and-roles

## 1. Problem Statement

The app has no authentication: anyone who can reach it can read and change everything. Separately, players cannot see their own debts, payments and personal statistics without the organiser sending WhatsApp copies.

## 2. Key Stakeholder or User Needs

The organiser (admin) needs the app to be safe to serve from home on the internet, with all organiser controls staying organiser-only. Each player (regular user) needs to see their own debts, payments and statistics, read-only, and to edit their own email and phone number, which the app will start storing.

## 3. Scope

In: login with JWT; users created only by an admin; two roles (admin, regular); linking each user account to a player record; a regular user's own view (debts, payments, read-only statistics) and editing of their own email and phone number. Admin keeps everything the app does today.
Out: open registration. How the web becomes reachable from outside is studied afterwards.

## 4. Quality Ranges

Standard protection for an app served from a home connection to the internet: it must not be trivially vulnerable (passwords stored hashed, no access to data without a valid token, a regular user cannot reach another player's data or any admin action).

## 5. Constraints

- No external services.
- Existing test suites must stay green; login and role checks get their own tests.
- The database holds valuable data that must not be lost: a schema change must preserve it. Migrations are allowed (this overrides the "no migration system" practice in `AGENTS.md`, which will need updating).

## 6. Assumptions and Dependencies

- JWT is the chosen mechanism (the author's usual choice in other projects) — a decision, not an assumption.
- Each regular user maps to exactly one player, and an admin may map to one — `unverified` (existing players, including guests and merged duplicates, may not all be users).
- Exposing the web beyond the LAN is a separate, later study — dependency outside this work package.

# Authentication And Roles

Anyone who can reach the app can read and change everything: there is no login, and no way to give the group a safe view of the debts, points and games without handing over the organiser's controls.
Add JWT authentication with admin-created users only (no open registration) and two roles: admin, which is everything the app does today, and regular, who gets a defined read-only view of what concerns them. Keep the existing test suites green and cover login with its own tests.
Makes it safe to expose the app beyond the LAN, gives the group a page of their own instead of WhatsApp copies, and keeps the organiser's controls organiser-only. How the web becomes reachable is studied afterwards.

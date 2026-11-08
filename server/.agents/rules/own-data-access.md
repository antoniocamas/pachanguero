CODENAME: DC-OWN-DATA-ACCESS-315

# A player sees only their own data

Roles and views: `docs/users-and-roles.md`.

- Add organiser routes to `api.ts` only: `ApiRoutes` mounts it behind `Authenticate` and `requireEffective('admin')`, so the mounting is the guard. Never add one elsewhere without a guard.
- Never give an `OwnRouter` route (under `/me`) a player id. The player comes from the token (`OwnPlayer`), and every disclosure rule lives in `OwnDisclosure`.

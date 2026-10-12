# API examples — `not yet run`

Worked by hand from the scenarios. Paths are illustrative until Design; bodies show the rule, not a
final contract. Nothing here has been called against a running server.

## Login (UC-004-01)

```
POST /api/auth/login   {"username":"carlos","password":"Gol-del-Miercoles7"}
200  {"accessToken":"<jwt, 30 min>","expiresIn":1800,"user":{"username":"carlos","role":"regular"}}
     Set-Cookie: refresh=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000

POST /api/auth/login   {"username":"carlos","password":"mala"}          -> 401 {"error":"usuario o contraseña incorrectos"}
POST /api/auth/login   {"username":"nadie","password":"cualquiera"}     -> 401 {"error":"usuario o contraseña incorrectos"}
POST /api/auth/login   (5th wrong password)                              -> 423 {"error":"cuenta bloqueada","lockedUntilMinutes":15}
```

## Session (UC-004-02)

```
POST /api/auth/refresh   (cookie refresh=A)   -> 200 new accessToken + Set-Cookie refresh=B ; A is revoked
POST /api/auth/refresh   (cookie refresh=A again) -> 401, cookie cleared
POST /api/auth/logout    (cookie refresh=B)   -> 204, cookie cleared, B revoked
```

## Access (UC-004-03)

```
GET  /api/debts                      (no token)              -> 401
GET  /api/debts                      (regular user's token)  -> 403
GET  /api/debts                      (admin token)           -> 200 as today
GET  /api/seasons/current            (refresh token as Bearer) -> 401
```

## Own data, regular view (UC-004-05 to 09)

```
GET   /api/me/debts      -> 200 {"owedCents":500,"mine":[{"gameId":12,"playedOn":"2026-10-07","amountCents":500,"kind":"own"}],
                                 "heldByHost":[{"gameId":12,"playedOn":"2026-10-07","amountCents":500,"holderName":"Ana"}]}
GET   /api/me/payments   -> 200 [{"gameId":9,"playedOn":"2026-09-30","amountCents":500,"paidOn":"2026-10-02","paidBy":null}]
GET   /api/me/report     -> 200 same shape as /api/players/:id/report, for the caller's own player
PATCH /api/me/contact    {"email":"carlos@example.com","phone":"+34 600 123 456"} -> 200
PATCH /api/me/contact    {"email":"carlos"}                       -> 422 {"error":"email no válido"}
PATCH /api/me/contact    {"name":"Otro"}                          -> 422 (extra field refused)
PUT   /api/me/password   {"current":"…","new":"Penalti-en-Mayo42","confirm":"Penalti-en-Mayo42"} -> 204, all refresh tokens revoked
PUT   /api/me/password   {"current":"mala",…}                     -> 422 {"error":"contraseña actual incorrecta"}   (not 401)
GET   /api/me/debts      (admin in the admin view)               -> 403
```

## View switch (UC-004-11)

```
POST /api/auth/view   {"view":"regular"}   (admin linked to a player)  -> 200 new accessToken for the regular view
POST /api/auth/view   {"view":"regular"}   (admin with no player)       -> 403
POST /api/auth/view   {"view":"admin"}     (regular user)               -> 403
```

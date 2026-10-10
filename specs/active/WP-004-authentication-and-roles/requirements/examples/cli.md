# CLI examples — `not yet run`

Worked by hand from UC-004-04 and UC-004-10. The tool name `pachanguero-users` is illustrative until
Design. Run inside the container, e.g. `docker exec -it pachanguero pachanguero-users <command>`.
Passwords are read without echo. Nothing here has been run.

```
$ pachanguero-users create --username carlos --role regular --player "Carlos"
Password: ********   Confirm: ********
✓ Usuario creado: carlos (regular, jugador Carlos)

$ pachanguero-users create --username carlos2 --role regular --player "Carlos"
✗ El jugador Carlos ya tiene el usuario carlos.

$ pachanguero-users create --username antonio --role admin
✓ Usuario creado: antonio (admin, sin jugador)

$ pachanguero-users list
USUARIO   ROL      JUGADOR   ACTIVO  BLOQUEADO
antonio   admin    —         sí      no
carlos    regular  Carlos    sí      no

$ pachanguero-users deactivate --username antonio
✗ Debe quedar al menos un administrador activo.

$ pachanguero-users reset-pwd | unlock | activate | deactivate | promote | demote --username <name>

$ pachanguero-users backup
✓ /data/backups/pachanguero-20261011-193000.db
```

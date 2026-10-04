# Pachanguero

Fútbol 7 de los miércoles: apuntarse, pagar, y decidir quién juega cuando se
apuntan más de 14.

Sustituye a la hoja de cálculo `Futbol_Miercoles` y su Apps Script. Las reglas
están documentadas en [`docs/domain-model/`](docs/domain-model/) — empieza por el
[README](docs/domain-model/README.md).

## Qué hace

- **Lista de apuntados.** Pegas la lista de WhatsApp y el sistema reconoce los
  nombres (con apodos, emojis y numeración), distingue habituales, invitados e
  invitados anónimos (`+1`), y te deja resolver a mano lo que no tiene claro. Nunca
  adivina un nombre.
- **Convocatoria.** Simula y confirma quién entra, con puntos y mercy rule
  cuando los habituales se pasan de 14, y por orden de llegada para los
  invitados cuando sobran plazas.
- **Lista final.** Pegas la lista de después del partido, con los equipos Claros y
  Oscuros: es lo que registra quién jugó y cuánto debe cada uno.
- **Puntos y deudas.** Clasificación en vivo y quién debe cuánto.
- **Temporadas con sus propias reglas.** La temporada actual sale de la fecha
  (de septiembre a agosto), y el día y la hora del partido semanal se pueden
  cambiar sin reescribir las semanas pasadas.
- **Partidos del pasado**, registrándolos solo con su fecha.

Cómo fluye una semana, paso a paso:
[`ciclo-del-partido.md`](docs/domain-model/ciclo-del-partido.md).

## Configuración

| Variable         | Por defecto           |                                     |
| ---------------- | --------------------- | ----------------------------------- |
| `PORT`           | `8787`                |                                     |
| `HOST`           | `0.0.0.0`             | Ponlo a `127.0.0.1` detrás de Caddy |
| `PACHANGUERO_DB` | `data/pachanguero.db` | Ruta del fichero SQLite             |

Las reglas de juego son **por temporada**, editables desde Ajustes: plazas,
mercy seats, partidos de espera, dirección de degradación, y si un mercy seat
pone el contador a cero o le resta N.

## Despliegue en la Raspberry

El servidor sirve la SPA y la API en un único puerto, así que Caddy sólo tiene
que redirigir a un upstream.

```bash
git clone <repo> /opt/pachanguero && cd /opt/pachanguero
npm ci && npm run build
sudo mkdir -p /var/lib/pachanguero && sudo chown pi /var/lib/pachanguero
sudo cp deploy/pachanguero.service /etc/systemd/system/
sudo systemctl enable --now pachanguero
```

El 443 ya está ocupado, así que [`deploy/Caddyfile`](deploy/Caddyfile) plantea
tres opciones: **subdominio** (recomendada — Caddy enruta por nombre, ambos
servicios comparten el 443 y no se toca nada), ruta bajo el sitio actual, u otro
puerto. La primera es la única que no obliga a poner un puerto en la URL.

Copia de seguridad: es un fichero.

```bash
sqlite3 /var/lib/pachanguero/pachanguero.db ".backup '/ruta/backup.db'"
```

## Lo que cambia respecto a la hoja

**`*` ya no significa tres cosas a la vez.** En la hoja era «me apunto», «jugué y
te debo» y «no puntúo todavía», y al pagar se sobrescribía con un `4` sin dejar
rastro de que el pago llegó tarde. Aquí son tres datos distintos: apuntado,
jugó y pagó (con la fecha en que llegó el dinero). Por eso una convocatoria
pasada se puede auditar aunque los pagos sigan llegando cuando quieran.

**Las convocatorias se congelan.** Cada ejecución guarda las posiciones, los
puntos que vio y las reglas que aplicó.

**La curva de antigüedad es una función**, no una tabla consultada con
`INDIRECT`, así que no se rompe al insertar una fila y funciona más allá de 13
temporadas.

Los defectos del script original están catalogados en
[`legacy-script-review.md`](docs/domain-model/legacy-script-review.md). El
comportamiento por defecto **reproduce el script**, incluido el del contador; la
opción de temporada «el mercy seat pone el contador a cero» lo cambia a la regla
tal y como está contada.

Para desarrollar en el proyecto (instalar, tests, estructura del código), mira
[`AGENTS.md`](AGENTS.md).

# Pachanguero

Fútbol 7 de los miércoles: apuntarse, pagar, y decidir quién juega cuando se
apuntan más de 14.

Sustituye a la hoja de cálculo `Futbol_Miercoles` y su Apps Script. Las reglas
están documentadas en [`docs/domain-model/`](docs/domain-model/) — empieza por el
[README](docs/domain-model/README.md).

## Qué hace

- **Pantalla de partido.** Una fila por jugador, dos botones: se apunta / jugó /
  pagó. Se acabó editar celdas a mano.
- **Convocatoria.** Simula y confirma la selección de los 14, con la mercy rule.
- **Puntos y deudas.** Clasificación en vivo y quién debe cuánto.
- **Varias temporadas**, cada una con sus propias reglas.

## Puesta en marcha

```bash
npm install
npm run seed          # importa la temporada 2024/2025 desde data/seed/
npm run dev           # API en :8787, web en :5173
```

Sin `npm run seed` arrancas en blanco: crea una temporada desde Ajustes.

```bash
npm test              # tests del dominio
npm run build         # compila web + server
npm start             # producción, un solo puerto, sirve la SPA y la API
```

## Estructura

```
docs/domain-model/   Las reglas, de dónde salen y qué se verificó
data/seed/           Rejillas de 2024/2025 recuperadas del PDF
server/src/domain/   Lógica pura, en clases: puntos, antigüedad, convocatoria (+ tests)
server/src/db/       Esquema SQLite
server/src/repo/     Repositorios y servicios (casos de uso)
web/src/             React + Vite, mobile-first
deploy/              systemd + Caddy
```

La carpeta `domain/` no sabe nada de SQLite ni de HTTP: son clases con sus
tests, sin dependencias externas. Es donde viven las reglas, y donde hay que
tocar para cambiarlas.

## Configuración

| Variable         | Por defecto           |                                     |
| ---------------- | --------------------- | ----------------------------------- |
| `PORT`           | `8787`                |                                     |
| `HOST`           | `0.0.0.0`             | Ponlo a `127.0.0.1` detrás de Caddy |
| `PACHANGUERO_DB` | `data/pachanguero.db` | Ruta del fichero SQLite             |

Las reglas de juego son **por temporada**, en la base de datos, editables desde
Ajustes: plazas, mercy seats, partidos de espera, dirección de degradación, y si
un mercy seat pone el contador a cero o le resta N.

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
rastro de que el pago llegó tarde. Aquí son tres campos: `signed_up`, `played` y
`paid_cents` con su `paid_on`. Por eso una convocatoria pasada se puede auditar
aunque los pagos sigan llegando cuando quieran.

**Las convocatorias se congelan.** Cada ejecución guarda las posiciones, los
puntos que vio y las reglas que aplicó.

**La curva de antigüedad es una función**, no una tabla consultada con
`INDIRECT`, así que no se rompe al insertar una fila y funciona más allá de 13
temporadas.

Los defectos del script original están catalogados en
[`legacy-script-review.md`](docs/domain-model/legacy-script-review.md). El
comportamiento por defecto **reproduce el script**, incluido el del contador; el
flag `mercy_resets_counter` lo cambia a la regla tal y como está contada.

# El ciclo de un partido

Cómo pasa una semana por el sistema, de la lista pegada al resultado. Las reglas
de puntos y de selección están en [`points.md`](points.md) y
[`convocatoria.md`](convocatoria.md); aquí solo el orden en que ocurren las
cosas y qué manda en cada paso.

## La temporada sale de la fecha

Una temporada va del **1 de septiembre al 31 de agosto** y se identifica por el
año en que empieza (`2024/2025` empieza en 2024). No hay temporada «activa» que
cambiar a mano: la temporada actual es la que contiene la fecha de hoy, y un
partido pertenece a la temporada que contiene su fecha. Si no hay ninguna
temporada para una fecha, no se inventa: hay que crearla. Un partido del pasado
se registra con su fecha, se cobra al precio de **esa** temporada, la antigüedad se
pregunta respecto a ella y recorre los mismos estados que cualquier otro.

Un jugador no se «da de alta» en una temporada. Entra la primera vez que
aparece en un partido de ella; en ese momento se le pregunta cuántas temporadas
lleva (la sugerencia es la última que tenía registrada más una, o 0 si es
nuevo) y no se le vuelve a preguntar.

## Los estados de un partido

Un partido está siempre en uno de cinco estados:

| Estado                      | Qué significa                                    |
| --------------------------- | ------------------------------------------------ |
| **Abierto**                 | Se apuntan candidatos; aún no hay convocatoria.  |
| **Convocatoria creada**     | Hay una selección guardada, todavía provisional. |
| **Convocatoria confirmada** | El organizador la da por buena.                  |
| **Jugado**                  | El partido se jugó.                              |
| **Cancelado**               | No se juega.                                     |

Movimientos permitidos:

- **Crear la convocatoria**: desde Abierto, Convocatoria creada o Convocatoria
  confirmada, a Convocatoria creada (volver a crearla recalcula).
- **Confirmar**: de Convocatoria creada a Convocatoria confirmada.
- **Marcar como jugado**: solo desde Convocatoria confirmada.
- **Reabrir**: de Jugado a Convocatoria confirmada.
- **Cancelar**: desde cualquier estado, también Jugado. El partido recuerda el
  estado que dejó y **deshacer la cancelación** vuelve exactamente a él.

Qué se puede tocar en cada estado:

|                            | Abierto | Creada | Confirmada | Jugado | Cancelado |
| -------------------------- | ------- | ------ | ---------- | ------ | --------- |
| Apuntar y quitar apuntados | sí      | sí     | sí         | no     | no        |
| Corregir la convocatoria   | no      | sí     | sí         | no     | no        |
| Registrar pagos            | no      | no     | no         | sí     | no        |
| Pegar los equipos          | no      | no     | no         | sí     | no        |

Lo que no se puede hacer responde con el motivo («Reabre el partido para
editarlo», «El partido está cancelado», «Confirma la convocatoria antes de
marcar el partido como jugado»…). La pantalla ofrece en cada estado una sola
acción siguiente: crear la convocatoria, confirmarla, marcar como jugado,
registrar pagos (solo si queda alguna parte por pagar) o deshacer la
cancelación.

## 1. Candidatos

El organizador arma la lista de candidatos del partido: pega la de WhatsApp o
escribe un nombre, y lo que añade va **detrás** de lo que ya hay. Se limpia
(numeración, viñetas, emojis, caracteres invisibles) y cada nombre se
busca entre los jugadores y sus apodos, sin importar mayúsculas ni tildes:

- Un nombre que encaja con **uno solo** queda reconocido.
- Uno que no encaja con nadie, o que encaja con **varios**, se queda «sin
  resolver» y no se apunta a nadie hasta que el organizador decide: elegir al
  jugador (solo para esa línea), elegirlo y recordar el apodo, o registrar a uno
  nuevo. Nunca se adivina.
- Lo que hay bajo un encabezado `Reservas` se descarta.
- `Nombre (Anfitrión)` es un invitado nombrado solo en la línea que registra a
  ese nombre como nuevo; un jugador que ya existe no cambia por el paréntesis.
  Pero si ese nombre ya está en la lista con **otro anfitrión** (`Javi (Fer)` y
  `Javi (Caro)`), no se funde con él: queda «sin resolver» como posible duplicado
  y el organizador decide si es otra persona (se registra con otro nombre, p. ej.
  «Javi de Caro»).
- `Anfitrión +1` es un acompañante anónimo.

La lista conserva el orden y un jugador repetido ocupa una sola línea; se puede
quitar un nombre, **modificarlo** (elegir a otro jugador, recordar el apodo o
registrar uno nuevo cuando el reconocimiento se equivocó) o vaciarla. **Nada cuenta hasta pulsar «Guardar lista»**: al
guardar quedan apuntados los reconocidos y la lista sustituye a la anterior (lo
jugado y lo pagado se conservan). Las líneas sin resolver se guardan solo como
texto y se leen de nuevo contra los jugadores de ese momento, así que un apodo
registrado entretanto ya las reconoce. Registrar un jugador o un apodo no espera
al guardado.

## 2. Convocatoria

Es la predicción de quién juega. Con los habituales dentro de las plazas entran
todos y los invitados ocupan el resto por orden de llegada (un `+1` anónimo
ocupa plaza como cualquiera). Si los habituales se pasan, compiten todos por
puntos con la mercy rule. **Crearla** guarda la selección y pasa el partido a
«Convocatoria creada»; no marca asistencia ni pagos ni puntos de exclusión
(esos se deciden al jugarse el partido). Sin nadie apuntado no se puede crear
(«No hay nadie apuntado»). Para puntuar hace falta tener la antigüedad
capturada.

Mientras está creada o confirmada se corrige a mano (ver
[`convocatoria.md`](convocatoria.md)), y volver a crearla recalcula; si hay
correcciones, pide confirmación antes de descartarlas («Se perderán tus
correcciones»). **Confirmarla** solo la sella: no recalcula nada.

Los partidos importados del histórico ya jugados tienen una convocatoria
confirmada calculada con los puntos de aquel momento; quién jugó y quién pagó
sigue siendo lo que dice el histórico.

## Quién jugó y el punto de exclusión

Al marcar el partido como jugado se **deriva** quién jugó y quién se lleva un
punto de exclusión, a partir de la convocatoria tal como quedó (con las
correcciones a mano). Un `+1` anónimo no genera nada.

| En la convocatoria                         | Jugó | Punto de exclusión     |
| ------------------------------------------ | ---- | ---------------------- |
| Elegido por el algoritmo                   | sí   | ninguno                |
| Dejado fuera por el algoritmo (`excluded`) | no   | 1, tipo `points`       |
| Degradado (`demoted`) y sigue fuera        | no   | 1, tipo `demoted`      |
| Elegido y sacado a mano                    | no   | 1, tipo `points`       |
| Dejado fuera y metido a mano               | sí   | ninguno                |
| Con el mercy seat                          | sí   | ninguno (nunca puntúa) |
| Con el mercy seat y sacado a mano          | no   | 1, tipo `points`       |

Reabrir o cancelar el partido retira todo esto (nadie queda como jugado y no
queda ningún punto de ese partido), sin tocar los pagos ni los equipos; marcarlo
jugado de nuevo lo recalcula. Un jugador que jugó y no ha pagado cuenta como
jugado pero con 0 partidos pagados.

## Pago después de jugar

Al marcar el partido como jugado se **factura**: una deuda por cada parte de
quien juega (el anfitrión responde por sus `+1` y por sus invitados con nombre).
Se paga después, parte a parte: paga quien responde de ella o su beneficiario, y
el punto de asistencia es del beneficiario. Una cantidad rara para una sola parte
es un ajuste (3,75 € salda la parte, sin saldo pendiente). Deshacer un pago
devuelve la parte a deuda y borra la fecha de pago. Reabrir o cancelar el
partido conserva deudas y pagos, y volver a jugarlo no factura nada dos veces.

## Equipos (opcional)

Con el partido jugado se pueden pegar los dos equipos (`Claros` y `Oscuros`, en
cualquier orden). Es un paso opcional: no hace falta para registrar pagos. El
pegado **solo guarda el equipo** de cada jugador de la convocatoria; no toca
quién jugó, los pagos, los puntos de exclusión ni los apuntados. Un nombre de un
jugador que no estaba en la convocatoria se queda como texto, sin equipo; uno que
no se reconoce o es ambiguo queda sin resolver (se elige un jugador de la
convocatoria para esa línea, sin registrar jugadores nuevos); un `X +1` no nombra
a nadie y se ignora. Volver a pegar sustituye los equipos anteriores. Antes de
marcar el partido como jugado se rechaza.

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
| Pegar los equipos          | no      | no     | sí         | sí     | no        |

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
es un ajuste (3,75 € salda la parte, sin saldo pendiente). Todo pago guarda su
**método** (Efectivo, Bizum u Otro), que el organizador elige al registrarlo
(Efectivo viene preseleccionado); los pagos anteriores a esta función dicen
Otro, y el método no se edita: se deshace el pago y se registra de nuevo. Deshacer un pago
devuelve la parte a deuda y borra la fecha de pago. Reabrir o cancelar el
partido conserva deudas y pagos, y volver a jugarlo no factura nada dos veces.

### Pago hecho por el sistema, a partir de un Bizum

Un pago también lo puede hacer el sistema, sin que nadie lo registre: cada 6 horas
(o cuando el organizador pulsa «Leer ahora») lee los ingresos de la cuenta y, de
cada Bizum entrante no procesado, aplica estas reglas **en orden**; la primera que
se cumple decide:

1. el mensaje contiene una palabra de la lista de exclusión: se descarta;
2. son más de siete partes: se descarta;
3. el remitente es un jugador conocido, pagó un número entero de partes y tiene
   deudas abiertas para cubrirlas: **paga esas partes**, las más cercanas a la fecha
   del Bizum primero;
4. el remitente es conocido, pagó un número entero de partes y debe menos: espera;
5. el mensaje contiene una palabra de la lista de inclusión: espera;
6. no es un número entero de partes: se descarta;
7. número entero de partes de un remitente que no se conoce (o que se confunde con
   otro jugador): espera.

Lo que se descarta no se guarda. Lo que espera queda en «Bizums en espera» hasta que
el organizador lo resuelva o aparezca la deuda. Cada Bizum se procesa **una sola
vez**, por la identificación del propio banco. El pago que deja el sistema tiene
método Bizum, la fecha en que llegó el dinero (no la del partido) y el enlace a su
Bizum; el importe que sobra de las partes pagadas se anota como «sin asignar».

Un Bizum que espera se vuelve a juzgar en tres momentos, siempre con las mismas
reglas pero **sin descartar nunca** (lo que ya se guardó no se borra en silencio):

- al **emparejar** a su remitente con un jugador, se juzgan todos los Bizums que
  esperan de ese remitente, el más antiguo primero;
- al **marcar un partido como jugado**, se juzgan los que esperan de su temporada y
  llevan fecha igual o posterior a la del partido, el más antiguo primero. Las deudas
  del partido ya existen, así que los que ahora cubren una deuda la pagan, en la
  misma operación que marca el partido. Si falla algo, el partido no queda jugado.
  Reabrir el partido no deshace esos pagos;
- cuando el organizador **dictamina** cuántas partes paga: se pagan las más cercanas
  (los partidos hasta la fecha del Bizum, el más reciente primero), nunca más de lo
  que cubre el Bizum, y lo que sobra queda sin asignar o se descarta, a elección del
  organizador. El dictamen no empareja al remitente.

Un Bizum puede llegar **antes** de los partidos que paga («3 furgol» el 2/9 para los
tres partidos siguientes). Las reglas no pagan nunca un partido posterior a la fecha
del Bizum, así que espera, pero «Bizums en espera» dice qué partidos posteriores debe
el jugador y el organizador puede dictaminar que se paguen: tras los partidos hasta la
fecha del Bizum van los posteriores, el más antiguo primero. Si el Bizum es más
grande que las deudas, lo que sobra se deja sin asignar o se descarta.

El organizador también puede **descartar** un Bizum que espera, para siempre: del
Bizum solo queda la identificación del banco y que se descartó. Uno ya pagado no se
descarta; antes se deshacen sus pagos.

Deshacer un pago hecho a partir de un Bizum **deshace todos los pagos de ese Bizum**
(aunque sean de varios partidos), en una sola operación; si alguno de esos partidos
ya no está jugado, no se deshace nada. El Bizum vuelve a «Bizums en espera» con sus
datos originales y el motivo «Se deshizo su pago»; puede volver a pagar solo si más
tarde las reglas, un emparejamiento o un partido jugado lo permiten, así que conviene
quitar el emparejamiento equivocado. Un pago hecho a mano se deshace como siempre.

Las deudas no pasan de una temporada a otra, ni por un Bizum ni por un dictamen: un
Bizum solo paga deudas de la temporada de su fecha.

## Equipos (opcional)

Con la convocatoria confirmada, o con el partido jugado, se pueden pegar los dos
equipos (`Claros` y `Oscuros`, en cualquier orden), así que se pueden declarar antes
de marcar el partido como jugado. Es un paso opcional: no hace falta para registrar pagos. El
pegado **solo guarda el equipo** de cada jugador de la convocatoria; no toca
quién jugó, los pagos, los puntos de exclusión ni los apuntados. Un nombre de un
jugador que no estaba en la convocatoria se queda como texto, sin equipo; uno que
no se reconoce o es ambiguo queda sin resolver (se elige un jugador de la
convocatoria para esa línea, sin registrar jugadores nuevos); un `X +1` no nombra
a nadie y se ignora. Volver a pegar sustituye los equipos anteriores. Antes de
confirmar la convocatoria se rechaza.

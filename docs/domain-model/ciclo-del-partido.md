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
temporada para una fecha, no se inventa: hay que crearla.

Un jugador no se «da de alta» en una temporada. Entra la primera vez que
aparece en un partido de ella; en ese momento se le pregunta cuántas temporadas
lleva (la sugerencia es la última que tenía registrada más una, o 0 si es
nuevo) y no se le vuelve a preguntar.

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
- `Anfitrión +1` es un acompañante anónimo.

La lista conserva el orden y un jugador repetido ocupa una sola línea; se puede
quitar un nombre o vaciarla. **Nada cuenta hasta pulsar «Guardar lista»**: al
guardar quedan apuntados los reconocidos y la lista sustituye a la anterior (lo
jugado y lo pagado se conservan). Las líneas sin resolver se guardan solo como
texto y se leen de nuevo contra los jugadores de ese momento, así que un apodo
registrado entretanto ya las reconoce. Registrar un jugador o un apodo no espera
al guardado.

## 2. Convocatoria

Es la predicción de quién juega. Con los habituales dentro de las plazas entran
todos y los invitados ocupan el resto por orden de llegada (el anónimo nunca se
guarda). Si los habituales se pasan, compiten todos por puntos con la mercy
rule. Confirmarla **no marca asistencia ni pagos**; solo guarda la selección
(congelada) y los puntos de exclusión. Para puntuar hace falta tener la
antigüedad capturada.

## 3. Lista final

Después del partido se pega la lista real, con sus dos equipos (`Claros` y
`Oscuros`, en cualquier orden, con la separación que cada uno ponga). **Es la
única fuente de quién jugó, de qué equipo y de cuánto debe cada uno**: cada
jugador paga su parte y un `+1` suma otra parte a quien lo trae. Puede discrepar
de la convocatoria, y manda.

Lo que la convocatoria dejó fuera y la lista final pone jugando pierde su punto
de exclusión; si una corrección posterior lo vuelve a dejar fuera, el punto
vuelve. La convocatoria guardada no se toca. Sin lista pegada se elige el
partido más reciente que aún no tiene la suya, y el de hoy solo cuenta a partir
de **una hora después del inicio**.

## Partidos del pasado

Un partido ya jugado se registra solo con su fecha: la temporada es la que la
contiene, se cobra al precio de **esa** temporada y la antigüedad se pregunta
respecto a ella. No tiene candidatos ni convocatoria; se rellena con su lista
final.

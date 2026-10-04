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

## Cuándo es el partido

El día y la hora del partido semanal se guardan **con versiones**: un cambio de
día es una fila nueva con su fecha de efecto, nunca una edición, así que las
semanas anteriores siguen resolviéndose como se resolvieron. Al pegar una lista
de candidatos, el partido es el siguiente día de juego a partir de hoy (hoy
mismo si hoy es día de partido); si aún no existe, se crea.

## 1. Candidatos

El organizador pega la lista de WhatsApp. Se limpia (números, viñetas, emojis,
espacios) y cada nombre se busca entre los jugadores y sus apodos, sin importar
mayúsculas ni tildes:

- Un nombre que encaja con **uno solo** queda apuntado.
- Uno que no encaja con nadie, o que encaja con **varios**, se queda «sin
  resolver» y no se apunta a nadie hasta que el organizador decide: elegir al
  jugador, elegirlo y recordar el apodo, o registrar a uno nuevo. Nunca se
  adivina.
- Lo que hay bajo un encabezado `Reservas` se descarta.
- `Nombre (Anfitrión)` es un invitado nombrado; `Anfitrión +1`, un acompañante
  anónimo. Al registrar a alguien nuevo se guarda quién lo presentó.

Pegar de nuevo la lista **sustituye** a la anterior: quien ya no aparece deja de
estar apuntado.

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

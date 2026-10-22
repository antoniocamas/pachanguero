# Glosario

## Jugón

Un jugador. Es la palabra que usa la hoja (`Jugón` es la cabecera de la columna A
en `Puntos` y `Convocatoria`).

## Temporada

De septiembre a julio, un partido por semana los miércoles. La temporada
2024/2025 tuvo **48 columnas de fecha** (4/09/2024 → 23/07/2025) de las cuales
**38 fueron partidos jugados**; el resto quedaron a 0 (Navidad, Semana Santa,
verano).

## Convocatoria

La lista de quién **debería** jugar esta semana. Se genera a partir de los
candidatos; los fijos van siempre antes que los invitados (ver
[`convocatoria.md`](convocatoria.md)). Es una predicción: no
dice quién jugó de verdad (eso es la [convocatoria final](#convocatoria-final)).

## Estados de un partido

Abierto, Convocatoria creada, Convocatoria confirmada, Jugado y Cancelado.

- **Abierto**: se apuntan candidatos y aún no hay convocatoria.
- **Convocatoria creada**: hay una selección guardada, provisional.
- **Convocatoria confirmada**: el organizador la da por buena; es la que se
  marca como jugada.
- **Jugado**: el partido se jugó; se puede reabrir.
- **Cancelado**: no se juega. Recuerda el estado en que estaba y deshacer la
  cancelación vuelve a él.

El orden y lo que permite cada estado están en
[`ciclo-del-partido.md`](ciclo-del-partido.md).

## Cambiado a mano

Una fila de la convocatoria cuyo estado actual (dentro o fuera de los 14)
difiere de lo que eligió el algoritmo, porque el organizador la corrigió. El
resultado original del algoritmo se conserva.

## Convocatoria final

Lo que ocurrió de verdad en el partido: la lista pegada después del partido, con
los dos equipos. Es la única fuente de quién jugó, quién pagó y cuánto. Puede
diferir de la convocatoria (alguien no vino, entró un suplente). Si un excluido
por puntos aparece jugando, su punto de exclusión se retira; si una corrección
posterior lo vuelve a dejar fuera, vuelve. La convocatoria guardada no se
reescribe nunca.

## Claros y Oscuros

Los dos equipos del partido, tal como encabezan la lista de equipos que se pega
después de jugar (`Claros` y `Oscuros`, en cualquier orden). Solo se guardan para mostrarlos: no influyen en
puntos, selección ni pagos.

## Los 14

7 contra 7. El corte. Posiciones 1–14 juegan, 15 en adelante se quedan fuera.

## Mercy seat

Plaza reservada para alguien que lleva tiempo sin jugar, aunque no le den los
puntos. El número de plazas es configurable (`NUMBER_OF_MERCY_SEATS`, hoy **1**).
Para que entre uno, sale otro.

- **Promotee** — el que entra por la mercy rule.
- **Demotee** — el que sale para hacerle sitio.

## Candidato

Quien se ha apuntado a un partido, en la lista de candidatos (pegada de WhatsApp
o escrita a mano), antes de la convocatoria. Se guarda como `signed_up` y no
implica que vaya a jugar. Cómo se arma y se guarda la lista:
[ciclo del partido](ciclo-del-partido.md#1-candidatos).

## Reserva

No es un concepto del modelo. Si la lista pegada tiene un encabezado
`Reservas`, ese encabezado y todo lo que viene debajo se descarta: no son
candidatos ni nombres pendientes de resolver.

## Fijo e invitado

Lo que es cada jugador **en una temporada**. Un **fijo** compite por puntos y
nunca es invitado, aunque la lista lo escriba con un anfitrión. Un **invitado**
entra por orden de llegada y siempre viene con alguien. El papel se guarda la
primera vez que una lista guardada coloca al jugador en la temporada, o cuando el
organizador lo cambia; mientras no hay ninguno, vale el de su última temporada
anterior, y si no tiene, es invitado quien entró presentado por alguien y fijo el
resto. Quien ya ha jugado como fijo en la temporada no puede pasar a invitado en
ella.

## Invitado nombrado

Un invitado con nombre, escrito como `Adri (David)`: el nombre y, entre
paréntesis, quien lo trae. La primera vez se registra como jugador normal, con el
vínculo a quien lo presentó. En cada partido su anfitrión es el del paréntesis; si
la línea no lo trae, su **anfitrión habitual**, y si no tiene, quien lo presentó.
Sin ninguno, la línea queda sin resolver hasta que el organizador dice quién lo
trae (o lo hace fijo). Junto a su nombre se muestra siempre «de David» en la
lista, la convocatoria y los equipos.

## Anfitrión habitual

Quien suele traer a un invitado; puede tener varios y el primero es el habitual.
Cada anfitrión con el que una lista guardada trae al invitado se añade; el
organizador los añade, quita y reordena en su ficha de Jugones.

## Invitado anónimo

Acompañante sin nombre, escrito como `Álvaro +1`. No es un jugador registrado:
solo existe como plaza ligada a quien lo trae (quien sí queda apuntado). Compite
por orden de llegada igual que un invitado nombrado.

## Deuda

Una **parte** (4 € por cabeza) que queda por pagar de un partido jugado. Tiene un
**titular**, que responde de ella, y un **beneficiario**, de quien es la parte:
el anfitrión responde por sus `+1` y por sus invitados con nombre; si no, el propio
jugador. El organizador puede pasar la deuda de un jugador con nombre a otro
titular; la de un `+1` es siempre de su anfitrión. Pueden pagarla el titular o el beneficiario, y el pago guarda quién lo hizo; otro
jugador solo con un Bizum suyo cuando el organizador lo dictamina (ver
[`ciclo-del-partido.md`](ciclo-del-partido.md#pago-hecho-por-el-sistema-a-partir-de-un-bizum)),
y la parte conserva su titular. Al pagarse deja de ser deuda y pasa a ser un
pago; la deuda de un titular cuenta cada parte una sola vez.

## Método de pago

Cómo se pagó una parte: **Efectivo**, **Bizum** u **Otro**. Todo pago lo guarda
(`payments.method`; se guarda en minúsculas y sin tilde: `efectivo`, `bizum`,
`otro`). El organizador lo elige al registrar el pago a mano, con Efectivo
preseleccionado; los pagos anteriores a esta función dicen Otro. No se edita: la
corrección es deshacer el pago y registrarlo otra vez.

## Bizum

Un ingreso en la cuenta del organizador hecho por Bizum: llega con un importe, la
fecha en que el banco lo apuntó, quien lo envía (un nombre abreviado, como
`Marta G.L.`, o un teléfono) y un mensaje. El sistema lo lee solo, una sola vez cada
uno, y lo descarta, lo guarda a la espera o paga con él las partes que cubre (ver
«Pago hecho por el sistema» en el ciclo del partido). Solo cuentan los Bizums
entrantes en la moneda leída y desde la fecha de inicio que fija el organizador.

## Bizums en espera

Los Bizums guardados que el sistema no pudo atribuir a deudas: remitente
desconocido o ambiguo, un mensaje de inclusión sin partes que pagar, un jugador sin
deudas todavía, o un importe que no cuadra con las deudas. Siguen ahí, sin caducar,
hasta que el organizador los resuelve o aparece la deuda; solo los ve el
organizador.

## Nombre de Bizum

Cómo aparece un jugador cuando paga por Bizum (`Jorge G.A.` para «Guti»): una
propiedad del jugador, distinta de sus alias al apuntarse. Un jugador puede tener
varios, porque el banco no siempre lo muestra igual (`ADAM RON B.` y `ADAM RON B.R.`).
Se añade al emparejar a un remitente con un jugador o a mano, sin sustituir los que ya
tiene, y se puede quitar uno a uno; los pagos ya hechos no cambian. Un remitente solo se reconoce por este nombre o por el teléfono del jugador,
nunca por parecido; un nombre de Bizum que tienen dos jugadores no identifica a
ninguno.

## Descartar

Dos cosas distintas. El sistema **descarta** un Bizum que no es para el grupo (con una
palabra de exclusión, de más de siete partes o que no es un número entero de partes):
no guarda nada de él. El organizador **descarta** un Bizum en espera para siempre: se
borran su remitente, mensaje e importe, y solo queda la identificación del banco para
no leerlo otra vez.

## Marcas de la hoja `Pagos`

Una celda por jugador y por semana:

| Marca           | Significado                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `4`             | Jugó y pagó sus 4 € — **vale 1 punto de asistencia**                   |
| `8`, `12`, `16` | Pagó por sí mismo y por invitados (múltiplos de 4 €)                   |
| `*`             | Apuntado a este partido / jugó pero **no ha pagado** — deuda, 0 puntos |
| vacío           | No se apuntó                                                           |

⚠️ **El `*` está sobrecargado y es el problema de diseño más profundo del sistema
original.** Significa a la vez «me apunto a este partido» (es lo que lee el
algoritmo para saber quién quiere jugar) y «jugué y te debo dinero». Cuando
alguien paga, el `*` se convierte en `4` y la deuda desaparece sin dejar rastro
de que llegó tarde. Ver [`legacy-spreadsheet.md`](legacy-spreadsheet.md).

El precio de la pista es **56 €** repartido entre 14 = **4 € por cabeza**.

## Marcas de la hoja `FueraDeConvocatoria`

| Marca | Significado                                                         | ¿Puntúa?                                  |
| ----- | ------------------------------------------------------------------- | ----------------------------------------- |
| `1`   | Te apuntaste y no entraste **por puntos**                           | Sí, +1                                    |
| `2`   | Te apuntaste, ibas dentro de los 14, y te **degradó la mercy rule** | Sí, +1                                    |
| `D`   | Te tocó el **mercy seat**: entraste                                 | No — jugaste, así que puntúas vía `Pagos` |

`1` y `2` son _códigos de motivo_, no un contador. El contador de partidos fuera
es implícito: se deriva contando marcas desde tu última `D`.

Verificado contra la temporada 2024/2025: la secuencia de Pablo es
`1,1,D,1,1,D,1,1,2`. Si el número fuese el contador, las segundas marcas serían
`2`. No lo son.

## Contador de espera

Número de partidos que llevas fuera desde tu último mercy seat. Determina si eres
candidato (hace falta ≥ 2) y en qué orden. **Atención**: la regla contada es que
una `D` lo pone a cero, pero el script implementado le resta 2. Ver
[`legacy-script-review.md`](legacy-script-review.md#1-d-no-resetea-el-contador).

## Antigüedad

Número de temporadas que llevas jugando. Se traduce a puntos mediante una curva
de rendimientos decrecientes documentada en [`points.md`](points.md).

## Usuario

Una cuenta para entrar en la aplicación. No es lo mismo que el **jugador**: el
jugador es quien juega y tiene puntos y deudas; el usuario es quien inicia
sesión. Un usuario normal pertenece a un jugador, y su nombre de usuario no es el
nombre del jugador. Solo el operador crea usuarios. Ver
[`users-and-roles.md`](../users-and-roles.md).

## Administrador

El rol del organizador: ve y hace todo. Un administrador puede ser además un
jugador.

## Jugador (usuario normal)

El rol de quien juega: solo ve sus propias deudas, pagos, estadísticas y datos
de contacto.

## Vista

Desde qué rol se está usando la aplicación: la de administrador o la de jugador.
Un administrador que también es jugador puede ver la aplicación como la ve su
jugador («Ver como jugador») y volver («Volver a administrador»); también puede ver la aplicación como cualquier otro jugador («Ver como otro jugador»), para resolver problemas, y queda registrado.

## Copia de seguridad

Un fichero con una copia consistente de toda la base de datos, usuarios
incluidos. Se hace a mano con `pachanguero-admin backup` y sola antes de cambiar
la estructura de la base de datos. Ver [`../backup_and_restore.md`](../backup_and_restore.md).

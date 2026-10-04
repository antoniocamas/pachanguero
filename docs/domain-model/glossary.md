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
candidatos: si los habituales caben en las plazas entran todos y los invitados
ocupan el resto por orden de llegada; si no caben, se ordena por puntos,
cogiendo los 14 primeros y luego aplicando la mercy rule. Es una predicción: no
dice quién jugó de verdad (eso es la [convocatoria final](#convocatoria-final)).

## Convocatoria final

Lo que ocurrió de verdad en el partido: la lista pegada después del partido, con
los dos equipos. Es la única fuente de quién jugó, quién pagó y cuánto. Puede
diferir de la convocatoria (alguien no vino, entró un suplente). Si un excluido
por puntos aparece jugando, su punto de exclusión se retira; si una corrección
posterior lo vuelve a dejar fuera, vuelve. La convocatoria guardada no se
reescribe nunca.

## Claros y Oscuros

Los dos equipos del partido, tal como encabezan la lista final (`Claros` y
`Oscuros`, en cualquier orden). Solo se guardan para mostrarlos: no influyen en
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

## Invitado nombrado (invitado ocasional)

Jugador nuevo que alguien trae a un partido, escrito como `Adri (David)`: el
nombre y, entre paréntesis, quien lo trae. Se registra como jugador normal, con
el vínculo a quien lo presentó, y en ese partido cuenta como invitado: no
compite por puntos sino por orden de llegada. No hay una marca permanente de
"ocasional"; es por partido. Si el nombre ya era un jugador conocido, la
anotación no cambia nada y entra como cualquier otro.

## Invitado anónimo

Acompañante sin nombre, escrito como `Álvaro +1`. No es un jugador registrado:
solo existe como plaza ligada a quien lo trae (quien sí queda apuntado). Compite
por orden de llegada igual que un invitado nombrado.

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

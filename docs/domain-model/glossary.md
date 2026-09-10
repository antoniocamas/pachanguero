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

La lista de quién juega esta semana. Se genera ordenando por puntos a los que se
han apuntado, cogiendo los 14 primeros y luego aplicando la mercy rule.

## Los 14

7 contra 7. El corte. Posiciones 1–14 juegan, 15 en adelante se quedan fuera.

## Mercy seat

Plaza reservada para alguien que lleva tiempo sin jugar, aunque no le den los
puntos. El número de plazas es configurable (`NUMBER_OF_MERCY_SEATS`, hoy **1**).
Para que entre uno, sale otro.

- **Promotee** — el que entra por la mercy rule.
- **Demotee** — el que sale para hacerle sitio.

## Marcas de la hoja `Pagos`

Una celda por jugador y por semana:

| Marca | Significado |
|---|---|
| `4` | Jugó y pagó sus 4 € — **vale 1 punto de asistencia** |
| `8`, `12`, `16` | Pagó por sí mismo y por invitados (múltiplos de 4 €) |
| `*` | Apuntado a este partido / jugó pero **no ha pagado** — deuda, 0 puntos |
| vacío | No se apuntó |

⚠️ **El `*` está sobrecargado y es el problema de diseño más profundo del sistema
original.** Significa a la vez «me apunto a este partido» (es lo que lee el
algoritmo para saber quién quiere jugar) y «jugué y te debo dinero». Cuando
alguien paga, el `*` se convierte en `4` y la deuda desaparece sin dejar rastro
de que llegó tarde. Ver [`legacy-spreadsheet.md`](legacy-spreadsheet.md).

El precio de la pista es **56 €** repartido entre 14 = **4 € por cabeza**.

## Marcas de la hoja `FueraDeConvocatoria`

| Marca | Significado | ¿Puntúa? |
|---|---|---|
| `1` | Te apuntaste y no entraste **por puntos** | Sí, +1 |
| `2` | Te apuntaste, ibas dentro de los 14, y te **degradó la mercy rule** | Sí, +1 |
| `D` | Te tocó el **mercy seat**: entraste | No — jugaste, así que puntúas vía `Pagos` |

`1` y `2` son *códigos de motivo*, no un contador. El contador de partidos fuera
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

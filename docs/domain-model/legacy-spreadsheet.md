# La hoja original

`Futbol_Miercoles_2024/2025`, ocho pestañas. Este documento existe para que se
entienda de dónde vienen los datos de `data/seed/` y por qué el modelo nuevo se
aparta de esta estructura en los puntos que se apartan.

## Pestañas

| # | Pestaña | Contenido |
|---|---|---|
| 1 | `Pagos` | Rejilla jugador × semana. La fuente de la verdad sobre pagos y apuntados |
| 2 | `Puntos` | Puntuación derivada, una fila por jugador |
| 3 | `FueraDeConvocatoria` | Rejilla jugador × semana con las marcas `1`/`2`/`D` |
| 4 | `Cara…` | Vacía en el PDF |
| 5 | `Aux` | La tabla de la curva de antigüedad |
| 6 | `Hoja 4` | Pruebas. Descartable |
| 7 | `Hoja 7` | Restos de una ejecución rota, `#N/A Not Found` |
| 8 | `Convocatoria` | Salida del algoritmo: quién juega el próximo partido |

## `Pagos`

Fila 1 fechas, fila 2 `Total`, fila 3 en adelante un jugador por fila. 48
columnas de fecha, 38 con partido.

El `Total` de una semana normal es **56 €** = 14 × 4 €. Semanas con otros totales
(48, 52, 51,75, 36) son partidos con menos gente o con algún ajuste. Las semanas
a `0` no se jugaron.

### El problema del `*`

`*` significa tres cosas a la vez:

1. **«Me apunto a este partido».** Es literalmente lo que lee el algoritmo:
   `filterNamesWithAsterisk` coge la última columna con datos y trata cada `*`
   como una inscripción.
2. **«Jugué y no he pagado».** Deuda de 4 €.
3. **«No puntúo todavía».** `COUNTIFS(">0")` lo excluye.

Cuando pagas, el `*` se sobrescribe con `4`. En ese momento se pierde toda huella
de que el pago llegó tarde: no queda fecha de pago, ni de que hubo deuda. Por eso
**el histórico no permite reconstruir lo que el algoritmo vio** en su momento —
un `4` de octubre pudo entrar en diciembre.

Es el motivo principal por el que el modelo nuevo separa tres conceptos que aquí
comparten celda: `signup` (me apunto), `attendance` (jugué) y `payment` (pagué,
con fecha).

### Cómo se reconstruyó

El PDF exporta la rejilla con las celdas vacías colapsadas, así que el texto
plano no sirve: hay que recuperar las columnas por coordenadas. Los números van
alineados a la derecha y los `*` centrados, lo que obliga a tratarlos por
separado o se solapan y se pierde una celda por fila afectada.

Validado por dos vías independientes, ambas sin discrepancias:

- el recuento de partidos de cada jugador coincide con su columna `Asistencia`
- cada columna semanal suma exactamente su fila `Total`

El resultado está en `data/seed/pagos.csv`.

## `FueraDeConvocatoria`

Misma forma que `Pagos` pero **47 columnas de fecha**: le falta la columna `Bis`
que `Pagos` tiene tras el 12/03. Cualquier código que recorra ambas por índice de
columna se desalinea a partir del 19/03.

En `data/seed/fueradeconvocatoria.csv`.

## `Puntos`

Una fila por jugador. Todo derivado salvo `# Temporadas`, que se escribe a mano.

```
B  Puntos              = C + D + E
C  Asistencia          = COUNTIFS(Pagos!B3:AAA3; ">0")
D  Fuera Convocatoria  = COUNTIFS(FueraDeConvocatoria!B3:ZZ3; ">0")
E  Puntos Antigüedad   = IF(ISBLANK(F3); ""; INDIRECT("Aux!D" & F3))
F  # Temporadas        (a mano)
G  2023/2024           (a mano, del histórico)
H  2024/2025           = COUNTIF(Pagos!B3:AZ3;"<>0") / COUNTIF(Pagos!$B$2:$AZ$2;"<>0")
```

**Caro tiene la antigüedad rota**: con `# Temporadas = 13` la fórmula da
7,308813655, como Antonio C, Álvaro B y Miguel. Su celda dice **12,30881365**,
exactamente 5 de más. La fórmula está pisada a mano. Le sube el total de 26,3 a
31,3 y la mueve de ~9ª a 6ª.

## `Aux`

La curva de antigüedad como tabla: columna A el índice de temporada, B `X+2`, C
el aporte `1/(LN(X+2)/LN(3))`, D el acumulado. Se consulta con `INDIRECT` sobre
el número de fila, que es tan frágil como suena.

En el sistema nuevo es una función. Ver [`points.md`](points.md).

## `Convocatoria`

La salida. `Jugón`, `Puntos`, `Posición`. Las 14 primeras filas juegan; de la 15
en adelante se pintan en gris. El promotee sale en rojo claro y el demotee en
amarillo.

La instantánea que quedó en la hoja es de **antes de registrar el 18/06**: los 15
apuntados con `*`, y sus puntos exactamente 1 por debajo de los de `Puntos` para
los 9 que luego pagaron, e idénticos para los 6 que se quedaron en `*`. Es la
demostración más limpia de todo el sistema: pagar da el punto.

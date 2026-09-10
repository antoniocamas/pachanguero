# Calidad de los datos 2024/2025

> «This is as imperfect as the human nature.» — el organizador

La hoja se mantiene a mano y los pagos llegan tarde. Estas anomalías están
documentadas para que nadie las trate como reglas al leer el histórico, y para
justificar por qué el modelo nuevo separa apuntarse, jugar y pagar.

## Ruido humano — no perseguir

**`D` sin su `2`** (13/11 Facu, 8/01 Pablo, 12/03 Pablo Silvage). Si una
promoción siempre desplaza a alguien, debería haber una degradación registrada.

**`2` sin su `D`** (15/01 Emma, 5/02 Pablo Tri, 12/02 Alberto, 5/03 Víctor,
19/03 Fer, 26/03 Nacho).

**Doble `D` el 29/01** (Iker y Pablo Silvage) contra un solo `2`. Compatible con
haber corrido esa semana con `SEATS = 2`.

**Marcado fuera pero pagó esa semana**: Emma con `1` el 6/11 e Iker con `2` el
30/10 tienen ambos un `4` en `Pagos` el mismo día.

De 15 semanas con marcas, 5 emparejan limpiamente promoción con degradación. El
resto es entrada manual.

## Probablemente errores reales

**La antigüedad de Caro**: 12,30881365 donde la fórmula da 7,308813655.
Exactamente 5 de más, con la fórmula pisada a mano. Le sube el total de 26,3 a
31,3. Ver [`legacy-spreadsheet.md`](legacy-spreadsheet.md#puntos).

**`Hoja 7`**, llena de `#N/A Not Found`: casi seguro el resultado de ejecutar el
algoritmo con un jugador apuntado que no existía en `Puntos`, o con 0 puntos. Ver
[`legacy-script-review.md`](legacy-script-review.md#2-0--not-found--un-jugador-con-0-puntos-rompe-el-orden).

## Estructural

**`FueraDeConvocatoria` tiene 47 columnas de fecha y `Pagos` 48.** `Pagos` tiene
una columna `Bis` extra tras el 12/03 (un partido repetido). Recorrer las dos por
índice de columna se desalinea a partir del 19/03.

## Lo que sí está limpio

La rejilla de `Pagos` reconstruida desde el PDF cuadra con la hoja por dos vías
independientes: el recuento por jugador coincide con `Asistencia` en las 36
filas, y cada columna semanal suma su `Total`. Cero discrepancias. Los datos de
pagos son fiables; lo que no es fiable es *cuándo* se registró cada uno.

## Consecuencia para el sistema nuevo

**No se puede reproducir una convocatoria histórica.** Los puntos que ve el
algoritmo dependen de qué estaba pagado esa noche, y eso no se guardó.

El modelo nuevo lo arregla guardando `paid_on` por separado de la fecha del
partido, y persistiendo cada convocatoria calculada con sus puntos. Cualquier
convocatoria futura será auditable aunque los pagos sigan llegando tarde.

# Puntos

```
Puntos = Asistencia + FueraDeConvocatoria + Antigüedad
```

Verificado contra las 36 filas de la pestaña `Puntos` de 2024/2025: cuadra en
todas.

## 1. Asistencia — pagar, no asistir

**1 punto por cada partido pagado.**

La fórmula original:

```
=COUNTIFS(Pagos!B3:AAA3; ">0")
```

Cuenta celdas con valor numérico positivo, es decir los `4` (y los `8`/`12`/`16`
de quien paga invitados, que **también cuentan como 1**, no como 2 o 4 — pagar
por un amigo no te da más puntos).

El `*` **no** puntúa: `">0"` lo excluye porque es texto. Esto es intencionado.
Fuiste al partido pero no pagaste, así que no hay punto hasta que pagues.

> **Los puntos se mueven hacia atrás en el tiempo.** Si pagas tres partidos de
> golpe en diciembre, esos tres puntos aparecen con fecha de octubre pero no
> existían cuando se corrió el algoritmo en octubre. La hoja registra *lo que se
> acabó pagando*, no *lo que el algoritmo vio esa noche*. Consecuencia práctica:
> **no se puede reproducir una convocatoria histórica** a partir de los datos
> finales. El sistema nuevo debe guardar la fecha de pago para no heredar esto.

## 2. Fuera de convocatoria — esperar

**1 punto por cada semana que te apuntaste y no jugaste**, sea cual sea el
motivo.

```
=COUNTIFS(FueraDeConvocatoria!B3:ZZ3; ">0")
```

Cuenta los `1` (fuera por puntos) y los `2` (degradado por la mercy rule). Las
`D` no cuentan: son texto, y además si te tocó el mercy seat jugaste, así que tu
punto sale de `Pagos`.

Que ambos motivos valgan lo mismo es deliberado: da igual por qué te quedaste
fuera, el sistema te compensa igual.

## 3. Antigüedad — veteranía con rendimientos decrecientes

Cada temporada aporta:

```
aporte(n) = 1 / (ln(n + 2) / ln(3))
```

y los puntos de antigüedad son la **suma acumulada** de los aportes de todas tus
temporadas. La primera temporada vale exactamente 1,0 y a partir de ahí cada una
vale menos:

| Temporadas | Aporte de esa temporada | Acumulado |
|---:|---:|---:|
| 1 | 1,0000000000 | 1,000000000 |
| 2 | 0,7924812504 | 1,792481250 |
| 3 | 0,6826061945 | 2,475087445 |
| 4 | 0,6131471928 | 3,088234638 |
| 5 | 0,5645750341 | 3,652809672 |
| 6 | 0,5283208336 | 4,181130505 |
| 7 | 0,5000000000 | 4,681130505 |
| 8 | 0,4771212547 | 5,158251760 |
| 9 | 0,4581569100 | 5,616408670 |
| 10 | 0,4421141087 | 6,058522779 |
| 11 | 0,4283173410 | 6,486840120 |
| 12 | 0,4162896639 | 6,903129784 |
| 13 | 0,4056838711 | 7,308813655 |

Trece temporadas dan 7,31 puntos, no 13. Un veterano arranca por delante pero la
ventaja se aplana, así que la asistencia reciente acaba pesando más.

En la hoja esto vivía en la pestaña `Aux` y se consultaba con:

```
=IF(ISBLANK(F3); ""; INDIRECT("Aux!D" & F3))
```

`INDIRECT` sobre un número de fila es frágil: si alguien inserta una fila en
`Aux`, todas las antigüedades cambian en silencio. En el sistema nuevo la curva
es una función, no una tabla.

## Lo que *no* es un punto

La columna `2024/2025` de la pestaña `Puntos` es:

```
=COUNTIF(Pagos!B3:AZ3; "<>0") / COUNTIF(Pagos!$B$2:$AZ$2; "<>0")
```

`"<>0"` **sí** cuenta los `*`, al contrario que `Asistencia`. El denominador son
los partidos realmente jugados (38 en 2024/2025). Así que esa columna es
**«% de partidos a los que te apuntaste»**, no «% de asistencia» ni «% de puntos».
Son tres cosas distintas y sólo la primera es lo que mide. No es un bug, pero el
nombre engaña: seis jugadores (Emma, Jorge G, Moran, Alberto, Caro, Adri) tienen
un `*` que hace que su porcentaje vaya un partido por delante de su asistencia, y
Tave aparece con 2,63 % teniendo 0 puntos de asistencia.

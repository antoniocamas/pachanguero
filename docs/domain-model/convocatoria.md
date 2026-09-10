# El algoritmo de convocatoria

Se ejecuta cuando se apuntan **más de 14** jugadores a un partido. Con 14 o menos
juegan todos y no hay nada que decidir.

## Parámetros

| Parámetro | Valor actual | Qué controla |
|---|---:|---|
| `SEATS` (`NUMBER_OF_MERCY_SEATS`) | 1 | Cuántas plazas se reservan a la mercy rule |
| `GAMES_OUT_FOR_MERCY` (`GAMES_OUT_4_MERCY`) | 2 | Partidos fuera necesarios para ser candidato |
| `DEMOTION_DIRECTION` | `bottom-up` | Si se degrada empezando por el 14º o por el 1º |
| `D_RESETS_COUNTER` | `false` | Si una `D` pone el contador a 0 o le resta `GAMES_OUT_FOR_MERCY` |

Los dos primeros existen en el Apps Script. Los dos últimos **no**: la dirección
está hardcodeada a `bottom-up` y el reseteo está hardcodeado a «restar 2», aunque
la regla contada es «poner a cero». Ver
[`legacy-script-review.md`](legacy-script-review.md).

## Pasos

### 1. Reunir a los apuntados

En la hoja, los apuntados son quienes tienen `*` en la **última columna con
datos** de `Pagos`. En el sistema nuevo es una tabla de inscripciones explícita.

### 2. Ordenar por puntos, descendente

Los 14 primeros están dentro provisionalmente, del 15 en adelante fuera.

### 3. Elegir candidatos a mercy seat

Un jugador es candidato si cumple **las dos**:

- está **por debajo del corte** (posición ≥ 15), y
- su **contador de espera ≥ `GAMES_OUT_FOR_MERCY`** (≥ 2)

El contador es la suma sobre todo su historial de la temporada:

```
marca '1' → +1        (fuera por puntos)
marca '2' → +1        (degradado)
marca 'D' → reset a 0   ← regla contada
          → −2          ← lo que hace el script
```

### 4. Elegir el promotee

Entre los candidatos se ordena por, en este orden:

1. **Contador descendente** — el que lleva más tiempo esperando, primero.
2. **Número de `D` ascendente** — a igualdad, el que menos mercy seats ha
   recibido en la temporada.
3. **Posición ascendente** — a igualdad, el que más puntos tiene.

Se cogen los `SEATS` primeros.

Si no hay candidatos, **no hay mercy rule esta semana**: juegan los 14 primeros
por puntos y ya.

### 5. Elegir el demotee

Entre los **14 de dentro**, se ordena por:

1. **Número de `2` ascendente** — quien nunca ha sido degradado esta temporada va
   primero.
2. **Posición descendente** (`bottom-up`) — a igualdad, el peor clasificado de los
   14, es decir el 14º.

Se cogen los `SEATS` primeros.

> Es una **preferencia, no una exclusión**. Si todos los 14 ya han sido degradados
> alguna vez, degradará a alguien por segunda vez en lugar de fallar. Es el
> comportamiento correcto, pero no es literalmente «si ya te han degradado, se
> elige al siguiente».

### 6. Intercambiar y marcar

Promotee y demotee se intercambian de posición en la lista. Después:

| Jugador | Marca en `FueraDeConvocatoria` |
|---|---|
| Promotee | `D` |
| Demotee | `2` |
| Resto de los que quedan fuera | `1` |

## Verificación contra 2024/2025

Las reglas se han contrastado con las 10 mercy seats de la temporada:

**Elegibilidad (contador ≥ 2)** — 10 de 10 correctas, ninguna concedida por
debajo del umbral.

**Desempate (contador más alto gana)** — 9 de 10. La excepción es el 29/01, que
concedió **dos** `D` (Pablo Silvage con contador 3 e Iker con 2) contra un solo
`2`. Consistente con haber corrido esa semana con `SEATS = 2`.

**«Nunca degradado dos veces»** — 12 jugadores llevan un `2`, **ninguno lleva
dos**. La huella del criterio de ordenación es perfecta.

Las trazas por jugador:

```
Nacho           1→1  1→2  D[cont=2 ✓]→0  2→1
Emma            1→1  2→2  D[cont=2 ✓]→0  1→1  1→2
Iker            2→1  1→2  D[cont=2 ✓]→0  1→1  1→2
Facu            1→1  1→2  D[cont=2 ✓]→0  1→1  1→2
Pablo           1→1  1→2  D[cont=2 ✓]→0  1→1  1→2  D[cont=2 ✓]→0  1→1  1→2  2→3
Alex            1→1  1→2  D[cont=2 ✓]→0  1→1  1→2  1→3  D[cont=3 ✓]→0
Pablo Silvage   1→1  1→2  1→3  D[cont=3 ✓]→0  1→1  1→2  1→3  D[cont=3 ✓]→0
```

## Un detalle sobre la lista resultante

Tras el intercambio la lista **ya no está ordenada por puntos**: el promotee
ocupa el hueco del demotee con sus propios puntos, más bajos. Es intencionado —
lo que importa es quién está en las 14 primeras filas, no que la columna de
puntos sea monótona. La hoja lo pintaba: promotee en rojo claro, demotee en
amarillo, y de la fila 15 en adelante en gris.

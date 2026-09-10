# Revisión del Apps Script original

Bugs encontrados en `createAndSortConvocatoria` y sus funciones auxiliares,
ordenados por impacto. Cada uno indica si el sistema nuevo lo reproduce o lo
corrige.

---

## 1. `D` no resetea el contador

**Severidad: alta. Cambia quién juega.**

La regla contada es que un mercy seat pone tu contador de espera a cero. El
código hace otra cosa:

```js
} else if (value === 'D') {
  return accumulator - GAMES_OUT_4_MERCY;   // resta 2, no resetea
}
```

Si esperaste exactamente 2 partidos antes de tu plaza, restar 2 y resetear
coinciden. Si esperaste **3 o más**, te queda un remanente que arrastras a la
siguiente ronda.

Contra los datos de 2024/2025:

| Jugador | Script (`D` = −2) | Regla (`D` = reset) | ¿Elegible? |
|---|---:|---:|---|
| Pablo Silvage | 2 | 0 | **SÍ** / no |
| Alex | 1 | 0 | no / no |

La secuencia de Pablo Silvage es `1,1,1,D,1,1,1,D`. Cada tanda de tres
exclusiones sólo ve canceladas dos, así que arrastra `+1` dos veces y acaba en
**2** — que es `> GAMES_OUT_4_MERCY - 1`, o sea elegible ahora mismo sin haberse
quedado fuera ni una vez desde su última plaza.

Sólo afecta a quien espera 3+ partidos antes de entrar, que es por lo que ha
pasado desapercibido.

**Estado**: reproducido por defecto (`D_RESETS_COUNTER = false`), corregible con
un flag. Pendiente de decisión del organizador.

---

## 2. `0 || "Not Found"` — un jugador con 0 puntos rompe el orden

**Severidad: alta. Puede descolocar la convocatoria entera.**

```js
return namesWithAsterisk.map(name => [name, puntosMap.get(name) || "Not Found"]);
```

`0` es falsy, así que un jugador con exactamente 0 puntos se trata como
inexistente. En 2024/2025 **Tave** y **España** tienen 0 puntos *y* un `*` en
`Pagos`.

El daño real viene después. Ese string entra en el comparador:

```js
convocatoriaData.sort((a, b) => b[1] - a[1]);
```

`"Not Found"` produce `NaN`, el comparador devuelve `NaN`, y el orden resultante
queda **indefinido para toda la lista** — no sólo para esa fila. Un solo nombre
desconocido o con 0 puntos puede descolocar la convocatoria completa.

La pestaña `Hoja 7` de la hoja original, llena de `#N/A Not Found`, es
probablemente el fósil de una ejecución así.

**Estado**: corregido. Un jugador sin puntuación registrada entra con 0 y se
señala en la UI; nunca se mete un valor no numérico en el orden.

---

## 3. La dirección de degradación no es configurable

**Severidad: media. Funcionalidad descrita que no existe.**

La intención es alternar por temporadas entre degradar de arriba abajo y de abajo
arriba. El código sólo sabe hacer una:

```js
// Criterion 2: Sort by position in convocatoriaData (descending)
return b.position - a.position;
```

Siempre `bottom-up`. No hay flag.

**Estado**: implementado como parámetro de temporada (`demotion_direction`).

---

## 4. `GAMES_OUT_4_MERCY` hace dos trabajos

**Severidad: media. Trampa de mantenimiento.**

La misma constante es el **umbral de elegibilidad**:

```js
if (sum > GAMES_OUT_4_MERCY - 1) { ... }
```

y la **cantidad que resta una `D`**:

```js
return accumulator - GAMES_OUT_4_MERCY;
```

Son cosas sin relación. Subir el umbral a 3 cambia en silencio la semántica del
reseteo.

**Estado**: separadas. Con el bug 1 corregido, la segunda desaparece.

---

## 5. `NUMBER_OF_MERCY_SEATS > 1` está a medias

**Severidad: media. Ya ocurrió en producción** — el 29/01 corrió con 2 plazas.

Dos sitios asumen una sola:

```js
formatConvocatoria(sheet, len, result.promoteeIndex, result.demoteeIndex);
// ...donde promoteeIndex = swappedIndexes.promoteesIndex[0]
```

Sólo se colorea el primer par. Y en `swapPromoteesAndDemotees` los índices se
recogen recorriendo el array por posición, no por prioridad:

```js
for (let i = 0; i < convocatoriaData.length; i++) { ... }
```

así que `promoteesIndex[i]` no se corresponde con el i-ésimo promotee por
prioridad. El **conjunto** de 14 sale bien; las posiciones mostradas y el
coloreado, no.

**Estado**: corregido. `SEATS` es un parámetro de temporada y los emparejamientos
mantienen el orden de prioridad.

---

## 6. Comparaciones estrictas contra números

**Severidad: baja, pero probable en una hoja escrita a mano.**

```js
if (value === 1) { ... } else if (value === 2) { ... }
values.filter(value => value === 2)
```

Si una celda acaba guardada como texto — un apóstrofo delante, un pegado desde
otro sitio — deja de contar en silencio. No hay error, sólo un contador que va
bajo y un jugador que no entra cuando le tocaba.

**Estado**: corregido. Los valores se normalizan al leerlos.

---

## 7. Menores

- `applyMercyRule` calcula `lastColumnWithData` y no lo usa nunca.
- `fueraMap`, `candidates`, `promotees`, `demotees` y `sortedCandidates` se
  asignan sin `const`/`let`: son globales implícitas.
- `INDIRECT("Aux!D" & F3)` para la antigüedad rompe si alguien inserta una fila
  en `Aux`, sin avisar.
- La pestaña `FueraDeConvocatoria` tiene 47 columnas de fecha y `Pagos` 48
  (`Pagos` tiene una columna extra `Bis` tras el 12/03). El script se salva
  porque aplana los valores no vacíos e ignora las fechas — pero por eso mismo
  no puede saber *cuándo* pasó nada, y cualquier código que recorra ambas hojas
  por índice de columna se desalinea a partir del 19/03.

---

## Lo que no es un bug

- Que `Asistencia` use `">0"` y el porcentaje `"<>0"` es intencionado; miden
  cosas distintas. Ver [`points.md`](points.md#lo-que-no-es-un-punto).
- Que `selectDemotees` ordene por número de `2` en vez de excluir a los ya
  degradados es más robusto que la regla literal: degrada por segunda vez antes
  que fallar.
- Que la lista final no quede ordenada por puntos tras el intercambio es
  deliberado.

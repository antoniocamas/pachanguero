# Modelo de dominio — Pachanguero

Fútbol 7 de los miércoles. Este directorio documenta las reglas del sistema tal y
como funcionaban en la hoja de cálculo `Futbol_Miercoles_2024/2025` y su Apps
Script, que es de donde viene todo esto.

## Índice

| Documento | Contenido |
|---|---|
| [`glossary.md`](glossary.md) | Vocabulario: jugón, convocatoria, mercy seat, `*`, `1`/`2`/`D` |
| [`points.md`](points.md) | Cómo se calculan los puntos (asistencia, fuera de convocatoria, antigüedad) |
| [`convocatoria.md`](convocatoria.md) | El algoritmo de selección: los 14, la mercy rule, promoción y degradación |
| [`legacy-spreadsheet.md`](legacy-spreadsheet.md) | Estructura de las pestañas originales y sus trampas |
| [`legacy-script-review.md`](legacy-script-review.md) | Revisión del Apps Script: bugs encontrados y su impacto |
| [`data-quality.md`](data-quality.md) | Anomalías en los datos de 2024/2025 y qué se hizo con ellas |

## Resumen en una página

El partido es **7 contra 7**, así que juegan **14**. Los jugadores se apuntan
semana a semana. Cuando se apuntan más de 14, hay que decidir quién juega, y esa
decisión se toma por **puntos**.

Los puntos premian dos cosas distintas:

1. **Pagar.** Cada partido que pagas vale 1 punto. No es asistencia — es pago.
2. **Quedarte fuera.** Cada semana que te apuntas y no entras vale 1 punto.

Más un tercer componente, la **antigüedad**, que da ventaja a los veteranos pero
con rendimientos decrecientes, para que no bloqueen la pista indefinidamente.

```
Puntos = Asistencia + FueraDeConvocatoria + Antigüedad
```

El sistema se autoequilibra: si juegas mucho acumulas puntos por pagar, pero los
que se quedan fuera acumulan puntos por esperar, y acaban adelantándote.

Encima de eso hay una válvula de escape, la **mercy rule**: un número
configurable de plazas (hoy 1) se reservan para gente que lleva al menos 2
partidos seguidos sin entrar, aunque tengan menos puntos. Para hacerles sitio se
degrada a alguien de los 14, priorizando a quien nunca ha sido degradado esta
temporada.

## Estado de esta documentación

Escrita a partir de tres fuentes, en este orden de autoridad:

1. **El Apps Script** (`createAndSortConvocatoria` y compañía) — la verdad sobre
   lo que el sistema *hace*.
2. **Lo que cuenta el organizador** — la verdad sobre lo que el sistema *debería*
   hacer. Donde las dos discrepan está documentado en
   [`legacy-script-review.md`](legacy-script-review.md).
3. **Los datos de la temporada 2024/2025**, reconstruidos desde el PDF de la hoja
   y validados celda a celda (ver [`data-quality.md`](data-quality.md)).

Donde una regla se ha verificado contra los datos reales de la temporada, se dice
explícitamente y con los números.

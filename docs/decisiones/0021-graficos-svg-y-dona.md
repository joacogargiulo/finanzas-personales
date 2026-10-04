# ADR 0021 — Gráficos con SVG propio y donas con "Otras"

- **Estado:** aceptada
- **Fecha:** 2026-10-04
- **Fase:** 4 (estadísticas y buscador)
- **Modifica:** SRS 6.5

## Contexto
Estadísticas (SRS 6.5) muestra tres gráficos: barras de ingresos y gastos por mes, y tortas de gastos e ingresos por categoría. El lienzo de diseño no tenía esta pantalla, así que hubo que decidir dos cosas:
- **Con qué se dibujan los gráficos.** La app funciona sin conexión, tiene tema claro y oscuro, y el APK se descarga con datos móviles: el peso importa.
- **Qué forma tienen los gráficos por categoría.** Una torta con muchas porciones finitas no se lee, y los colores de categoría los elige el usuario, así que dos categorías pueden tener el mismo color.

## Alternativas
**Con qué se dibujan**
1. **Una librería (Recharts, por ejemplo).** Trae tooltips, animaciones y ejes listos. Suma unos 100 KB comprimidos, cuesta adaptarla a los tokens de color y a la accesibilidad, y oculta cómo se arma un gráfico.
2. **SVG propio.** Rectángulos para las barras y `<path>` para los arcos. Pesa casi nada y usa los colores del tema (`var(--inc)`, `var(--cat-*)`) sin trabajo extra. Hay que escribir la geometría.

**Forma de los gráficos por categoría**
1. **Torta clásica**, como pedía el SRS.
2. **Dona más lista.** Una torta con un agujero que muestra el total en el centro y, debajo, una lista con ícono, nombre, monto y porcentaje.
3. **Barras horizontales** ordenadas. Son lo más fácil de comparar, pero se apartan más del SRS.

## Decisión
El dueño eligió **SVG propio** y **dona más lista**:
- La geometría está en funciones puras (`src/ui/charts.ts`, con tests): `niceScale` elige un tope "redondo" para el eje (1, 2, 2,5 o 5 por una potencia de 10), `barLayout` reparte las barras, `donutSegments` arma el `d` de cada arco y `labelStep` decide cada cuántos meses escribir la etiqueta. Los componentes (`MonthlyBars`, `CategoryDonut`) solo dibujan.
- El SVG de las barras se dibuja al ancho real del contenedor (`ResizeObserver`), así el texto del eje no se estira.
- **"Otras":** con más de 5 categorías quedan las 4 más grandes y el resto se suma en una entrada "Otras" (`groupSmallCategories` en `src/domain/stats.ts`). Su ID es `__other__`, que Firestore reserva, así que nunca coincide con una categoría real.
- **Accesibilidad:** los SVG son decorativos (`aria-hidden`). La lista de cada dona y una tabla oculta para lectores de pantalla dan los mismos datos en texto, así el color nunca es la única forma de leer el gráfico. Los meses del gráfico de barras son botones: tocar uno muestra sus montos.
- **Selector de moneda:** muestra solo las monedas que tienen alguna cuenta, archivadas incluidas.
- Tocar una categoría no hace nada por ahora. Llevar a Movimientos con ese filtro queda como idea para más adelante.

## Consecuencias
- No se agrega ninguna dependencia.
- La geometría tiene tests unitarios, la pantalla tiene tests con Testing Library y hay un flujo e2e que carga movimientos y los ve en los gráficos.
- El SRS 6.5 cambia "torta" por "dona con lista", con la regla de "Otras". El SRS sube a la versión 3.4.0.
- Si más adelante hacen falta gráficos más complejos (zoom, series que se prenden y apagan), se puede reconsiderar una librería sin cambiar el dominio, que ya entrega los datos agregados.

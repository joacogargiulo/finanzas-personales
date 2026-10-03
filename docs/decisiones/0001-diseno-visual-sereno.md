# ADR 0001 — Dirección visual "Sereno" (A)

- **Estado:** aceptada
- **Fecha:** 2026-10-02
- **Fase:** D (diseño UX/UI)

## Contexto
La app vieja (`referencia/`) se usa solo como inspiración funcional; el dueño pidió rediseñarla desde cero. La app tiene que funcionar bien en el celular (APK) y en la compu, en modo claro y oscuro, y su uso principal es **cargar movimientos rápido** y **ver cómo vienen las cuentas**.

Se exploraron propuestas en un lienzo de diseño: https://claude.ai/artifact/LVn6gz2diMF6k9uzAyN6GG

## Opciones consideradas
1. **A · Sereno.** Claro, una sola columna, acento verde petróleo, panel inferior con teclado numérico propio.
2. **B · Tarjetas** (primera ronda). Oscuro, cuentas como tarjetas de color, acciones rápidas.
3. **C · Panel mensual** (primera ronda). Denso, con los presupuestos primero y un formulario clásico.
4. **B · Bento** (segunda ronda, inspirada en 21st.dev). Grilla de tarjetas, carga como frase y calendario de gastos.
5. **C · Cinemático** (segunda ronda, inspirada en Copilot Money). Oscuro, con el gráfico acumulado como centro y carga desde plantillas.

## Decisión
Se adopta la **dirección A · Sereno**:

- **Tipografía:** DM Sans para la interfaz y DM Mono, con cifras tabulares, para los montos.
- **Color:** variables CSS con un tema claro y otro oscuro.
  - Claro: fondo `#F6F7F5`, superficie `#FFFFFF`, acento `#0F6B5F`, ingreso `#1B7A3A`, gasto `#B42318`, transferencia `#1D5FB8`, cambio `#6E3FC2`, advertencia `#A15600`.
  - Oscuro: fondo `#0F1412`, superficie `#18201D`, acento `#4FC3AE`.
- **Navegación en el celular:** barra inferior con Inicio, Movimientos, **+** (botón central), Estadísticas y Ajustes.
- **Navegación en escritorio:** barra lateral y contenido en tarjetas de dos columnas.
- **Nuevo movimiento:** panel que sube desde abajo, con selector de tipo, monto grande, categorías como botones, cuenta y fecha ("Hoy"), descripción y **teclado numérico propio** (coma o punto para los centavos). En la Fase 5 se suma el botón de micrófono para dictar.
- **Inicio:** patrimonio estimado con las cotizaciones, totales por moneda, resumen del mes, pendientes de confirmar, presupuestos y cuentas.
- **Movimientos:** buscador, filtros como botones, lista agrupada por día con el subtotal de cada día y etiqueta "archivada" donde corresponda.
- **Accesibilidad:** los montos llevan signo además de color, los botones tienen como mínimo 44 px de alto y todo ícono sin texto tiene `aria-label`.

## Consecuencias
- Hay que construir un teclado numérico propio. En escritorio también se puede escribir con el teclado físico.
- Las propuestas B y C quedan descartadas como dirección. Algunas de sus ideas (comparar con el mes anterior, calendario de gastos, plantillas de movimientos frecuentes) se pueden reconsiderar más adelante como funciones, sin cambiar el estilo.
- Los colores y las tipografías se definen una sola vez como variables CSS (decisión de usar CSS plano, sin Tailwind).

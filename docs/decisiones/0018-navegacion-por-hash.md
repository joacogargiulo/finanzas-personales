# ADR 0018 — Navegación por hash, sin librería

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** 3 (paridad con la app actual)

## Contexto
La app tiene cuatro pantallas (Inicio, Movimientos, Estadísticas y Ajustes) y paneles que se abren encima: nuevo movimiento, editar un movimiento, cuenta nueva. Hace falta un *router*, la pieza que decide qué mostrar según la dirección, por tres motivos:
- El **botón Atrás de Android** (en el APK y en Chrome) tiene que cerrar un panel abierto, no salir de la app.
- Al recargar la página, la app tiene que volver a la misma pantalla.
- La app se publica en Firebase Hosting y se empaqueta como APK (TWA), así que la dirección tiene que funcionar igual en los dos casos.

## Alternativas
1. **Rutas propias por hash**: la pantalla y el panel van después del `#` (`#/movimientos?movimiento=nuevo`). Un hook propio escucha el evento `hashchange` del navegador. No agrega dependencias y deja ver cómo funciona un router por dentro. Si un día hacen falta rutas complejas (anidadas, con carga diferida), hay que agregarlas a mano.
2. **React Router (`HashRouter`)**: la librería estándar de la industria, con mucha documentación. Agrega peso y conceptos que esta app no necesita (loaders, layouts, data routers). En modo hash termina funcionando igual que la opción 1.
3. **React Router con rutas "limpias"** (`/movimientos`): más lindas, pero necesitan configuración del hosting para cada ruta y complican el APK.

## Decisión
Se adopta la **opción 1**, elegida por el dueño después de comparar las tres:
- `src/ui/app/route.ts`: funciones puras `parseHash` y `formatHash`, con tests. Una dirección desconocida lleva a Inicio.
- `src/ui/app/navigation.ts`: el hook `useRoute()` (con `useSyncExternalStore`) y las acciones `goTo`, `openPanel` y `closePanel`.
- **Historial pensado para el botón Atrás**, como en las apps nativas:
  - Desde Inicio, ir a otra pestaña agrega una entrada; entre las demás pestañas, se reemplaza. Así, Atrás siempre vuelve a Inicio, y desde Inicio sale de la app.
  - Abrir un panel agrega una entrada, así Atrás lo cierra. Cerrarlo con la X o con Escape vuelve atrás en el historial.
  - Pasar de un panel a otro (por ejemplo, crear una cuenta desde el panel de movimiento) reemplaza la entrada.

## Consecuencias
- No se agrega ninguna dependencia, y la navegación tiene tests unitarios (`route.test.ts`) y uno e2e (Atrás cierra el panel).
- Los paneles se abren con la dirección: `#/inicio?movimiento=abc123` abre la edición de ese movimiento, y si el movimiento no existe, el panel se cierra.
- Si más adelante la app necesita muchas más rutas, se puede migrar a React Router con `HashRouter` sin cambiar las direcciones.

## Nota de la Fase 4: Atrás también cierra los diálogos
En la Fase 3, el panel de Filtros y los diálogos de confirmación no tenían dirección propia, así que Atrás salía de la pantalla en vez de cerrarlos. Se agrega una **capa**:
- `Route` suma `layer`, que se escribe `capa=1` en el hash: `#/movimientos?capa=1`, o `#/inicio?movimiento=abc&capa=1` si hay un diálogo encima de un panel.
- El hook `useLayer(onClose)` (en `navigation.ts`) agrega esa entrada al abrir el diálogo. Si el usuario vuelve atrás, llama a `onClose`; si el diálogo se cierra por su cuenta (Cancelar, Aplicar), saca la entrada.
- `Sheet` usa la capa **por defecto**. Solo los paneles con dirección propia (movimiento, cuenta y categoría abiertos desde la ruta) la desactivan con `routed`. Así, cualquier diálogo nuevo se cierra con Atrás sin hacer nada extra.
- `closePanel()` con una capa encima (confirmar "Eliminar movimiento") vuelve las dos entradas de una vez.
- El cierre de la capa espera un instante, para que el modo estricto de React (que en desarrollo monta los efectos dos veces) y el paso de un diálogo a otro no la cierren por error. Al recargar la página, la capa se descarta: el diálogo vive en la memoria de React.

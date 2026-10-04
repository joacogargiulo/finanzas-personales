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

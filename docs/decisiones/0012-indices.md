# ADR 0012 — Índices: ninguno compuesto

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 4

## Contexto
Firestore necesita un índice para cada consulta. Los índices de un solo campo se crean automáticamente; los compuestos (filtrar u ordenar por dos o más campos a la vez) hay que declararlos en `firestore.indexes.json`. Cada índice ocupa espacio y agrega trabajo a cada escritura.

## Decisión
- Con la sincronización incremental (ADR 0003), la única consulta al servidor es `where('updatedAt', '>', cursor)` sobre cada colección del usuario. Usa un solo campo, así que su índice es automático.
- Filtros, búsqueda, orden, saldos y estadísticas se calculan en `src/domain/` con los datos del dispositivo. **No hace falta ningún índice compuesto.**
- **Opcional (Fase 2):** excluir `description` y `name` de la indexación automática, porque nadie consulta por esos campos en el servidor.

## Consecuencias
- `firestore.indexes.json` arranca vacío o solo con las exclusiones.
- Si en el futuro aparece una consulta al servidor que filtra por más de un campo, se agrega su índice en un ADR nuevo.

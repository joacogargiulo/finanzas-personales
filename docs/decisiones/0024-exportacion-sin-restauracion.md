# ADR 0024 — Exportación sin restauración

- **Estado:** aceptada
- **Fecha:** 2026-10-04
- **Fase:** 6a (exportar JSON y CSV)
- **Modifica:** SRS 1.2, 6.7, 8.1, 8.2, 10 y TC-23

## Contexto
El SRS 8 pide exportar a JSON, CSV y Google Sheets, y además **restaurar** desde el JSON: borrar todos los datos del usuario y escribir los del archivo. En el plan general el dueño ya había dejado la restauración fuera de alcance, pero el SRS seguía describiéndola. Al implementar la exportación había que decidir:
- **Si se restaura** y, si no, qué es el JSON.
- **De dónde salen los datos** que se exportan.
- **Cómo se escriben los montos y las fechas** en el CSV.

## Alternativas
**Restauración**
1. **Reemplazar todo, como dice el SRS:** borrar físicamente y escribir el archivo. Rompe la sincronización: un documento borrado nunca aparece en la consulta "¿qué cambió?" (ADR 0003), así que los otros dispositivos lo seguirían mostrando.
2. **Reemplazar con lápidas:** marcar `deletedAt` en lo actual y escribir lo del archivo. Las reglas no dejan cambiar `createdAt`, `currency`, `initialBalance` ni `source` (ADR 0010), y las categorías iniciales y los presupuestos tienen IDs fijos: restaurar sobre una cuenta que ya los tiene choca con esas reglas. Además, con 10.000 movimientos son unas 20.000 escrituras: toda la cuota diaria del plan Spark para el proyecto entero.
3. **Sin restauración:** el JSON es una copia para guardar (y para que el usuario se lleve sus datos), no un archivo para volver a cargar.

**Origen de los datos**
1. **Leer del servidor** antes de exportar: siempre está al día, pero cuesta una lectura por documento y no anda sin conexión.
2. **Del store**, que ya tiene la caché local completa (ADR 0003 y 0016): no cuesta lecturas y anda sin conexión. Si el dispositivo no está al día, puede faltar lo último que se cargó en otro.

## Decisión
- **No hay restauración** (alternativa 3). Firestore ya es la copia segura de los datos; el respaldo sirve para guardarlo aparte o para llevárselo. La tarjeta lo dice: "La app no lo vuelve a cargar".
- **Se exporta desde el store.** Si el dispositivo no está al día con el servidor, la tarjeta avisa "Sin conexión: se exporta lo que hay en este dispositivo". Los botones esperan a que la caché haya entregado todas las colecciones.
- **JSON** (`finanzas_YYYY-MM-DD.json`): `format: 'control-finanzas'`, `schemaVersion` igual al del esquema de los documentos (`SCHEMA_VERSION`, hoy 1; el "3" del SRS era la versión del documento SRS), `exportedAt` y las cinco colecciones. Incluye los archivados (se pueden restaurar dentro de la app) y deja afuera las lápidas (para el usuario ya no existen). Conserva los IDs y todos los campos, tal como los ve el dominio (`updatedAt` en milisegundos).
- **CSV** (un ZIP `finanzas_YYYY-MM-DD.zip` con `cuentas.csv`, `categorias.csv` y `movimientos.csv`), pensado para Excel en español:
  - Separador `;`, decimales con coma y sin separador de miles (`1234,56`), así Excel lo toma como número. Los centavos se pasan a texto sin dividir por 100 (regla 1 de CLAUDE.md).
  - UTF-8 con BOM (sin él, Excel muestra mal los acentos) y fin de línea `\r\n`.
  - Campos con `;`, comillas o saltos de línea, entre comillas dobles.
  - Fechas `DD/MM/YYYY`. Montos de los movimientos siempre positivos: la columna Tipo dice si entró o salió.
  - En las transferencias, "Monto destino" repite el monto (entra lo mismo que sale).
- **Las tablas se arman una sola vez** en `src/domain/exportTables.ts`, con celdas que dicen qué son (texto, monto o fecha). El CSV las escribe como texto y Google Sheets (Fase 6b) como número y fecha.
- **ZIP con fflate** (unos 8 KB, sin dependencias) en lugar de escribir el formato a mano.

## Consecuencias
- El SRS 8.2 queda sin efecto; la confirmación reforzada para "restaurar un respaldo" desaparece de 6.7, y TC-23 pasa a "exportar el JSON y verificar su contenido".
- Exportar no gasta cuota de Firestore y funciona sin conexión.
- Si algún día se quiere importar, sería un flujo nuevo ("importar a una cuenta vacía", con IDs nuevos) y necesitaría su propio ADR.
- Las descargas dentro del APK se verifican en la Fase 8.

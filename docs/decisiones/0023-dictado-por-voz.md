# ADR 0023 — Dictado por voz

- **Estado:** aceptada
- **Fecha:** 2026-10-04
- **Fase:** 5b (dictado)
- **Modifica:** SRS 6.7 y 12

## Contexto
El parser de frases existe desde la Fase 1 (ADR 0015): recibe texto y devuelve los campos del movimiento. Faltaba el micrófono: convertir lo que dice el usuario en texto y conectarlo con el panel de movimiento. Había que decidir:
- **Con qué se reconoce la voz.**
- **Qué pasa con lo que no se entendió**, y si el panel guarda solo.
- **Desde dónde se dicta.**

## Alternativas
**Reconocimiento**
1. **Web Speech API** (`SpeechRecognition`), la que trae el navegador: gratis, sin servidor propio, sin librerías. Chrome (y el APK, que usa Chrome) la soporta; Firefox no. En Chrome el audio se procesa en servidores de Google, así que necesita conexión.
2. Grabar el audio y mandarlo a un servicio (Google Cloud Speech, Whisper): mejor calidad, pero necesita un servidor, tiene costo y saca a la app del plan Spark.
3. Un modelo que corra en el celular: pesado (cientos de MB) para una PWA.

**Dónde está el micrófono**
1. **Solo dentro del panel de movimiento**, en el encabezado.
2. Un botón de micrófono al lado del botón +, en Inicio y Movimientos.

## Decisión
- **Web Speech API** (opción 1), en `src/ui/voice/speech.ts`: `lang: 'es-AR'`, una sola frase por vez. Se detecta si el navegador la soporta; **si no, el botón no aparece** (no se muestra un botón que no funciona).
- **El micrófono está solo dentro del panel** (decisión del dueño), al crear un movimiento. No aparece al editar ni al confirmar un recurrente.
- **Precarga y espera** (ADR 0015): la frase completa el formulario y el usuario revisa y toca Guardar. El panel muestra "Escuché: «…»" para que se vea qué entendió.
- **Lo que no se entendió queda marcado** con "No se entendió, revisalo." junto al campo (en ámbar, no como error). La marca se va cuando el usuario cambia ese campo. Como el selector de cuenta no tiene opción vacía, si no se entendió la cuenta queda la que estaba elegida, marcada. También se marca la cuenta si se nombró una moneda distinta ("50 dólares" en una cuenta en pesos).
- **Un cambio de moneda no se dicta**: el panel avisa "Los cambios de moneda todavía no se pueden dictar" y no toca el formulario.
- **Origen `voice`**: si el formulario se precargó dictando, el movimiento se guarda con `source: 'voice'`, aunque después se corrija algo a mano.
- **Errores en español**: micrófono no permitido, "No escuché nada", sin conexión (se revisa antes de empezar) y sin micrófono.
- **Ruta `movimiento=nuevo&dictar=1`** (ADR 0018): abre el panel que empieza a escuchar enseguida. La va a usar el atajo "Dictar movimiento" del ícono de la app, que se arma con el manifiesto en la Fase 7.

## Consecuencias
- El reconocimiento no se puede probar con un micrófono real en los tests: los tests de componentes y el e2e instalan un reconocimiento falso que "escucha" una frase fija. En el e2e se reemplazan los dos nombres (`SpeechRecognition` y `webkitSpeechRecognition`), porque el Chromium de Playwright trae los dos.
- Si se dicta antes de que lleguen las categorías (un usuario recién creado, en el primer segundo), la categoría queda marcada para revisar. No pasa en el uso normal: la caché local las tiene enseguida.
- **Privacidad (para la Fase 9):** en Chrome, el audio dictado lo procesa Google. La política de privacidad tiene que decirlo.
  - *Nota (ADR 0029):* lo dice la sección Privacidad de Ajustes (Fase 9b). La interpretación con IA de la Fase 10 se usa siempre que hay conexión.
- Sin conexión no se puede dictar; la carga a mano sigue funcionando igual.

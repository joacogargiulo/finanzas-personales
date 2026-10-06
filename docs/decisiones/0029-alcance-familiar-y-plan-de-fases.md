# ADR 0029 — Alcance familiar y nuevo plan de fases

- **Estado:** aceptada
- **Fecha:** 2026-10-06
- **Fase:** entre la 8 y la 9 (replanificación)
- **Modifica:** SRS 7.3, 7.4 y 12; ADR 0006, 0010, 0015, 0023, 0025 y 0026 (notas)

## Contexto
El plan original terminaba así:
- **Fase 9, "Listo para terceros":** Borrar mi cuenta, política de privacidad y términos, consentimiento OAuth en producción, App Check y una prueba con un usuario externo.
- **Fase 10:** IA como respaldo del dictado, solo cuando el parser de reglas no entiende.
- **Fase 11 (opcional):** carga por WhatsApp.

Ese plan suponía que la app se iba a publicar para cualquiera. El 2026-10-05 el dueño cambió el alcance:
- La app es **solo para él y su familia**. El acceso ya está limitado a una lista de emails (ADR 0026) y no se publica en Play Store (ADR 0028).
- El dictado tiene que usar **siempre la IA** cuando hay conexión. El parser de reglas queda para cuando no hay.

Además, varias cosas del plan ya están hechas:
- La pantalla de consentimiento OAuth quedó en producción en la Fase 6.
- El login y Sheets funcionan dentro del APK (ADR 0028).

## Decisión
**Qué se mantiene:**
- **"Borrar mi cuenta"** (ADR 0006). La ley y Play Store ya no lo exigen, pero un familiar que deje de usar la app tiene que poder irse sin pedirle al dueño que borre sus datos a mano.
- **Carga por WhatsApp**, que deja de ser opcional. Antes de implementarla se comparan la API oficial y Baileys (no oficial) en un ADR propio.

**Qué cambia:**
- **La política de privacidad y los términos** pasan a ser una sección **"Privacidad"** en Ajustes, en lenguaje simple. Dice qué datos salen del dispositivo y a dónde. No hace falta un documento legal público para un grupo familiar.
- **La prueba con un usuario externo** pasa a ser una prueba real con un familiar (TC-19).
- **La IA del dictado** deja de ser respaldo: se usa siempre que hay conexión. Se decide en detalle en la Fase 10, con un ADR que modifica el 0015 y el 0023.

**Qué se descarta:**
- **App Check.** Las reglas ya rechazan a cualquiera que no esté en la lista de emails. Para abusar de la cuota, un script necesitaría además la sesión de un familiar. El beneficio no justifica la configuración (reCAPTCHA y tokens de debug para los tests). Si la app vuelve a abrirse al público, se retoma (ADR 0026).
- **Play Store** y la **verificación de Google**. El APK se instala a mano, y el permiso `drive.file` no requiere verificación.

**Plan nuevo:**

| Fase | Contenido |
|---|---|
| 9 — Familia y privacidad | 9a: Borrar mi cuenta. 9b: sección Privacidad, guía para sumar un familiar y TC-19 con un familiar. |
| 10 — Dictado con IA | Cloudflare Worker que verifica el token de Firebase y la lista de emails, limita los pedidos por día y llama a un LLM de Workers AI con salida JSON restringida. Con conexión, la IA siempre; sin conexión, el parser de reglas. |
| 11 — Carga por WhatsApp | 11a: análisis de la API oficial contra Baileys y ADR. 11b: vincular el número, texto y audio (Whisper), confirmación antes de guardar y escritura validada con el dominio. |
| 12 — Cierre y v1.0.0 | Corregir el parpadeo de la app privada, README para el portfolio, repaso del SRS y los ADRs, release v1.0.0. |

Para más adelante, sin fase asignada: evaluar la IA incluida en Chrome (Gemini Nano) cuando esté disponible en Android.

## Consecuencias
- La sección Privacidad se amplía en las fases 10 (Cloudflare) y 11 (Meta), cuando sumen servicios nuevos.
- Los ADRs que mencionaban App Check, la política de privacidad o la IA como respaldo llevan una nota que apunta a este ADR. Su texto original no se reescribe, porque cuenta lo que se pensaba en ese momento.
- Sumar un familiar sigue siendo una tarea manual del dueño: cargar el hash del email y publicar las reglas (ADR 0026).

# ADR 0013 — Repositorio público en GitHub

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** 0 (setup)

## Contexto
El plan general preveía un repositorio privado. Con una cuenta gratuita de GitHub, los repositorios privados no permiten proteger ramas: no se puede obligar a que todo cambio en `main` entre por un pull request con el CI en verde. Ese flujo es parte de lo que el proyecto quiere enseñar (CLAUDE.md, "Flujo de GitHub profesional").

## Alternativas
1. **Público**: protección de ramas gratis y el código suma al portfolio.
2. **Privado con GitHub Pro** (gratis con el GitHub Student Developer Pack): requiere validar la condición de estudiante; mientras tanto, `main` queda sin protección.
3. **Privado sin protección**: el flujo se sigue por disciplina, pero GitHub no lo hace cumplir.

## Decisión
Repositorio **público**: `joacogargiulo/finanzas-personales`.

Es seguro porque:
- Los secretos nunca se suben: `.env.local`, el keystore del APK, `twa-manifest.json` y `referencia/` (que contiene una API key) están en `.gitignore` desde el primer commit.
- La configuración web de Firebase (`apiKey`, `projectId`, etc.) no es secreta: viaja a cada navegador que abre la app. La seguridad real son las reglas de Firestore (ADR 0010) y, más adelante, App Check.
  - *Nota (ADR 0029):* App Check se descartó; además de las reglas, el acceso se limita a la lista de emails de la familia (ADR 0026).

## Consecuencias
- `main` está protegida: pull request obligatorio, check `ci` obligatorio, sin force-push ni borrado.
- No se exigen aprobaciones: GitHub no deja que el autor apruebe su propio PR. El dueño revisa con comentarios y es quien hace el merge.
- Antes de cada commit hay que seguir revisando que no se cuele ningún dato personal o secreto.

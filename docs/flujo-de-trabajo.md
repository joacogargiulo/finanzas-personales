# Flujo de trabajo con GitHub

Guía corta para consultar. Cada fase del proyecto sigue estos pasos.

## 1. Issue
Un issue describe un trabajo pendiente (una fase o un bug) con su checklist.
```sh
gh issue create --title "Fase N — Nombre"
```

## 2. Rama
Nunca se trabaja directo en `main`. Cada fase tiene su rama:
```sh
git switch main && git pull     # partir de lo último
git switch -c fase-N-nombre     # crear la rama y pasarse a ella
```

## 3. Commits chicos
Cada commit es un paso que se entiende solo. Mensaje en español, con un prefijo:
`feat:` funcionalidad · `fix:` corrección · `test:` tests · `docs:` documentación · `build:`/`chore:` configuración · `ci:` integración continua.
```sh
git status                      # qué cambió
git diff                        # ver los cambios línea por línea
git add -A && git commit -m "feat: parseo de montos en centavos"
```

## 4. Push y pull request
```sh
git push -u origin fase-N-nombre
gh pr create                    # completa la plantilla: qué, por qué, cómo probar, Closes #N
```
`Closes #N` en la descripción cierra el issue automáticamente al mergear.

## 5. CI (integración continua)
GitHub Actions corre typecheck, lint, tests, tests de reglas, build y E2E en cada push al PR. Si algo falla, se ve con una ❌ en el PR: se corrige con un commit nuevo en la misma rama.
```sh
gh pr checks                    # estado del CI desde la terminal
```

## 6. Revisión
El dueño revisa el PR en GitHub, pestaña **Files changed**: puede comentar líneas puntuales y, al terminar, enviar la revisión como **Comment** o **Request changes**. Lo que pida se corrige con commits nuevos en la rama.

## 7. Merge squash
Con el CI en verde y la revisión cerrada, el dueño aprieta **Squash and merge**: todos los commits de la rama se juntan en uno solo en `main`, así el historial queda con un commit por fase o por cambio. La rama se borra sola.
```sh
git switch main && git pull     # traer el merge a la compu
git branch -d fase-N-nombre     # borrar la rama local
```

## Por qué `main` está protegida
GitHub rechaza un `git push` directo a `main`: todo entra por un PR con el check `ci` en verde. Así `main` siempre compila y pasa los tests.

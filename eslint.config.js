import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'referencia'] },

  // Reglas generales: JS recomendado + TypeScript con información de tipos.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // React: reglas de hooks y compatibilidad con el recargado en caliente de Vite.
  {
    files: ['src/**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },

  // Capas (SRS 3.1): ui → data → domain. domain no conoce React, Firebase ni las otras capas.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'domain no puede importar React.',
            },
            {
              group: ['firebase', 'firebase/*', '@firebase/*'],
              message: 'domain no puede importar Firebase.',
            },
            {
              group: ['**/data', '**/data/*', '**/ui', '**/ui/*'],
              message: 'domain no puede depender de data ni de ui.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'data no puede importar React.',
            },
            { group: ['**/ui', '**/ui/*'], message: 'data no puede depender de ui.' },
          ],
        },
      ],
    },
  },

  // Archivos de configuración (corren en Node, no en el navegador).
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  // Va al final: apaga las reglas de formato que se pisan con Prettier.
  prettier,
);

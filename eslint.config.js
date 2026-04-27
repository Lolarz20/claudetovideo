import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', '.firebase/**', '_tmp/**', '.jobs/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },
  {
    // capture-*.js + inject.js contain page.evaluate / addInitScript content
    // that runs in the browser. They reference window/document/rAF even
    // though the source file itself executes in node.
    files: ['src/capture.js', 'src/capture-stage.js', 'src/capture-vtime.js', 'src/inject.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['test/**/*.js', 'vitest.config.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
];

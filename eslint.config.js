import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The client runs in the browser; the server runs in Node.
    files: ['packages/client/**/*.ts'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', location: 'readonly' },
    },
  },
  {
    files: [
      'packages/server/**/*.ts',
      'e2e/**/*.{ts,mjs}',
      '*.config.{ts,js,mjs}',
      'playwright.config.ts',
    ],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
);

// Flat config. `npm run lint` is `eslint .` — it lints EVERYTHING including
// tests and scripts (an examentico lesson: linting only "touched" files lets
// rot accumulate in the rest). Run the full lint before pushing.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/', '**/coverage/', '**/node_modules/', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // An empty catch hides failures; if intentional it must carry a comment.
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // scripts/ are plain-node CommonJS on purpose: zero dependencies, runnable
    // with a bare `node scripts/x.js` before `npm ci` has ever happened.
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);

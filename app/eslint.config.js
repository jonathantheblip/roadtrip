// ESLint flat config — added 2026-07-18 primarily for `no-undef`, which catches
// the undefined-reference class the vite build can't (JS undefined refs are
// runtime errors). See WORKING_AGREEMENT.md §8 (the Level-2 onResolve scope bug
// that shipped because nothing caught it statically). Deliberately narrow: a bug
// net, NOT a style pass — no stylistic/recommended rules, so it stays low-noise
// on a codebase that was never linted. react-hooks is included because the code
// already carries `// eslint-disable react-hooks/exhaustive-deps` directives
// (rules-of-hooks catches real hook bugs; exhaustive-deps is a warning).
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      'node_modules/**',
      '../docs/**',
      'dist/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker, // public/sw.js: self, caches, clients, …
        ...globals.es2021,
        webkitAudioContext: 'readonly', // legit Safari global, absent from the preset
      },
    },
    rules: {
      'no-undef': 'error', // the load-bearing rule — undefined refs are runtime bugs
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // react-hooks only in the app source — NOT the Playwright e2e (whose `use`
    // fixture callback is not a React hook) or node scripts.
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error', // real hook-order bugs
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]

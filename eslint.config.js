//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // `scripts/*` berisi utilitas build plain JS (workbox-build) di luar proyek
    // TypeScript; `dev-dist/` output SW dev dari vite-plugin-pwa. Keduanya
    // dilewati lint proyek.
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'scripts/**',
      'dev-dist/**',
      'dist/**',
    ],
  },
]

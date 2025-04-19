// ./eslint.config.mjs
import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config} */
export default [
  { files: ['**/*.{js,mjs,cjs,ts}'] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: {
      prettier,
    },
    rules: {
      'max-len': ['error', { code: 160 }],
      curly: ['error', 'all'],
      'prettier/prettier': 'error',
      '@typescript-eslint/prefer-ts-expect-error': 'error', // Forces use of @ts-expect-error over @ts-ignore
    },
  },
];

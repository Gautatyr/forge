import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.scratch'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict, reactHooks.configs.flat.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    rules: {
      // noUncheckedIndexedAccess is on; `!` marks lookups known to exist.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);

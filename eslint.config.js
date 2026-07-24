// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'data/**', '.playwright-mcp/**', '**/target/**', '**/src-tauri/gen/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Node-side code: the API, all build/test config files, and the agent driver in .claude/skills.
  {
    files: ['apps/api/**/*.ts', '**/*.config.{ts,mts,js,mjs}', '.claude/skills/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Browser + React code.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);

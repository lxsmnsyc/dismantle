import config from '@lxsmnsyc/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [config],
  ignorePatterns: [
    '**/dist/**',
    '**/node_modules/**',
    '**/.output/**',
    '**/.svelte-kit/**',
    // The examples are demo apps for older framework versions. They are not built or type-checked here.
    '**/examples/**',
    // The playground input is a compiler fixture, not code that runs.
    'playground/input.js',
  ],
  rules: {
    // Modules use named exports, even when they have one export.
    // Imports then use the same name everywhere, and adding a second export does not change them.
    'import/prefer-default-export': 'off',
  },
  overrides: [
    {
      // Babel types some values as always defined when they are not.
      // For example, `scope.parent` is undefined at the program scope, and
      // `scope.getBindingIdentifier()` returns undefined for globals.
      files: ['packages/core/src/**'],
      rules: {
        'typescript/no-unnecessary-condition': 'off',
      },
    },
    {
      // Tests load compiled modules, whose exports are only known to the test itself.
      files: ['**/tests/**'],
      rules: {
        'typescript/no-unsafe-type-assertion': 'off',
      },
    },
    {
      // The playground prints compiler output.
      files: ['playground/**'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
});

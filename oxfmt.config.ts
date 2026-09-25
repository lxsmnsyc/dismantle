import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  // Markdown is prose. oxfmt rewrites directives in snippets, like `'use server'` into `('use server')`.
  // Changesets also end up in the changelog as written.
  ignorePatterns: ['**/dist/**', '**/.output/**', '**/.svelte-kit/**', '**/*.md', 'pnpm-lock.yaml'],
});

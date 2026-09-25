---
'dismantle': minor
'use-server-directive': minor
'use-worker-directive': minor
'vite-plugin-use-server-directive': minor
'vite-plugin-use-worker-directive': minor
---

Every package is now built with tsdown and ships ESM, CJS and type declarations.

- Node 20 or later is required. The build targets ES2020.
- Files in `dist` moved. Imports through package entries are unaffected, but deep imports into `dist` need updating.
- The separate `development` builds are gone. In `use-server-directive/client`, `import.meta.env.DEV` is now left to your bundler in the ESM build.
- The Vite plugins can be called without options.
- `$$server` in `use-server-directive/client` and `use-worker-directive/client` no longer takes type parameters. The compiler never passed them.
- Worker functions now clean up their message listener after streaming ends.

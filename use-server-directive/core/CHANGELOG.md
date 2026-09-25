# use-server-directive

## 0.7.0

### Minor Changes

- 7959aa0: Every package is now built with tsdown and ships ESM, CJS and type declarations.
  
  - Node 20 or later is required. The build targets ES2020.
  - Files in `dist` moved. Imports through package entries are unaffected, but deep imports into `dist` need updating.
  - The separate `development` builds are gone. In `use-server-directive/client`, `import.meta.env.DEV` is now left to your bundler in the ESM build.
  - The Vite plugins can be called without options.
  - `$$server` in `use-server-directive/client` and `use-worker-directive/client` no longer takes type parameters. The compiler never passed them.
  - Worker functions now clean up their message listener after streaming ends.

### Patch Changes

- Updated dependencies [7be53c6]
- Updated dependencies [7959aa0]
  - dismantle@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [88f3e48]
  - dismantle@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [726e407]
  - dismantle@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [2267a8f]
  - dismantle@0.5.0

# dismantle

## 0.7.0

### Minor Changes

- 7be53c6: Split code can now use local functions and classes. They are copied into the root file instead of being sent.
  Mutated variables sync back correctly for generators and blocks with `yield`.
  Blocks in non-async functions are no longer split.
  The runtime exports changed, so the compiler and runtime must be upgraded together.
  In development, split IDs now use hierarchical names like `<hash>-foo.bar`.
  The `isomorphic` option works again. It emits the split code in `client` mode too.
- 7959aa0: Every package is now built with tsdown and ships ESM, CJS and type declarations.
  
  - Node 20 or later is required. The build targets ES2020.
  - Files in `dist` moved. Imports through package entries are unaffected, but deep imports into `dist` need updating.
  - The separate `development` builds are gone. In `use-server-directive/client`, `import.meta.env.DEV` is now left to your bundler in the ESM build.
  - The Vite plugins can be called without options.
  - `$$server` in `use-server-directive/client` and `use-worker-directive/client` no longer takes type parameters. The compiler never passed them.
  - Worker functions now clean up their message listener after streaming ends.

## 0.6.1

### Patch Changes

- 88f3e48: add tree-shaking, fix generator runtime

## 0.6.0

### Minor Changes

- 726e407: server function tagging

## 0.5.0

### Minor Changes

- 2267a8f: feat: advanced closure extraction

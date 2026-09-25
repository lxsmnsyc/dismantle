import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    client: 'client/index.ts',
    compiler: 'compiler/index.ts',
    preload: 'preload/index.ts',
    runtime: 'runtime/index.ts',
    server: 'server/index.ts',
  },
  format: {
    esm: {},
    // CJS is kept so `require()` users on the 0.x line keep working.
    cjs: {
      // CJS has no `import.meta`. Bundlers replace `import.meta.env.DEV` in the ESM build.
      define: { 'import.meta.env.DEV': 'false' },
    },
  },
  platform: 'neutral',
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
  exports: true,
  publint: true,
});

import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    runtime: 'runtime/index.ts',
  },
  // CJS is kept so `require()` users on the 0.x line keep working.
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
  exports: true,
  publint: true,
});

import { defineConfig } from 'vite';
import inspect from 'vite-plugin-inspect';
import solidPlugin from 'vite-plugin-solid';
import useWorkerDirectivePlugin from 'vite-plugin-use-worker-directive';

export default defineConfig({
  plugins: [solidPlugin(), useWorkerDirectivePlugin({}), inspect()],
});

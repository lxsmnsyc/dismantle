import { defineConfig } from 'astro/config';

import node from '@astrojs/node';
import solidJs from '@astrojs/solid-js';
import tailwind from '@astrojs/tailwind';
import inspect from 'vite-plugin-inspect';
import useServerDirective from 'vite-plugin-use-server-directive';

// https://astro.build/config
export default defineConfig({
  integrations: [solidJs(), tailwind()],
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    plugins: [
      useServerDirective({
        directive: 'use server',
      }),
      inspect(),
    ],
  },
});

import { defineConfig } from 'astro/config';

import node from '@astrojs/node';
import solidJs from '@astrojs/solid-js';
import inspect from 'vite-plugin-inspect';
import useServerDirective from 'vite-plugin-use-server-directive';

// https://astro.build/config
export default defineConfig({
  integrations: [solidJs()],
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    plugins: [
      useServerDirective({
        directive: 'use server',
        filter: {
          include: 'src/**/*.{ts,tsx}',
        },
      }),
      inspect(),
    ],
  },
});

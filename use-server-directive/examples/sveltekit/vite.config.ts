import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import useServerDirective from 'vite-plugin-use-server-directive';

export default defineConfig({
  plugins: [
    sveltekit(),
    useServerDirective({
      directive: 'use server',
      filter: {
        include: 'src/**/*.ts',
      },
    }),
  ],
});

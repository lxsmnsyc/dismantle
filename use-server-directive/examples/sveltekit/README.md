# SvelteKit example

## `vite.config.ts`

```js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import useServerDirective from 'vite-plugin-use-server-directive';

export default defineConfig({
  plugins: [
    sveltekit(),
    useServerDirective({
      filter: {
        include: 'src/**/*.ts',
      },
    }),
  ],
});
```

## `src/hooks.server.ts`

```js
import 'use-server-directive/preload';
import { handleRequest } from 'use-server-directive/server';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  return (await handleRequest(event.request)) ?? (await resolve(event));
}
```

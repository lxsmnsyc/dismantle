# Setup

## `astro.config.mjs`

```js
import { defineConfig } from 'astro/config';

import useServerDirective from 'vite-plugin-use-server-directive';

export default defineConfig({
  vite: {
    plugins: [
      useServerDirective({
        directive: 'use server',
        filter: {
          include: 'src/**/*.{ts,tsx}',
        },
      }),
    ],
  },
});
```

## `src/middleware.ts`

```js
import 'use-server-directive/preload';

export function onRequest(_, next) {
  return next();
}
```

## `src/pages/[...all.astro]`

```astro
---
import { handleRequest } from "use-server-directive/server";
const result = await handleRequest(Astro.request);

if (result) {
  return result;
}
---
```

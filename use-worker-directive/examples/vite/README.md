# Vite example

## `vite.config.ts`

```js
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import useWorkerDirective from 'vite-plugin-use-worker-directive';

export default defineConfig({
  plugins: [solidPlugin(), useWorkerDirective()],
});
```

## `src/main.tsx`

```js
import 'use-worker-directive/setup';
```

## `src/App.tsx`

```js
async function serverCount(value: number) {
  'use worker';
  return `Worker Count: ${value}`;
}
```

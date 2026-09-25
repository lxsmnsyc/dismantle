# `vite-plugin-use-worker-directive`

> Vite plugin for [`use-worker-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-worker-directive/core)

[![NPM](https://img.shields.io/npm/v/vite-plugin-use-worker-directive.svg)](https://www.npmjs.com/package/vite-plugin-use-worker-directive)

## Install

```bash
npm i use-worker-directive
npm i -D vite-plugin-use-worker-directive
```

```bash
yarn add use-worker-directive
yarn add -D vite-plugin-use-worker-directive
```

```bash
pnpm add use-worker-directive
pnpm add -D vite-plugin-use-worker-directive
```

## Usage

```js
// vite.config.js
import { defineConfig } from 'vite';
import useWorkerDirective from 'vite-plugin-use-worker-directive';

export default defineConfig({
  plugins: [useWorkerDirective()],
});
```

Then import `use-worker-directive/setup` in your client entry. See the [setup of `use-worker-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-worker-directive/core#setup).

## Options

| Option | Default | Description |
| --- | --- | --- |
| `filter.include` | `'src/**/*.{jsx,tsx,ts,js,mjs,cjs}'` | Files to compile. |
| `filter.exclude` | `'node_modules/**/*.{jsx,tsx,ts,js,mjs,cjs}'` | Files to skip. |
| `directive` | `'use worker'` | The directive to look for. |
| `prefix` | `'__worker'` | Added in front of every function ID. |
| `pure` | `false` | Disables closures. Imports and local functions still work. |

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

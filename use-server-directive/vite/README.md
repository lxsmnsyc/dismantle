# `vite-plugin-use-server-directive`

> Vite plugin for [`use-server-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/core)

[![NPM](https://img.shields.io/npm/v/vite-plugin-use-server-directive.svg)](https://www.npmjs.com/package/vite-plugin-use-server-directive)

## Install

```bash
npm i use-server-directive
npm i -D vite-plugin-use-server-directive
```

```bash
yarn add use-server-directive
yarn add -D vite-plugin-use-server-directive
```

```bash
pnpm add use-server-directive
pnpm add -D vite-plugin-use-server-directive
```

## Usage

```js
// vite.config.js
import { defineConfig } from 'vite';
import useServerDirective from 'vite-plugin-use-server-directive';

export default defineConfig({
  plugins: [useServerDirective()],
});
```

Then follow the [setup of `use-server-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/core#setup) to handle requests on the server.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `filter.include` | `'src/**/*.{jsx,tsx,ts,js,mjs,cjs}'` | Files to compile. |
| `filter.exclude` | `'node_modules/**/*.{jsx,tsx,ts,js,mjs,cjs}'` | Files to skip. |
| `directive` | `'use server'` | The directive to look for. |
| `prefix` | `'__server'` | Added in front of every function ID. |
| `pure` | `false` | Disables closures. Imports and local functions still work. |

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

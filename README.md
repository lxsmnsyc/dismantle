# `dismantle`

> Universal semi-automatic code-splitter

[![NPM](https://img.shields.io/npm/v/dismantle.svg)](https://www.npmjs.com/package/dismantle)

`dismantle` moves marked code into separate modules and replaces it with a call. Use it to build features like `'use server'` functions, where code written in one file runs somewhere else.

## Install

```bash
npm i dismantle
```

```bash
yarn add dismantle
```

```bash
pnpm add dismantle
```

## Example

```js
import { compile } from 'dismantle';

const result = await compile('/src/page.js', code, {
  key: 'example',
  runtime: 'dismantle/runtime',
  mode: 'client',
  env: 'development',
  definitions: [
    {
      type: 'block-directive',
      directive: 'use server',
      target: { kind: 'named', name: '$$server', source: 'my-example/client' },
    },
  ],
});
```

Given this input:

```js
async function addTodo(title) {
  let count = 0;
  const normalize = (value) => value.trim();
  {
    'use server';
    await db.insert(normalize(title));
    count = await db.count();
  }
  return count;
}
```

The block is moved into a separate module. The client output sends `title` and `count` to it, and assigns `count` from the result. `normalize` is copied into the new module instead of being sent.

## Features

- **Directive splitting.** Split blocks and functions marked with a directive, like `'use server'`.
- **Function call splitting.** Split functions passed to an imported function, like `server$(() => ...)`.
- **Closures.** Split code can use imports, local functions, classes and variables from its surroundings.
- **Remote mutations.** Variables reassigned by split code are synced back to the caller.
- **Remote control flow.** `return`, `break`, `continue`, `throw` and `yield` in split blocks work like in the original code.
- **Generators.** Split generators stream their values back.
- **Isomorphic mode.** Optionally keep the split code in both bundles.

## Packages

| Package | Description |
| --- | --- |
| [`dismantle`](https://github.com/lxsmnsyc/dismantle/tree/main/packages/core) | The compiler and runtime. |
| [`use-server-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/core) | `'use server'` functions and blocks. |
| [`vite-plugin-use-server-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/vite) | Vite plugin for `use-server-directive`. |
| [`use-worker-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-worker-directive/core) | `'use worker'` functions and blocks. |
| [`vite-plugin-use-worker-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-worker-directive/vite) | Vite plugin for `use-worker-directive`. |

## Docs

- [Configuration](https://github.com/lxsmnsyc/dismantle/blob/main/docs/configuration.md): options, definitions, output and bundler integration.
- [Contracts](https://github.com/lxsmnsyc/dismantle/blob/main/docs/contracts.md): what the compiler generates and what your runtime must provide.

## Contributing

See [CONTRIBUTING.md](https://github.com/lxsmnsyc/dismantle/blob/main/CONTRIBUTING.md).

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

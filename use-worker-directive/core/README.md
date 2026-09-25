# `use-worker-directive`

> Universal `'use worker'` functions

[![NPM](https://img.shields.io/npm/v/use-worker-directive.svg)](https://www.npmjs.com/package/use-worker-directive)

Mark a function or block with `'use worker'`, and it runs in a Web Worker. Built on [`dismantle`](https://github.com/lxsmnsyc/dismantle/tree/main/packages/core).

## Install

```bash
npm i use-worker-directive
```

```bash
yarn add use-worker-directive
```

```bash
pnpm add use-worker-directive
```

## Setup

1. Add a bundler integration. See [Integrations](#integrations).
2. Import `use-worker-directive/setup` in your client entry.

   ```js
   import 'use-worker-directive/setup';
   ```

   This starts the worker and connects it to your worker functions.

## Usage

### Worker functions

```js
async function hash(text) {
  'use worker';
  return expensiveHash(text);
}

const resize = async (image, width) => {
  'use worker';
  return resizeImage(image, width);
};
```

Async generators work too. Each yielded value is streamed back.

```js
async function* countPrimes(limit) {
  'use worker';
  for (let n = 2; n < limit; n++) {
    if (isPrime(n)) {
      yield n;
    }
  }
}
```

### Worker blocks

A block can also run in the worker. It works in `if`, `try`, `catch`, `finally`, loops, labeled statements and plain blocks.

```js
async function processAll(items) {
  for (const item of items) {
    'use worker';
    if (item.skip) {
      continue;
    }
    await process(item);
  }
}
```

`return`, `break`, `continue`, `throw` and `yield` behave like they do in the original code.

Directives only work in `async` functions and at the top level of a module. They are ignored anywhere else.

### Closures

Worker code can use variables from the code around it.

```js
async function summarize(items) {
  let total = 0;
  const weight = (item) => item.size * 2;

  async function run() {
    'use worker';
    for (const item of items) {
      total += weight(item);
    }
  }

  await run();
  return total;
}
```

- `items` is sent with the call.
- `weight` is copied to the worker, not sent.
- `total` is sent, and the new value is assigned back after the call.

Only reassignments are synced back. Changes inside an object, like `array.push(item)`, are not.

### Streaming and serialization

Values are serialized with [seroval](https://github.com/lxsmnsyc/seroval). See the [supported types](https://github.com/lxsmnsyc/seroval/blob/main/docs/compatibility.md#supported-types).

Promises, `ReadableStream`s and async iterables inside the result are streamed. The caller gets the result right away, and their values arrive later.

## Options

The compiler and the integrations accept these options.

| Option | Default | Description |
| --- | --- | --- |
| `directive` | `'use worker'` | The directive to look for. |
| `prefix` | `'__worker'` | Added in front of every worker function ID. |
| `pure` | `false` | Disables closures. Imports and local functions still work. |

## Integrations

- [Vite](https://github.com/lxsmnsyc/dismantle/tree/main/use-worker-directive/vite)

## Examples

- [Vite](https://github.com/lxsmnsyc/dismantle/tree/main/use-worker-directive/examples/vite)

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

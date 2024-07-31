# `use-worker-directive`

> Universal `use worker` functions

[![NPM](https://img.shields.io/npm/v/use-worker-directive.svg)](https://www.npmjs.com/package/use-worker-directive) [![JavaScript Style Guide](https://badgen.net/badge/code%20style/airbnb/ff5a5f?icon=airbnb)](https://github.com/airbnb/javascript)

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

## Features

### Server functions

Like the original `"use worker"` directive, the compiler supports functions.

```js
async function doStuff(x, y) {
  "use worker";
  await foo(x);
  await bar(y);
}
// also works for arrow functions

const doStuff = async (x, y) => {
  "use worker";
  await foo(x);
  await bar(y);
};
```

The compiler also supports async generators

```js

async function* doStuff(x, y) {
  "use worker";
  yield foo(x);
  yield bar(y);
}
```

> **NOTE**
> Server functions are only valid for async functions.

### Server blocks

The original `"use worker"` is limited to functions, but what if you could mark block statements with the same directives?

```js
if (someCond()) {
  'use stuff';
  await doStuff();
}
```

`use-worker-directive` supports worker blocks in almost all statements that supports it:

- `if-else`
- `try-catch-finally`
- `for`
- `for-in`
- `for-of`
- `for await`
- `while`
- `do-while`
- labeled statements

Server blocks also supports `break`, `continue`, `return` and `throw` statements, as well as `yield` expressions and delegations.

```js
for (const item of items) {
  'use worker';
  await processItem(item);
}
```

> **NOTE**
> Server blocks are only supported within async functions and at top-level scope (since modules now support top-level `await`)

### Closure extraction

`use-worker-directive` supports closure extraction

```js
async function foo() {
  const prefix = 'Message: ';

  async function postMessage(message) {
    'use worker';
    await addMessage(prefix + message);
  }
}
```

### Streaming worker functions

If a worker function returns a value with a `Promise`, `ReadableStream` or `AsyncIterable`, those instances' values are going to be streamed through the response.

```js
async function getMessage() {
  'use worker';
  return {
    // `getAsyncData` returns a Promise
    // On the client-side, this object is going to
    // be received immedatiely, but the value
    // to which the Promise resolves into
    // is going to be streamed after.
    message: getAsyncData(),
  };
}
```

### Advanced serialization

`use-worker-directive` supports a wide range of data types, you can check [the compatibility table here](https://github.com/lxsmnsyc/seroval/blob/main/docs/compatibility.md#supported-types)

### Customizable directive

## Integrations

- [Vite](https://github.com/lxsmnsyc/dismantle/tree/main/use-worker-directive/unplugin)

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

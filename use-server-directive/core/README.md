# `use-server-directive`

> Universal `use server` functions

[![NPM](https://img.shields.io/npm/v/use-server-directive.svg)](https://www.npmjs.com/package/use-server-directive) [![JavaScript Style Guide](https://badgen.net/badge/code%20style/airbnb/ff5a5f?icon=airbnb)](https://github.com/airbnb/javascript)

## Install

```bash
npm i use-server-directive
```

```bash
yarn add use-server-directive
```

```bash
pnpm add use-server-directive
```

## Features

### Server functions

Like the original `"use server"` directive, the compiler supports functions.

```js
async function doStuff(x, y) {
  "use server";
  await foo(x);
  await bar(y);
}
// also works for arrow functions

const doStuff = async (x, y) => {
  "use server";
  await foo(x);
  await bar(y);
};
```

The compiler also supports async generators

```js

async function* doStuff(x, y) {
  "use server";
  yield foo(x);
  yield bar(y);
}
```

> **NOTE**
> Server functions are only valid for async functions.

### Server blocks

The original `"use server"` is limited to functions, but what if you could mark block statements with the same directives?

```js
if (someCond()) {
  'use stuff';
  await doStuff();
}
```

`use-server-directive` supports server blocks in almost all statements that supports it:

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
  'use server';
  await processItem(item);
}
```

> **NOTE**
> Server blocks are only supported within async functions and at top-level scope (since modules now support top-level `await`)

### Closure extraction

`use-server-directive` supports closure extraction

```js
async function foo() {
  const prefix = 'Message: ';

  async function postMessage(message) {
    'use server';
    await addMessage(prefix + message);
  }
}
```

### Streaming server functions

If a server function returns a value with a `Promise`, `ReadableStream` or `AsyncIterable`, those instances' values are going to be streamed through the response.

```js
async function getMessage() {
  'use server';
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

`use-server-directive` supports a wide range of data types, you can check [the compatibility table here](https://github.com/lxsmnsyc/seroval/blob/main/docs/compatibility.md#supported-types)

### Customizable directive

## Integrations

- [Unplugin](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/unplugin)

## Examples

- [Astro](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/examples/astro)
- [SvelteKit](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/examples/sveltekit)

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

# `use-server-directive`

> Universal `'use server'` functions

[![NPM](https://img.shields.io/npm/v/use-server-directive.svg)](https://www.npmjs.com/package/use-server-directive)

Mark a function or block with `'use server'`, and it runs on the server when called from the client. Built on [`dismantle`](https://github.com/lxsmnsyc/dismantle/tree/main/packages/core).

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

## Setup

1. Add a bundler integration. See [Integrations](#integrations).
2. Handle server function requests in your server.

   ```js
   import { handleRequest } from 'use-server-directive/server';

   export async function handle(request) {
     const response = await handleRequest(request);
     if (response) {
       return response;
     }
     // Handle other requests
   }
   ```

   `handleRequest` returns `undefined` for requests that are not server function calls.

3. Import `use-server-directive/preload` in a server module that loads when the server starts.

   ```js
   import 'use-server-directive/preload';
   ```

   This registers every server function right away. Without it, a function that is only loaded through a dynamic import may not be registered when the client calls it.

## Usage

### Server functions

```js
async function addTodo(title) {
  'use server';
  await db.insert(title);
}

const removeTodo = async (id) => {
  'use server';
  await db.remove(id);
};
```

Async generators work too. Each yielded value is streamed to the client.

```js
async function* watchTodos() {
  'use server';
  for await (const change of db.changes()) {
    yield change;
  }
}
```

### Server blocks

A block can also run on the server. It works in `if`, `try`, `catch`, `finally`, loops, labeled statements and plain blocks.

```js
async function saveAll(items) {
  for (const item of items) {
    'use server';
    if (item.skip) {
      continue;
    }
    await db.insert(item);
  }
}
```

`return`, `break`, `continue`, `throw` and `yield` behave like they do in the original code.

Directives only work in `async` functions and at the top level of a module. They are ignored anywhere else.

### Closures

Server code can use variables from the code around it.

```js
async function postMessage(user, text) {
  let count = 0;
  const format = (value) => `${user.name}: ${value}`;

  async function send() {
    'use server';
    await db.insert(format(text));
    count = await db.count();
  }

  await send();
  return count;
}
```

- `user` and `text` are sent with the call.
- `format` is copied to the server, not sent.
- `count` is sent, and the new value is assigned back after the call.

Only reassignments are synced back. Changes inside an object, like `array.push(item)`, are not.

### Streaming and serialization

Values are serialized with [seroval](https://github.com/lxsmnsyc/seroval). See the [supported types](https://github.com/lxsmnsyc/seroval/blob/main/docs/compatibility.md#supported-types).

Promises, `ReadableStream`s and async iterables inside the result are streamed. The client gets the result right away, and their values arrive later.

```js
async function getProfile(id) {
  'use server';
  return {
    name: await db.getName(id),
    // Resolves on the client once the server finishes loading it
    posts: db.getPosts(id),
  };
}
```

### Request interceptors

Change requests before the client sends them, for example to add headers.

```js
import { interceptRequest } from 'use-server-directive/client';

interceptRequest((request) => {
  request.headers.set('Authorization', `Bearer ${getToken()}`);
  return request;
});
```

## Options

The compiler and the integrations accept these options.

| Option | Default | Description |
| --- | --- | --- |
| `directive` | `'use server'` | The directive to look for. |
| `prefix` | `'__server'` | The URL path prefix of server functions, like `/__server/<id>`. |
| `pure` | `false` | Disables closures. Imports and local functions still work. |

## Integrations

- [Vite](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/vite)

## Examples

- [Astro](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/examples/astro)
- [SvelteKit](https://github.com/lxsmnsyc/dismantle/tree/main/use-server-directive/examples/sveltekit)

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

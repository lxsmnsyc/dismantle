# Contracts

This guide describes what the compiler outputs and what your runtime must provide.

## Overview

Every split produces up to three pieces of code.

- The **output** replaces the split code in the original file. It calls the split code through `dismantle/runtime` (or `options.runtime`).
- The **root file** holds the split code. It is emitted in `server` mode, or in both modes if the definition is `isomorphic`.
- The **entry file** registers the split code by calling `definition.target` with a unique ID. If a root file was emitted, it also passes the wrapped root file.

You provide two functions.

- `target` connects the caller to the split code, for example through an HTTP request.
- `handle` wraps the caller side of function directives and function calls.

## Closures

Split code can use variables from the scopes around it.

- **Imports** are imported again by the root file. They are never sent.
- **Functions and classes** declared outside the split code are copied into the root file. Their own dependencies are collected too. They are never sent.
- **Other values** are sent with every call. They must be serializable by your transport.
- **Mutated variables** are sent with every call. After the call, the latest values are sent back and assigned in the caller.

Only reassignments are tracked. Changes inside an object (like `array.push(item)`) are not sent back.

If `definition.pure` is `true`, no value is sent. Imports, functions and classes still work.

`this`, `super`, `arguments` and `new.target` cannot be used across a split. The compiler throws an error.

### Root file

The root file exports a factory. The runtime calls it once per call with the sent values.

```js
import { log } from './logger';

export default closure_1 => {
  const [value] = closure_1[0];
  let [count] = closure_1[1];
  const format = prefix => prefix + value;
  return [async function foo(item) {
    count++;
    log(format(item));
  }, () => [count]];
};
```

The factory returns a tuple.

- The first item is the split code.
- The second item reads the mutated variables, or is `null` if nothing is mutated.

## Target contract

`definition.target` is called in the entry file.

```js
// server
import { $$server as entry } from "my-example";
import { $$wrapFunction as wrap } from "dismantle/runtime";
import root from "./input.js?mode=server&example=0.js";
export default entry("a9b779ba-setup.foo", wrap(root));

// client
import { $$server as entry } from "my-example";
export default entry("a9b779ba-setup.foo");
```

It must return a function that the output can call.

- On the server, `target(id, handler)` should register `handler` and return it, or a function that calls it.
- On the client, `target(id)` should return a function that sends its arguments to the handler registered with `id`, and returns what the handler returns.
- With `isomorphic`, the client also receives `handler`. Call it directly to run the split code locally.

The handler takes the closure as its first argument, followed by the call arguments.

- For functions and blocks, it returns a promise of a [result tuple](#result-tuples).
- For generators, it returns an async iterable of result tuples.

Your transport must serialize the arguments, the result tuples, and the values inside them. On the client, the returned function may return a promise of an async iterable instead of the iterable itself.

A minimal implementation over HTTP looks like this.

```js
// my-example/server.js
const handlers = new Map();

export function $$server(id, handler) {
  handlers.set(id, handler);
  return handler;
}

export async function handleRequest(request) {
  const handler = handlers.get(new URL(request.url).pathname.slice(1));
  const args = await request.json();
  return Response.json(await handler(...args));
}

// my-example/client.js
export function $$server(id) {
  return async (...args) => {
    const response = await fetch(`/${id}`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    return response.json();
  };
}
```

This example does not support generators, or values that JSON cannot represent. Use a serializer like [seroval](https://github.com/lxsmnsyc/seroval) for those.

## Handle contract

Function directives and function calls replace the function with a call to `definition.handle`. This output is simplified.

```js
const foo = $$handle("a9b779ba-foo", async () => {
  const source = (await import("./input.js?mode=client&example=0.js")).default;
  return async (...args) => $$callFunction(source, closure, update, args);
});
```

`handle(id, factory)` must return the function that replaces the original one.

- `factory` loads the entry file and resolves to a function with the same arguments as the original.
- The resolved function returns a promise. For generators, it returns an async generator.
- `handle` decides when to call `factory`. It can load the entry file lazily on the first call, or right away.

```js
export function $$handle(id, factory) {
  let loaded;
  return async (...args) => {
    loaded ||= factory();
    return (await loaded)(...args);
  };
}
```

For generator functions, the returned function must return an async iterable.

```js
export function $$handleGenerator(id, factory) {
  return async function* (...args) {
    return yield* (await factory())(...args);
  };
}
```

## Split IDs

Every split gets an ID that starts with a hash of the file path. `definition.idPrefix` is added in front of it.

- In `development`, the ID uses the names of the functions, classes and objects that contain the split code. A function `bar` in a function `foo` gets `<hash>-foo.bar`.
- Names are inferred from variables, assignments, object keys and class members. Anonymous code adds nothing, and code with no name at all gets `anonymous`.
- A repeated name gets a `-1`, `-2`, ... suffix.
- In `production`, the ID is `<hash>-<index>` so function names are not exposed.

## Result tuples

A result tuple is `[code, value, mutations]`.

| Code | Meaning | Value |
| --- | --- | --- |
| `0` | `break` out of the split block | The label, if any |
| `1` | `continue` out of the split block | The label, if any |
| `2` | `return` | The returned value |
| `3` | The split block ran to its end | None |
| `4` | `throw` | The thrown value |
| `5` | `yield` | The yielded value |

`mutations` holds the latest values of the mutated variables. It is left out if nothing is mutated.

Generators yield a tuple with code `5` for every `yield`, then one final tuple with another code.

## Runtime helpers

The output and entry files import these from `options.runtime`.

| Helper | Used in | Purpose |
| --- | --- | --- |
| `$$wrapFunction` | Entry file | Turns a function root file into a handler. |
| `$$wrapGenerator` | Entry file | Turns a generator function root file into a handler. |
| `$$wrapBlock` | Entry file | Turns a block root file into a handler. |
| `$$wrapBlockGenerator` | Entry file | Turns a block root file that uses `yield` into a handler. |
| `$$callFunction` | Output | Calls a function handler and applies the result. |
| `$$callGenerator` | Output | Calls a generator handler and applies each result. |
| `$$callBlock` | Output | Calls a block handler and returns the control flow result. |
| `$$callBlockGenerator` | Output | Same as `$$callBlock`, and yields every yielded value. |

The compiler and the runtime must come from the same version of `dismantle`.

## Block directives

A block directive splits a block. The block can belong to a function, `if`, `try`, `catch`, a loop, or be a plain block. The block must be inside an `async` function, or at the top level of a module. Blocks in other functions are left as is.

Given this input and definition:

```js
import { log } from './logger';

async function foo(value) {
  let count = 0;
  const format = (prefix) => prefix + value;
  for (const item of value) {
    'use server';
    if (item === 'skip') continue;
    count++;
    log(format(item));
  }
  return count;
}
```

```js
{
  type: 'block-directive',
  directive: 'use server',
  target: {
    kind: 'named',
    name: '$$server',
    source: 'my-example',
  },
}
```

The output is:

```js
import { $$callBlock as $$callBlock_1 } from "dismantle/runtime";
async function foo(value) {
  let count = 0;
  const format = prefix => prefix + value;
  for (const item of value) {
    const [type_1, result_1] = await $$callBlock_1((await import("./input.js?mode=server&example=1.js")).default, [[item, value], [count]], mutations_1 => {
      [count] = mutations_1;
    });
    if (type_1 === 1) {
      continue;
    }
  }
  return count;
}
```

The root file turns jumps that leave the block into result tuples.

```js
import { log } from './logger';
export default closure_1 => {
  const [item, value] = closure_1[0];
  let [count] = closure_1[1];
  const format = prefix => prefix + value;
  return [async function () {
    if (item === 'skip') return [1];
    count++;
    log(format(item));
  }, () => [count]];
};
```

If the block contains `yield`, the root file function is a generator. The output uses `$$callBlockGenerator` with `yield*`.

## Function directives

A function directive splits a function. It requires `definition.handle`, which is called in the output with the ID and an async factory. The factory loads the entry file and returns the function to call.

Given this input and definition:

```js
import { log } from './logger';

function setup(value) {
  let count = 0;
  const format = (prefix) => prefix + value;
  return async function foo(item) {
    'use remote';
    count++;
    log(format(item));
  };
}
```

```js
{
  type: 'function-directive',
  directive: 'use remote',
  target: {
    kind: 'named',
    name: '$$server',
    source: 'my-example',
  },
  handle: {
    kind: 'named',
    name: '$$server',
    source: 'my-example/server',
  },
}
```

The output is:

```js
import { $$server as $$server_1 } from "my-example/server";
import { $$callFunction as $$callFunction_1 } from "dismantle/runtime";
function setup(value) {
  let count = 0;
  const format = prefix => prefix + value;
  return $$server_1("a9b779ba-setup.foo", async () => {
    const source_1 = (await import("./input.js?mode=server&example=1.js")).default;
    return async (...args_1) => $$callFunction_1(source_1, [[value], [count]], mutations_1 => {
      [count] = mutations_1;
    }, args_1);
  });
}
```

The root file is the one shown in [Root file](#root-file). The function body is copied as is.

Generator functions use `$$callGenerator` and `$$wrapGenerator` instead. The `handle` must return a function that returns an async iterable.

## Function calls

A function call definition splits the function passed to an imported function. Only imported functions are matched, and `definition.source` defines which one. The rest works like function directives.

```js
import { server$ } from 'my-example';

const foo = server$(async (value) => {
  console.log('Server logged with', value);
});
```

```js
{
  type: 'function-call',
  source: {
    kind: 'named',
    name: 'server$',
    source: 'my-example',
  },
  target: {
    kind: 'named',
    name: 'registerServer$',
    source: 'my-example/server',
  },
  handle: {
    kind: 'named',
    name: '$$server',
    source: 'my-example/server',
  },
}
```

## Isomorphic mode

With `definition.isomorphic`, the root file is emitted in `client` mode too. The client entry file looks like the server one.

```js
import { $$server as entry } from "my-example";
import { $$wrapFunction as wrap } from "dismantle/runtime";
import root from "./input.js?mode=client&example=0.js";
export default entry("a9b779ba-setup.foo", wrap(root));
```

The output does not change. It still calls the split code through `target`, so your client `target` decides where it runs.

- Return `handler` to run it locally.
- Return a remote call to run it on the server, like without `isomorphic`.

When the handler runs locally, the closure is not serialized. Objects are shared with the caller.

## Limitations

- Only reassigned variables are synced back. Changes inside an object are lost after a remote call.
- The value passed to `next()` of a split generator is not sent. `yield` inside split code evaluates to `undefined`.
- `this`, `super`, `arguments` and `new.target` cannot be used across a split.
- Block directives need an `async` enclosing function, or the top level of a module.
- A local function or class is copied only if it is never reassigned. Reassigned ones are sent as values, which usually fails to serialize.

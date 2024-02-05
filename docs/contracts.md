# Contracts

This guide is specifically setting up the necessary requirements to provide a runtime for your custom definitions

## General features

### Isomorphic mode

If `definition.isomorphic` is set to `true`, the output bypasses the compilation mode such that the output function exists on both `server` and `client`. In this case, the output is similar to `server` mode.

### Closure extraction

Closure extraction involves picking up variables in the same lexical scope. The captured variables is only up to the scope that isn't module-level, as module-level works with import statements rather than serialization.

If `definition.pure` is set to `true`, closure extraction is disabled.

### Remote mutations

Remote mutations involves updating a locally-declared variable if that said variable is mutated in a remote context. Like closure extraction, module-level bindings are not captured.

If `definition.pure` is set to `true`, remote mutations is disabled.

## Block Directives

A "block directive" allows the use of directive at block-level. It doesn't necessarily have to be a function, it can be any other block statements like `if-else`, `try-catch` and even `for` loops.

Given the example input and definition:

```js
async function foo(value) {
  'use server';
  console.log('Server logged with', value);
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
},
```

### Server output

A block directive's output involves a function derived from the block. The compilation outputs a root file (the file that contains the new function), the entry file (a file that performs the function registration using the `definition.target`) and the rest of the files (produced by the module-level closure extraction).

```js
// Output
import { $$func as $$func_1 } from "dismantle/runtime";
async function foo(value) {
  const [type_1, result_1] = await $$func_1((await import("./input.js?example=1.js")).default, null)(value);
}

// Root file
// ./input.js?example=0.js
export default (async function (value) {
  try {
    console.log('Server logged with', value);
  } catch (error_1) {
    return [4, error_1];
  }
  return [3];
});

// Entry file
// ./input.js?example=1.js
import { $$server as entry_1 } from "my-example";
import root_1 from "./input.js?example=0.js";
export default entry_1("fa84d07f-0-foo", root_1);
```

### Client output

Similar to server output except that the root file is excluded.

```js
// Output
import { $$func as $$func_1 } from "dismantle/runtime";
async function foo(value) {
  const [type_1, result_1] = await $$func_1((await import("./input.js?example=0.js")).default, null)(value);
}

// Entry file
// ./input.js?example=0.js
import { $$server as entry_1 } from "my-example";
export default entry_1("fa84d07f-0-foo");
```

### Remote control flow

To incorporate consistency in control flow, parts of the block is converted into `return` statements. The converted `return` statements contains a tuple of a `key` code, a `value` and the `mutation`. A `key` signifies how should the `client` interpret the tuple. `value` depends on the kind of `key`. `mutation` contains the updates to be performed by the client.

```js
/**
 * The "break" tuple
 * 
 * The value referenced here is the target labelled statement to which it must break out of.
 */
[0, 'id', mutations];
/**
 * The "continue" tuple
 * 
 * The value referenced here is the target labelled statement to which it must jump to.
 */
[1, 'id', mutations];
/**
 * The "return" tuple
 * 
 * The value referenced is the value associated to the `return` statement
 */
[2, value, mutations];
/**
 * The "implicit return" tuple
 * 
 * The produced function has an indefinite result, this usually means
 * that the client continues.
 */
[3, undefined, mutations];
/**
 * The "throw" tuple
 * 
 * The value referenced is the value associated to the `throw` statement.
 */
[4, value, mutations];
```

## Function Directives

A function directive allows the use of directive at function-level.

Compared to a block directive, a function directive requires a `definition.handle`, which is used to define which function to import and called on the `client` part of the function. On top of that, the `client` output involves a higher-order function that produces the new `client` function. It's up to `definition.handle` how to manage both the higher-order function and the produced `client` function.

Given the example input and definition:

```js
async function foo(value) {
  'use server';
  console.log('Server logged with', value);
}
```

```js
{
  type: 'function-directive',
  directive: 'use server',
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
},
```

### Server output

```js
// Output
import { $$server as $$server_1 } from "my-example/server";
import { $$func as $$func_1 } from "dismantle/runtime";
const foo = $$server_1(async () => {
  const source_1 = (await import("./input.js?example=1.js")).default;
  return async function foo(...rest_1) {
    const [type_1, result_1] = await $$func_1(source_1, null)([], ...rest_1);
    return result_1;
  };
});

// Root file
// ./input.js?example=0.js
export default (async function foo([], value) {
  try {
    console.log('Server logged with', value);
  } catch (error_1) {
    return [4, error_1];
  }
  return [3];
});

// Entry file
// ./input.js?example=1.js
import { $$server as entry_1 } from "my-example";
import root_1 from "./input.js?example=0.js";
export default entry_1("fa84d07f-0-foo", root_1);
```

### Client output

```js
// Output
import { $$server as $$server_1 } from "my-example/server";
import { $$func as $$func_1 } from "dismantle/runtime";
const foo = $$server_1(async () => {
  const source_1 = (await import("./input.js?example=0.js")).default;
  return async function foo(...rest_1) {
    const [type_1, result_1] = await $$func_1(source_1, null)([], ...rest_1);
    return result_1;
  };
});

// Entry file
// ./input.js?example=0.js
import { $$server as entry_1 } from "my-example";
export default entry_1("fa84d07f-0-foo");
```

### Remote control flow

`return` statements in the output function is also transformed like in block directives but since split happens on function-level, stuff like `break` and `continue` is no longer considered.

## Function Call

A function call definition relies on the use of function calls rather than directives. You can think of this as ["macros"](https://en.wikipedia.org/wiki/Macro_(computer_science)).

The function call to be checked is limited only to imported functions, and is defined by `definition.source`. The rest is similar to function directives.

Given the example input and definition:

```js
import { server$ } from 'my-example';

const foo = server$(value => {
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
},
```

### Server output

```js
// Output
import { $$server as $$server_1 } from "my-example/server";
import { $$func as $$func_1 } from "dismantle/runtime";
import { server$ } from 'my-example';
const foo = $$server_1( /*@dismantle skip*/async () => {
  const source_1 = (await import("./input.js?example=1.js")).default;
  return async (...rest_1) => {
    const [type_1, result_1] = await $$func_1(source_1, null)([], ...rest_1);
    return result_1;
  };
});

// Root file
// ./input.js?example=0.js
export default (([], value) => {
  try {
    console.log('Server logged with', value);
  } catch (error_1) {
    return [4, error_1];
  }
  return [3];
});

// Entry file
// ./input.js?example=1.js
import { registerServer$ as entry_1 } from "my-example/server";
import root_1 from "./input.js?example=0.js";
export default entry_1("fa84d07f-0-foo", root_1);
```

### Client output

```js
// Output
import { $$server as $$server_1 } from "my-example/server";
import { $$func as $$func_1 } from "dismantle/runtime";
import { server$ } from 'my-example';
const foo = $$server_1( /*@dismantle skip*/async () => {
  const source_1 = (await import("./input.js?example=0.js")).default;
  return async (...rest_1) => {
    const [type_1, result_1] = await $$func_1(source_1, null)([], ...rest_1);
    return result_1;
  };
});

// Entry file
// ./input.js?example=0.js
import { registerServer$ as entry_1 } from "my-example/server";
export default entry_1("fa84d07f-0-foo");
```

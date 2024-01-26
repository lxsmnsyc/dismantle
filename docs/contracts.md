# Internal functions contract

> [!NOTE]
> The terms "server" and "client" are metaphors: "server" signifies where the function exists and is called
> remotely, "client" is where the function call request comes from.

## Directives

An internal function for directives are called on top-level. This behavior is to allow the function to be registered on a user-based implementation. The registration's purpose is to allow mapping the function in the "server" from a "client" request.

```js
export function myInternalFunc(
  /**
   * ID of the function
   * 
   * Use this for mapping to the function's instance
   */
  id,
  /**
   * The function to be managed. You can do
   * whatever you want here.
   * 
   * The functions arguments is composed of the "closure" variables.
   */
  func,
) {
  /**
   * Registration stuff goes here
   */

  /**
   * The newly returned function.
   * 
   * You can choose to return the `func` if you want.
   */
  return newFunc;
}
```

On the "client" side, the API required is almost similar except that the function only accepts the `id`.

Here's how an example output would look like:

```js
// server.js
import { myInternalFunc } from 'my-example/server';
import root from '/path/to/file.ts?example=0';
export default myInternalFunc('<unique id>', root);

// client.js
import { myInternalFunc } from 'my-example/server';
import root from '/path/to/file.ts?example=0';
export default myInternalFunc('<unique id>');
```

### Remote Control Flow

Directives understands its original control flow, but the delegation of its interpretation is up to the user. 

A function produced by `dismantle`, which is derived from the user's block, has modified `return` output: the function returns a tuple that contains the kind of control flow, the value associated to the control flow, and the mutations that needs to happen at the client.

Client compilation understands this contract, and so it's important that the shape of the tuple must be preserved between the "server" and the "client".

Here's the following tuples:

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

### Remote Mutations

Directives also understands mutations, but is only limited to local `let` variables and params.

## Function Calls

A bit similar to the directives, with the exception of how the function definition can decide
if the original call must be retained or replaced by the new function as a whole.

This is useful for deciding whether or not you wanted a function or a side-effect.

```js
import { lazy$ } from 'my-example';

async function foo() {
  const result = await lazy$(() => {
    return 'foo';
  });

  console.log(result); // 'foo'
}
```

### Remote Control Flow

Similar to directives, function calls allows remote control flows, excluding `break` and `continue` statements.

### Remote Mutations

Remote mutations are also supported in "server" functions.

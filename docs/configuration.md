# Configuration

`compile` splits the marked code out of a file. It returns the new code for the file and the generated files.

```js
import { compile } from 'dismantle';

const result = await compile('/path/to/file.ts', code, {
  key: 'example',
  runtime: 'dismantle/runtime',
  mode: 'server',
  env: 'development',
  definitions: [
    {
      type: 'block-directive',
      directive: 'use server',
      target: { kind: 'named', name: '$$server', source: 'my-example/server' },
    },
  ],
});
```

- The first argument is the full path of the file. It is used to name generated files, hash IDs and build source maps.
- The second argument is the file content.
- The third argument is the options object.

TypeScript syntax is enabled for `.ts`, `.tsx`, `.mts` and `.cts` files. JSX is always enabled.

## Options

| Option | Type | Description |
| --- | --- | --- |
| `key` | `string` | Added to the names of generated files. |
| `runtime` | `string` | The module the output imports runtime helpers from. |
| `mode` | `'server' \| 'client'` | Which side the output is for. |
| `env` | `'development' \| 'production'` | Controls how IDs are generated. |
| `definitions` | `Definition[]` | What to split and how. |

### `key`

Generated files are named after the original file, the mode and a counter.

```text
/path/to/file.ts?mode=server&example=0.ts
```

Use the key in your bundler to recognize and load generated files.

### `runtime`

The output imports helpers like `$$callFunction` and `$$wrapBlock` from this module. Use `'dismantle/runtime'`, or a module that re-exports it.

```js
// my-example/runtime.js
export * from 'dismantle/runtime';
```

### `mode`

- `server` emits a root file and an entry file for every split. The root file holds the split code.
- `client` only emits entry files. The split code is not part of the output, unless the definition is `isomorphic`.

Compile the same file once per mode, one for each bundle.

### `env`

- `development` names IDs after the code that contains the split code, like `<hash>-foo.bar`.
- `production` uses indexes, like `<hash>-0`, so function names are not exposed.

See [Split IDs](./contracts.md#split-ids).

## Definitions

There are three kinds of definitions. They share these fields.

| Field | Type | Description |
| --- | --- | --- |
| `target` | `ImportDefinition` | Called in entry files to register the split code. |
| `idPrefix` | `string` | Added in front of every generated ID. |
| `pure` | `boolean` | Disables value capturing. Defaults to `false`. |
| `isomorphic` | `boolean` | Emits the split code in both modes. Defaults to `false`. |

### Block directive

Splits a block that starts with the directive.

```js
{
  type: 'block-directive',
  directive: 'use server',
  target: { kind: 'named', name: '$$server', source: 'my-example/server' },
}
```

```js
async function save(data) {
  'use server';
  await db.insert(data);
}
```

The block can be a function body, a plain block, a loop body, or part of `if` or `try`. The block must be inside an `async` function, or at the top level of a module. Blocks in other functions are left as is.

### Function directive

Splits a function whose body starts with the directive.

```js
{
  type: 'function-directive',
  directive: 'use server',
  target: { kind: 'named', name: '$$server', source: 'my-example/server' },
  handle: { kind: 'named', name: '$$handle', source: 'my-example/client' },
}
```

```js
const save = async (data) => {
  'use server';
  await db.insert(data);
};
```

`handle` is called in place of the function. See [Handle contract](./contracts.md#handle-contract).

Function declarations work too. They are turned into `const` declarations first.

### Function call

Splits the function passed to an imported function.

```js
{
  type: 'function-call',
  source: { kind: 'named', name: 'server$', source: 'my-example' },
  target: { kind: 'named', name: '$$server', source: 'my-example/server' },
  handle: { kind: 'named', name: '$$handle', source: 'my-example/client' },
}
```

```js
import { server$ } from 'my-example';

const save = server$(async (data) => {
  await db.insert(data);
});
```

`source` is only matched when it is imported from the given module. Namespace imports work too, like `example.server$(...)`.

### Using the same directive twice

A block directive and a function directive can use the same directive string. The block directive runs first, so it wins for function bodies. Use different directives if you need both.

### Import definitions

`target`, `handle` and `source` describe an import.

```js
// import { $$server } from 'my-example/server';
{ kind: 'named', name: '$$server', source: 'my-example/server' }

// import $$server from 'my-example/server';
{ kind: 'default', source: 'my-example/server' }
```

### `pure`

By default, split code can read and write local variables from its surroundings. Their values are sent with every call. See [Closures](./contracts.md#closures).

With `pure: true`, no value is sent. The split code can still use imports, and functions and classes declared outside it.

### `isomorphic`

With `isomorphic: true`, the root file is emitted in `client` mode too. The entry file passes it to `target` in both modes.

Use this when the split code should also run on the client, without a remote call. Your client `target` decides whether to call it locally.

Imports used by the split code become part of the client bundle.

## Output

```js
const { code, map, files, entries, roots } = await compile(id, code, options);
```

| Field | Type | Description |
| --- | --- | --- |
| `code` | `string` | The new code of the file. |
| `map` | `SourceMap` | The source map of `code`. |
| `files` | `Map<string, { code, map }>` | Every generated file, by full path. |
| `entries` | `string[]` | Paths of the entry files. |
| `roots` | `string[]` | Paths of the root files. |

- The output imports generated files with relative paths like `./file.ts?mode=server&example=1.ts`. Resolve them to the matching key in `files`.
- Entry files register the split code when they are imported. Import every entry file when your app starts, so a call can find its handler even if the caller has not loaded it yet.
- Root files hold the split code. Transform them like any other module of your app.
- Root files have source maps that point to the original file.

## Bundler integration

A plugin usually needs these steps.

1. Transform every matching module with `compile`, using `server` mode for the server bundle and `client` mode for the client bundle.
2. Store `files` from every result, per mode.
3. Resolve and load imports of generated files from the stored `files`.
4. Import all `entries` in a module that runs when the app starts.

See `use-server-directive/vite` in this repository for a complete example.

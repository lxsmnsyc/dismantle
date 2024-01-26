# `dismantle`

> Universal directive code-splitter

[![NPM](https://img.shields.io/npm/v/dismantle.svg)](https://www.npmjs.com/package/dismantle) [![JavaScript Style Guide](https://badgen.net/badge/code%20style/airbnb/ff5a5f?icon=airbnb)](https://github.com/airbnb/javascript)

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

## Features

- Directive Splitting
- Function Call Splitting
- Closure Extraction

### General Configuration and Output

The following are the list of configuration that can be accepted by the `compile` function:

```js
import { compile } from 'dismantle';

const result = await compile(
  // The full path to file
  path,
  // The contents of the file
  code,
  {
    /**
     * Newly produced modules appends an specific "key"
     * combined with the instanctiation number 
     * e.g. `/path/to/file.ts?example=0.ts
     * 
     * You can use this in bundlers to know how to
     * specifically load/transform the module
     */
    key: 'example',
    /**
     * Mode of compilation.
     * 
     * `server` is the mode that preserves the newly
     * produced function for split functions/blocks.
     * 
     * `client` omits the produced functions.
     */
    mode: 'server', // or 'client'
    /**
     * Only use of this configuration is to allow
     * generated function IDs (used for registration)
     * to have descriptive names
     */
    env: 'production' | 'development';
    /**
     * Array of defined directives
     */
    directives: [
      {
        // Value of the directive
        value: 'use server',
        /**
         * Which function to import and call
         * to handle the newly produced function
         * 
         * This function is called at top-level
         * and as a module side-effect.
         */
        import: {
          /**
           * Possible values are 'named' or 'default'
           * 
           * Tells how to import the function
           * 'named' -> "import { example } from 'my-example';"
           * 'default' -> "import example from 'my-example";
           * 
           * This definition also works for namespace imports
           * e.g.
           * import * as ns from 'my-example
           * ns.example;
           */
          kind: 'named',
          /**
           * The name of the function to be imported
           */
          name: '$$server',
          /**
           * Which module should the function be imported from
           */
          source: 'my-example',
        },
      },
    ],
    /**
     * Array of defined special functions
     */
    functions: [
      {
        /**
         * Defines the special function to be transformed
         */
        source: {
          kind: 'named',
          name: 'server$',
          source: 'my-example',
        },
        /**
         * Defines which function to import and call. Behaves
         * the same way like in `directives`
         */
        target: {
          kind: 'named',
          name: 'server$',
          source: 'my-example/server',
        },
        /**
         * Check if the special function call should be preserved
         * or not.
         * 
         * Setting to `true` means that the function call is preserved
         * and only the function argument gets replaced.
         * 
         * Setting to `false` means that the function call is removed
         * and only the function argument remains.
         */
        preserve: false,
      },
    ],
  },
);

/**
 * The output code
 */
result.code

/**
 * The source map of the output code
 */
result.map;

/**
 * A map of files. Keys serves as the
 * path of the file, value contains code and
 * the map of the file.
 */
const exampleFile = result.files.get(myPath);
exampleFile.code;
exampleFile.map;

/**
 * An array that contains the path of the entry files.
 * Entry files contains the registration calls
 * for the newly produced functions.
 * 
 * Use this for preloading the registration
 * to allow consistency, in case that
 * the registration is called at an unpredicted
 * timing (e.g. conditional dynamic imports)
 */
result.entries;

/**
 * An array that contains the path of the root files.
 * Root files contains the newly produced functions.
 * 
 * Use this if you want to transform the root module/function
 * before the registration call.
 */
result.roots;
```

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

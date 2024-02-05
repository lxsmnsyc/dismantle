# Configuration and Compilation

## Basic compile call

```js
import { compile } from 'dismantle';

const result = await compile(
  /**
   * The full path to file
   */
  path,
  /**
   * The contents of the file
   */
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
    definitions: [
      /**
       * An example of a block directive
       */
      {
        type: 'block-directive',
        /**
         * Value of the directive
         */
        directive: 'use server',
        /**
         * Which function to import and call
         * to handle the newly produced function
         * 
         * This function is called in entry files
         * for registration.
         */
        target: {
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
           * 
           * Only affects `named` import
           */
          name: '$$server',
          /**
           * Which module should the function be imported from
           */
          source: 'my-example',
        },
        /**
         * If the compilation should skip closure extraction
         * 
         * Defaults to `false`
         */
        pure: false,
        /**
         * If the resulting function should exist in both server
         * and client.
         * 
         * The idea is that you don't have to setup a remote
         * function call since the function exists on the same
         * runtime.
         * 
         * Defaults to `false`
         */
        isomorphic: false,
      },
      /**
       * An example of a function directive
       */
      {
        type: 'function-directive',
        /**
         * Value of the directive
         */
        directive: 'use server',
        /**
         * Defines which function to import and call. This
         * function is used in entry files.
         */
        target: {
          kind: 'named',
          name: 'server$',
          source: 'my-example/server',
        },
        /**
         * Used to handle the "client" function.
         */
        handle: {
          kind: 'named',
          name: '$$server',
          source: 'my-example/server',
        },
        pure: false,
        isomorphic: false,
      },
      /**
       *  An example of function call definition
       */
      {
        type: 'function-call',
        /**
         * Defines the special function to be transformed
         */
        source: {
          kind: 'named',
          name: 'server$',
          source: 'my-example',
        },
        /**
         * Defines which function to import and call.
         * 
         * Used in entry files.
         */
        target: {
          kind: 'named',
          name: 'server$',
          source: 'my-example/server',
        },
        /**
         * Used to replace the `source`. This is for managing the
         * function instance.
         */
        handle: {
          kind: 'named',
          name: '$$server',
          source: 'my-example/server',
        },
        pure: false,
        isomorphic: false,
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

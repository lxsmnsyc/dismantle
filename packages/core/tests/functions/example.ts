import type * as compiler from '../../src';

export const SERVER: compiler.Options = {
  runtime: 'my-example/runtime',
  key: 'my-example',
  definitions: [
    {
      type: 'function-call',
      source: {
        source: 'my-example',
        kind: 'named',
        name: 'server$',
      },
      target: {
        source: 'my-example/server',
        kind: 'named',
        name: 'registerServerFunction',
      },
      handle: {
        source: 'my-example/server',
        kind: 'named',
        name: '$$server',
      },
    },
  ],
  mode: 'server',
  env: 'development',
};
export const CLIENT: compiler.Options = {
  runtime: 'my-example/runtime',
  key: 'my-example',
  definitions: [
    {
      type: 'function-call',
      source: {
        source: 'my-example',
        kind: 'named',
        name: 'server$',
      },
      target: {
        source: 'my-example/server',
        kind: 'named',
        name: 'registerServerFunction',
      },
      handle: {
        source: 'my-example/server',
        kind: 'named',
        name: '$$server',
      },
    },
  ],
  mode: 'client',
  env: 'development',
};
export const ID = '/path/to/example.ts';

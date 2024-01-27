import type * as compiler from '../../src';

export const SERVER: compiler.Options = {
  key: 'my-example',
  directives: [],
  functions: [
    {
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
    },
  ],
  mode: 'server',
  env: 'development',
};
export const CLIENT: compiler.Options = {
  key: 'my-example',
  directives: [],
  functions: [
    {
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
    },
  ],
  mode: 'client',
  env: 'development',
};
export const ID = '/path/to/example.ts';

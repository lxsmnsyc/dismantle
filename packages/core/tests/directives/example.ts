import type * as compiler from '../../src';

export const SERVER: compiler.Options = {
  key: 'my-example',
  directives: [
    {
      value: 'use server',
      target: {
        source: 'my-example/server',
        kind: 'named',
        name: 'server',
      },
    },
  ],
  functions: [],
  mode: 'server',
  env: 'development',
};
export const CLIENT: compiler.Options = {
  key: 'my-example',
  directives: [
    {
      value: 'use server',
      target: {
        source: 'my-example/client',
        kind: 'named',
        name: 'server',
      },
    },
  ],
  functions: [],
  mode: 'client',
  env: 'development',
};
export const ID = '/path/to/example.ts';

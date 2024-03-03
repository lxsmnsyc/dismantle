import type * as compiler from '../../src';

export const SERVER: compiler.Options = {
  runtime: 'my-example/runtime',
  key: 'my-example',
  definitions: [
    {
      type: 'block-directive',
      directive: 'use server',
      target: {
        source: 'my-example/server',
        kind: 'named',
        name: 'server',
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
      type: 'block-directive',
      directive: 'use server',
      target: {
        source: 'my-example/client',
        kind: 'named',
        name: 'server',
      },
    },
  ],
  mode: 'client',
  env: 'development',
};
export const ID = '/path/to/example.ts';

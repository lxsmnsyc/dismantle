import type * as babel from '@babel/core';
import type { StateContext } from './types';
import { transformBlock } from './transform-block';

interface State extends babel.PluginPass {
  opts: StateContext;
}

export function plugin(): babel.PluginObj<State> {
  return {
    name: 'dismantle',
    visitor: {
      BlockStatement(path, ctx) {
        transformBlock(ctx.opts, path);
      },
    },
  };
}

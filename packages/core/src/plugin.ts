import type * as babel from '@babel/core';
import type { StateContext } from './types';
import { transformBlock } from './transform-block';
import { registerImportSpecifiers } from './utils/register-import-specifiers';
import { transformCall } from './transform-call';

interface State extends babel.PluginPass {
  opts: StateContext;
}

export function plugin(): babel.PluginObj<State> {
  return {
    name: 'dismantle',
    visitor: {
      Program(path, ctx) {
        registerImportSpecifiers(ctx.opts, path);
      },
      BlockStatement(path, ctx) {
        transformBlock(ctx.opts, path);
      },
      CallExpression(path, ctx) {
        transformCall(ctx.opts, path);
      },
    },
  };
}

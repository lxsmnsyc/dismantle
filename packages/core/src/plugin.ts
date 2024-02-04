import type * as babel from '@babel/core';
import { transformCall } from './transform-call';
import { transformBlockDirective } from './transform-block-directive';
import type { StateContext } from './types';
import { registerImportSpecifiers } from './utils/register-import-specifiers';

function bubbleFunctionDeclaration(): void {

}

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
      ArrowFunctionExpression(path, ctx) {

      },
      FunctionExpression(path, ctx) {

      },
      FunctionDeclaration(path, ctx) {

      },
      BlockStatement(path, ctx) {
        transformBlockDirective(ctx.opts, path);
      },
      CallExpression(path, ctx) {
        transformCall(ctx.opts, path);
      },
    },
  };
}

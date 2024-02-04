import type * as babel from '@babel/core';
import { transformBlockDirective } from './transform-block-directive';
import { transformCall } from './transform-call';
import { transformFunctionDirective } from './transform-function-directive';
import type { StateContext } from './types';
import { bubbleFunctionDeclaration } from './utils/bubble-function-declaration';
import { registerImportSpecifiers } from './utils/register-import-specifiers';

interface State extends babel.PluginPass {
  opts: StateContext;
}

export function plugin(): babel.PluginObj<State> {
  return {
    name: 'dismantle',
    visitor: {
      Program(programPath, ctx) {
        registerImportSpecifiers(ctx.opts, programPath);
        programPath.traverse({
          FunctionDeclaration(path) {
            bubbleFunctionDeclaration(ctx.opts, programPath, path);
          },
        });
      },
      ArrowFunctionExpression(path, ctx) {
        transformFunctionDirective(ctx.opts, path);
      },
      FunctionExpression(path, ctx) {
        transformFunctionDirective(ctx.opts, path);
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

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

const FUNCTION_BUBBLE: babel.Visitor<State> = {
  FunctionDeclaration(path) {
    bubbleFunctionDeclaration(path);
  },
};

const PLUGIN: babel.PluginObj<State> = {
  name: 'dismantle',
  visitor: {
    Program: {
      enter(program, ctx) {
        registerImportSpecifiers(ctx.opts, program);
        program.traverse(FUNCTION_BUBBLE, ctx);
        program.scope.crawl();
      },
    },
    ArrowFunctionExpression: {
      exit(path, ctx) {
        transformFunctionDirective(ctx.opts, path);
        path.scope.crawl();
      },
    },
    FunctionExpression: {
      exit(path, ctx) {
        transformFunctionDirective(ctx.opts, path);
      },
    },
    BlockStatement: {
      exit(path, ctx) {
        transformBlockDirective(ctx.opts, path);
      },
    },
    CallExpression: {
      exit(path, ctx) {
        transformCall(ctx.opts, path);
      },
    },
  },
};

export function plugin(): babel.PluginObj<State> {
  return PLUGIN;
}

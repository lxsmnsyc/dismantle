import type * as babel from '@babel/core';
import type * as t from '@babel/types';
import { transformBlockDirective } from './transform-block-directive';
import { transformCall } from './transform-call';
import { transformFunctionDirective } from './transform-function-directive';
import type { StateContext } from './types';
import { bubbleFunctionDeclaration } from './utils/bubble-function-declaration';
import { registerImportSpecifiers } from './utils/register-import-specifiers';

interface State extends babel.PluginPass {
  opts: StateContext;
}

const FUNCTION_BUBBLE: babel.Visitor<{
  ctx: State;
  program: babel.NodePath<t.Program>;
}> = {
  FunctionDeclaration(path, { ctx, program }) {
    bubbleFunctionDeclaration(ctx.opts, program, path);
  },
};

const PLUGIN: babel.PluginObj<State> = {
  name: 'dismantle',
  visitor: {
    Program(program, ctx) {
      registerImportSpecifiers(ctx.opts, program);
      program.traverse(FUNCTION_BUBBLE, { ctx, program });
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

export function plugin(): babel.PluginObj<State> {
  return PLUGIN;
}

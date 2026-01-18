import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { transformBlockDirective } from './transform-block-directive';
import { transformCall } from './transform-call';
import { transformFunctionDirective } from './transform-function-directive';
import type { StateContext } from './types';
import { bubbleFunctionDeclaration } from './utils/bubble-function-declaration';
import { registerImportSpecifiers } from './utils/register-import-specifiers';
import { isPathValid } from './utils/unwrap';

interface State extends babel.PluginPass {
  opts: StateContext;
}

const FUNCTION_BUBBLE: babel.Visitor<State> = {
  FunctionDeclaration(path, ctx) {
    bubbleFunctionDeclaration(ctx.opts, path);
  },
};

function treeshake(path: babel.NodePath, name: string): void {
  const binding = path.scope.getBinding(name);

  if (
    !(binding && binding.references + binding.constantViolations.length > 0)
  ) {
    if (isPathValid(path.parentPath, t.isImportDeclaration)) {
      const parent = path.parentPath;
      if (parent.node.specifiers.length === 1) {
        parent.remove();
      } else {
        path.remove();
      }
    } else {
      path.remove();
    }
  }
}

const PLUGIN: babel.PluginObj<State> = {
  name: 'dismantle',
  visitor: {
    Program: {
      enter(program, ctx) {
        registerImportSpecifiers(ctx.opts, program);
        program.traverse(FUNCTION_BUBBLE, ctx);
        program.scope.crawl();
        program.traverse({
          ArrowFunctionExpression: {
            exit(path) {
              transformFunctionDirective(ctx.opts, path);
            },
          },
          FunctionExpression: {
            exit(path) {
              transformFunctionDirective(ctx.opts, path);
            },
          },
          BlockStatement: {
            exit(path) {
              transformBlockDirective(ctx.opts, path);
            },
          },
          CallExpression: {
            exit(path) {
              transformCall(ctx.opts, path);
            },
          },
        });
        program.scope.crawl();
        // Tree-shaking
        program.traverse({
          ImportDefaultSpecifier(path) {
            treeshake(path, path.node.local.name);
          },
          ImportNamespaceSpecifier(path) {
            treeshake(path, path.node.local.name);
          },
          ImportSpecifier(path) {
            treeshake(path, path.node.local.name);
          },
        });
      },
    },
  },
};

export function plugin(): babel.PluginObj<State> {
  return PLUGIN;
}

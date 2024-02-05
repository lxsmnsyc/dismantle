import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { StateContext } from '../types';
import { getDirectiveDefinitionFromBlock } from './directive-check';
import { isStatementTopLevel } from './is-statement-top-level';

export function bubbleFunctionDeclaration(
  ctx: StateContext,
  program: babel.NodePath<t.Program>,
  path: babel.NodePath<t.FunctionDeclaration>,
): void {
  if (isStatementTopLevel(path)) {
    const decl = path.node;
    // Check if declaration is FunctionDeclaration
    if (decl.id) {
      const definition = getDirectiveDefinitionFromBlock(ctx, path.get('body'));
      if (!definition || definition.type !== 'function-directive') {
        return;
      }
      const [tmp] = program.unshiftContainer(
        'body',
        t.variableDeclaration('const', [
          t.variableDeclarator(
            decl.id,
            t.functionExpression(
              decl.id,
              decl.params,
              decl.body,
              decl.generator,
              decl.async,
            ),
          ),
        ]),
      );
      program.scope.registerDeclaration(tmp);
      tmp.skip();
      if (path.parentPath.isExportNamedDeclaration()) {
        path.parentPath.replaceWith(
          t.exportNamedDeclaration(undefined, [
            t.exportSpecifier(decl.id, decl.id),
          ]),
        );
      } else if (path.parentPath.isExportDefaultDeclaration()) {
        path.replaceWith(decl.id);
      } else {
        path.remove();
      }
    }
  }
}

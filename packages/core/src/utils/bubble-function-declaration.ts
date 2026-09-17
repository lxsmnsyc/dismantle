import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { StateContext } from '../types';
import assert from './assert';
import { getDefinitionFromDirectives } from './directive-check';

export function bubbleFunctionDeclaration(
  ctx: StateContext,
  path: babel.NodePath<t.FunctionDeclaration>,
): void {
  const decl = path.node;
  // Check if declaration is FunctionDeclaration
  if (decl.id) {
    const definition = getDefinitionFromDirectives(ctx, 'function-directive', path.get('body'));
    if (!definition) {
      return;
    }
    const block = path.findParent((current) => current.isBlockStatement() || current.isProgram());
    assert(block && (block.isBlockStatement() || block.isProgram()), 'invariant');

    const declaration = t.variableDeclaration('const', [
      t.variableDeclarator(
        decl.id,
        t.functionExpression(decl.id, decl.params, decl.body, decl.generator, decl.async),
      ),
    ]);
    // TypeScript cannot call `unshiftContainer` on a union of paths, so each branch narrows it.
    const [tmp] = block.isProgram()
      ? block.unshiftContainer('body', declaration)
      : block.unshiftContainer('body', declaration);
    path.scope.registerDeclaration(tmp);
    tmp.skip();
    if (path.parentPath.isExportNamedDeclaration()) {
      path.parentPath.replaceWith(
        t.exportNamedDeclaration(undefined, [t.exportSpecifier(decl.id, decl.id)]),
      );
    } else if (path.parentPath.isExportDefaultDeclaration()) {
      path.replaceWith(decl.id);
    } else {
      path.remove();
    }
  }
}

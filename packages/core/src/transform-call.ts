import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { DISMANTLE_REF } from './constants';
import { splitFunction } from './split-function';
import type { FunctionCallDefinition, StateContext } from './types';
import { getImportIdentifier } from './utils/get-import-identifier';
import { isPathValid, unwrapNode } from './utils/unwrap';

function getFunctionDefinitionFromPropName(
  definitions: FunctionCallDefinition[],
  propName: string,
): FunctionCallDefinition | undefined {
  for (let i = 0, len = definitions.length; i < len; i++) {
    const def = definitions[i];
    if (def.source.kind === 'default' && propName === 'default') {
      return def;
    }
    if (def.source.kind === 'named' && propName === def.source.name) {
      return def;
    }
  }
  return undefined;
}

function getFunctionDefinitionFromCallee(
  ctx: StateContext,
  path: babel.NodePath<t.CallExpression>,
): FunctionCallDefinition | undefined {
  const callee = path.node.callee;
  const id = unwrapNode(callee, t.isIdentifier);
  if (id) {
    const binding = path.scope.getBindingIdentifier(id.name);
    if (binding) {
      return ctx.registrations.identifiers.get(binding);
    }
    return undefined;
  }
  const memberExpr = unwrapNode(callee, t.isMemberExpression);
  if (
    memberExpr &&
    !memberExpr.computed &&
    t.isIdentifier(memberExpr.property)
  ) {
    const object = unwrapNode(memberExpr.object, t.isIdentifier);
    if (object) {
      const binding = path.scope.getBindingIdentifier(object.name);
      if (binding) {
        const definitions = ctx.registrations.namespaces.get(binding);
        if (definitions) {
          return getFunctionDefinitionFromPropName(
            definitions,
            memberExpr.property.name,
          );
        }
      }
    }
  }
  return undefined;
}

function isValidFunction(
  node: t.Node,
): node is t.ArrowFunctionExpression | t.FunctionExpression {
  return t.isArrowFunctionExpression(node) || t.isFunctionExpression(node);
}

function isSkippableFunction(node: t.Expression): boolean {
  if (node.leadingComments) {
    for (let i = 0, len = node.leadingComments.length; i < len; i++) {
      if (/^@dismantle skip$/.test(node.leadingComments[i].value)) {
        return true;
      }
    }
  }
  return false;
}

export function transformCall(
  ctx: StateContext,
  path: babel.NodePath<t.CallExpression>,
): void {
  const definition = getFunctionDefinitionFromCallee(ctx, path);
  if (!definition) {
    return;
  }
  const args = path.get('arguments');
  const expr = args[0];
  if (isPathValid(expr, isValidFunction) && !isSkippableFunction(expr.node)) {
    const replacement = splitFunction(ctx, expr, definition);

    path.replaceWith(
      t.addComment(
        t.callExpression(
          getImportIdentifier(ctx.imports, path, definition.handle),
          [replacement],
        ),
        'leading',
        DISMANTLE_REF,
      ),
    );
  }
}

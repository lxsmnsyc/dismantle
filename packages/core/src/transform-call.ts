import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { splitFunction } from './split-function';
import type { FunctionCallDefinition, StateContext } from './types';
import { getImportIdentifier } from './utils/get-import-identifier';
import { isValidFunction } from './utils/is-valid-function';
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
  if (isPathValid(expr, isValidFunction)) {
    const [id, replacement] = splitFunction(ctx, expr, definition);
    path.scope.crawl();

    path.replaceWith(
      t.callExpression(
        getImportIdentifier(ctx.imports, path, definition.handle),
        [t.stringLiteral(id), replacement],
      ),
    );
  }
}

import * as t from '@babel/types';
import type * as babel from '@babel/core';
import type { FunctionDefinition, StateContext } from './types';
import { splitFunction } from './split';
import { unwrapNode, unwrapPath } from './utils/unwrap';
import { unexpectedArgumentLength, unexpectedType } from './utils/errors';

function getFunctionDefinitionFromPropName(
  definitions: FunctionDefinition[],
  propName: string,
): FunctionDefinition | undefined {
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
): FunctionDefinition | undefined {
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

function extractFunction(
  path: babel.NodePath<t.CallExpression>,
): babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression> {
  const args = path.get('arguments');
  if (args.length === 0) {
    throw unexpectedArgumentLength(path, args.length, 1);
  }
  const arg = args[0];
  const argument = unwrapPath(arg, isValidFunction);
  if (argument) {
    return argument;
  }
  throw unexpectedType(
    arg,
    arg.node.type,
    'ArrowFunctionExpression | FunctionExpression',
  );
}

function isSkippableFunction(
  node: t.ArrowFunctionExpression | t.FunctionExpression,
): boolean {
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
  const func = extractFunction(path);
  if (isSkippableFunction(func.node)) {
    return;
  }
  const replacement = splitFunction(ctx, func, definition);

  if (definition.preserve) {
    func.replaceWith(t.addComment(replacement, 'leading', '@dismantle skip'));
  } else {
    path.replaceWith(replacement);
  }
}

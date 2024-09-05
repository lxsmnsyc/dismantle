import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { DirectiveDefinition, StateContext } from '../types';

function getValidDirectiveFromString<
  T extends DirectiveDefinition['type'],
  P extends Extract<DirectiveDefinition, { type: T }>,
>(ctx: StateContext, type: T, string: string): P | undefined {
  for (let i = 0, len = ctx.options.definitions.length; i < len; i++) {
    const current = ctx.options.definitions[i];
    if (current.type === type && current.directive === string) {
      return current as P;
    }
  }
  return undefined;
}

export function getDefinitionFromDirectives<
  T extends DirectiveDefinition['type'],
  P extends Extract<DirectiveDefinition, { type: T }>,
>(
  ctx: StateContext,
  type: T,
  path: babel.NodePath<t.BlockStatement>,
): P | undefined {
  for (let i = 0, len = path.node.directives.length; i < len; i++) {
    const statement = path.node.directives[i].value.value;
    const directive = getValidDirectiveFromString<T, P>(ctx, type, statement);
    if (directive) {
      return directive;
    }
  }
  return undefined;
}

export function getDefinitionFromFauxDirectives<
  T extends DirectiveDefinition['type'],
  P extends Extract<DirectiveDefinition, { type: T }>,
>(
  ctx: StateContext,
  type: T,
  path: babel.NodePath<t.BlockStatement>,
): P | undefined {
  for (let i = 0, len = path.node.body.length; i < len; i++) {
    const statement = path.node.body[i];
    if (
      t.isExpressionStatement(statement) &&
      t.isStringLiteral(statement.expression)
    ) {
      const directive = getValidDirectiveFromString<T, P>(
        ctx,
        type,
        statement.expression.value,
      );
      if (directive) {
        return directive;
      }
    } else {
      break;
    }
  }
  return undefined;
}

export function cleanBlockForDirectives(
  path: babel.NodePath<t.BlockStatement>,
  definition: DirectiveDefinition,
): void {
  const newDirectives: t.Directive[] = [];
  for (let i = 0, len = path.node.directives.length; i < len; i++) {
    const current = path.node.directives[i];
    if (current.value.value !== definition.directive) {
      newDirectives.push(current);
    }
  }
  path.node.directives = newDirectives;
}

export function cleanBlockForFauxDirectives(
  path: babel.NodePath<t.BlockStatement>,
  definition: DirectiveDefinition,
): void {
  const body = path.get('body');
  for (let i = 0, len = body.length; i < len; i++) {
    const statement = body[i];
    if (
      t.isExpressionStatement(statement.node) &&
      t.isStringLiteral(statement.node.expression)
    ) {
      if (statement.node.expression.value === definition.directive) {
        statement.remove();
        return;
      }
    }
  }
}

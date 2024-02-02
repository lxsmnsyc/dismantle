import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { splitBlock } from './split';
import type { DirectiveDefinition, StateContext } from './types';

function getValidDirectiveFromString(
  ctx: StateContext,
  string: string,
): DirectiveDefinition | undefined {
  for (let i = 0, len = ctx.options.directives.length; i < len; i++) {
    const current = ctx.options.directives[i];
    if (current.value === string) {
      return current;
    }
  }
  return undefined;
}

function getDefinitionFromDirectives(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): DirectiveDefinition | undefined {
  for (let i = 0, len = path.node.directives.length; i < len; i++) {
    const statement = path.node.directives[i].value.value;
    const directive = getValidDirectiveFromString(ctx, statement);
    if (directive) {
      return directive;
    }
  }
  return undefined;
}

function getDefinitionFromFauxDirectives(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): DirectiveDefinition | undefined {
  for (let i = 0, len = path.node.body.length; i < len; i++) {
    const statement = path.node.body[i];
    if (
      t.isExpressionStatement(statement) &&
      t.isStringLiteral(statement.expression)
    ) {
      const directive = getValidDirectiveFromString(
        ctx,
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

function getDirectiveDefinitionFromBlock(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): DirectiveDefinition | undefined {
  const parent = path.getFunctionParent();
  if (parent && !parent.node.async) {
    return undefined;
  }
  return (
    getDefinitionFromDirectives(ctx, path) ||
    getDefinitionFromFauxDirectives(ctx, path)
  );
}

function cleanBlockForDirectives(
  path: babel.NodePath<t.BlockStatement>,
  definition: DirectiveDefinition,
): void {
  const newDirectives: t.Directive[] = [];
  for (let i = 0, len = path.node.directives.length; i < len; i++) {
    const current = path.node.directives[i];
    if (current.value.value !== definition.value) {
      newDirectives.push(current);
    }
  }
  path.node.directives = newDirectives;
}

function cleanBlockForFauxDirectives(
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
      if (statement.node.expression.value === definition.value) {
        statement.remove();
        return;
      }
    }
  }
}

export function transformBlock(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): void {
  const definition = getDirectiveDefinitionFromBlock(ctx, path);
  if (!definition) {
    return;
  }
  cleanBlockForDirectives(path, definition);
  cleanBlockForFauxDirectives(path, definition);
  splitBlock(ctx, path, definition);
}

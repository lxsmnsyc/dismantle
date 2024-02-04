import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { splitBlockDirective } from './split-block-directive';
import type { BlockDirectiveDefinition, StateContext } from './types';

function getValidDirectiveFromString(
  ctx: StateContext,
  string: string,
): BlockDirectiveDefinition | undefined {
  for (let i = 0, len = ctx.options.definitions.length; i < len; i++) {
    const current = ctx.options.definitions[i];
    if (current.type === 'block-directive' && current.directive === string) {
      return current;
    }
  }
  return undefined;
}

function getDefinitionFromDirectives(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): BlockDirectiveDefinition | undefined {
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
): BlockDirectiveDefinition | undefined {
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
): BlockDirectiveDefinition | undefined {
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
  definition: BlockDirectiveDefinition,
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

function cleanBlockForFauxDirectives(
  path: babel.NodePath<t.BlockStatement>,
  definition: BlockDirectiveDefinition,
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

export function transformBlockDirective(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): void {
  const definition = getDirectiveDefinitionFromBlock(ctx, path);
  if (!definition || definition.type === 'block-directive') {
    return;
  }
  cleanBlockForDirectives(path, definition);
  cleanBlockForFauxDirectives(path, definition);
  splitBlockDirective(ctx, path, definition);
}

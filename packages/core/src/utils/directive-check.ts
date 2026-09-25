import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { DirectiveDefinition, StateContext } from '../types';

type DefinitionOfType<T extends DirectiveDefinition['type']> = Extract<
  DirectiveDefinition,
  { type: T }
>;

function isDefinitionOfType<T extends DirectiveDefinition['type']>(
  definition: StateContext['options']['definitions'][number],
  type: T,
): definition is DefinitionOfType<T> {
  return definition.type === type;
}

function getValidDirectiveFromString<T extends DirectiveDefinition['type']>(
  ctx: StateContext,
  type: T,
  string: string,
): DefinitionOfType<T> | undefined {
  for (const current of ctx.options.definitions) {
    if (isDefinitionOfType(current, type) && current.directive === string) {
      return current;
    }
  }
  return undefined;
}

export function getDefinitionFromDirectives<T extends DirectiveDefinition['type']>(
  ctx: StateContext,
  type: T,
  path: babel.NodePath<t.BlockStatement | t.Program>,
): DefinitionOfType<T> | undefined {
  for (const directive of path.node.directives) {
    const definition = getValidDirectiveFromString(ctx, type, directive.value.value);
    if (definition) {
      return definition;
    }
  }
  return undefined;
}

export function getDefinitionFromFauxDirectives<T extends DirectiveDefinition['type']>(
  ctx: StateContext,
  type: T,
  path: babel.NodePath<t.BlockStatement>,
): DefinitionOfType<T> | undefined {
  for (const statement of path.node.body) {
    if (!(t.isExpressionStatement(statement) && t.isStringLiteral(statement.expression))) {
      break;
    }
    const definition = getValidDirectiveFromString(ctx, type, statement.expression.value);
    if (definition) {
      return definition;
    }
  }
  return undefined;
}

export function cleanDirectives(
  path: babel.NodePath<t.BlockStatement | t.Program>,
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

export function cleanFauxDirectives(
  path: babel.NodePath<t.BlockStatement>,
  definition: DirectiveDefinition,
): void {
  const body = path.get('body');
  for (let i = 0, len = body.length; i < len; i++) {
    const statement = body[i];
    if (t.isExpressionStatement(statement.node) && t.isStringLiteral(statement.node.expression)) {
      if (statement.node.expression.value === definition.directive) {
        statement.remove();
        return;
      }
    }
  }
}

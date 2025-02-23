import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { splitFunctionDirective } from './split-function-directive';
import type { FunctionDirectiveDefinition, StateContext } from './types';
import {
  cleanDirectives,
  cleanFauxDirectives,
  getDefinitionFromDirectives,
  getDefinitionFromFauxDirectives,
} from './utils/directive-check';
import { getImportIdentifier } from './utils/get-import-identifier';
import { isPathValid } from './utils/unwrap';

function getFunctionDirectiveDefinition(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): FunctionDirectiveDefinition | undefined {
  const definition = getDefinitionFromDirectives(
    ctx,
    'function-directive',
    path,
  );
  if (definition) {
    cleanDirectives(path, definition);
    return definition;
  }
  const fauxDefinition = getDefinitionFromFauxDirectives(
    ctx,
    'function-directive',
    path,
  );
  if (fauxDefinition) {
    cleanFauxDirectives(path, fauxDefinition);
    return fauxDefinition;
  }
  return undefined;
}

export function transformFunctionDirective(
  ctx: StateContext,
  path: babel.NodePath<t.FunctionExpression | t.ArrowFunctionExpression>,
): void {
  const body = path.get('body');
  if (isPathValid(body, t.isBlockStatement)) {
    const definition = getFunctionDirectiveDefinition(ctx, body);
    if (definition) {
      const replacement = splitFunctionDirective(ctx, path, definition);
      path.replaceWith(
        t.callExpression(
          getImportIdentifier(ctx.imports, path, definition.handle),
          [replacement],
        ),
      );
    }
  }
}

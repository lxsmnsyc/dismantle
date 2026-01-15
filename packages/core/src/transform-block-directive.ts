import type * as babel from '@babel/core';
import type * as t from '@babel/types';
import { splitBlockDirective } from './split-block-directive';
import type { BlockDirectiveDefinition, StateContext } from './types';
import {
  cleanDirectives,
  cleanFauxDirectives,
  getDefinitionFromDirectives,
  getDefinitionFromFauxDirectives,
} from './utils/directive-check';

function getBlockDirectiveDefinition(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): BlockDirectiveDefinition | undefined {
  const definition = getDefinitionFromDirectives(ctx, 'block-directive', path);
  if (definition) {
    cleanDirectives(path, definition);
    return definition;
  }
  const fauxDefinition = getDefinitionFromFauxDirectives(
    ctx,
    'block-directive',
    path,
  );
  if (fauxDefinition) {
    cleanFauxDirectives(path, fauxDefinition);
    return fauxDefinition;
  }
  return undefined;
}

export function transformBlockDirective(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): void {
  const definition = getBlockDirectiveDefinition(ctx, path);
  if (definition) {
    const result = splitBlockDirective(ctx, path, definition);
    path.scope.crawl();
    path.replaceWith(result);
  }
}

import type * as babel from '@babel/core';
import type * as t from '@babel/types';
import { splitBlockDirective } from './split-block-directive';
import type { StateContext } from './types';
import {
  cleanBlockForDirectives,
  cleanBlockForFauxDirectives,
  getDirectiveDefinitionFromBlock,
} from './utils/directive-check';

export function transformBlockDirective(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
): void {
  const definition = getDirectiveDefinitionFromBlock(ctx, path);
  if (!definition || definition.type !== 'block-directive') {
    return;
  }
  cleanBlockForDirectives(path, definition);
  cleanBlockForFauxDirectives(path, definition);
  splitBlockDirective(ctx, path, definition);
}

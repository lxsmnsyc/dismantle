import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { splitFunctionDirective } from './split-function-directive';
import type { StateContext } from './types';
import {
  cleanBlockForDirectives,
  cleanBlockForFauxDirectives,
  getDirectiveDefinitionFromBlock,
} from './utils/directive-check';
import { getImportIdentifier } from './utils/get-import-identifier';
import { isPathValid } from './utils/unwrap';

export function transformFunctionDirective(
  ctx: StateContext,
  path: babel.NodePath<t.FunctionExpression | t.ArrowFunctionExpression>,
): void {
  const body = path.get('body');
  if (isPathValid(body, t.isBlockStatement)) {
    const definition = getDirectiveDefinitionFromBlock(ctx, body);
    if (!definition || definition.type !== 'function-directive') {
      return;
    }
    cleanBlockForDirectives(body, definition);
    cleanBlockForFauxDirectives(body, definition);
    const replacement = splitFunctionDirective(ctx, path, definition);
    path.replaceWith(
      t.callExpression(getImportIdentifier(ctx, path, definition.handle), [
        replacement,
      ]),
    );
  }
}

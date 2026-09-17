import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { FunctionCallDefinition, FunctionDirectiveDefinition, StateContext } from '../types';
import assert from '../utils/assert';
import { generateUniqueName } from '../utils/generate-unique-name';
import { isValidFunction } from '../utils/is-valid-function';
import { createClosureArray, createUpdater, getRuntimeIdentifier, importEntry } from './caller';
import { type Closure, analyzeClosure } from './closure';
import { CALL_FUNCTION, CALL_GENERATOR, WRAP_FUNCTION, WRAP_GENERATOR } from './constants';
import { createEntryFile, createRootFile, createSplitID } from './files';
import { createRootProgram } from './root';

type SplitFunction = t.ArrowFunctionExpression | t.FunctionExpression;

/**
 * ```js
 * async () => {
 *   const source = (await import('./entry')).default;
 *   return async (...args) => $$callFunction(source, closure, update, args);
 * }
 * ```
 */
function createReplacement(
  ctx: StateContext,
  path: babel.NodePath<SplitFunction>,
  closure: Closure,
  entryFile: string,
): t.Expression {
  const source = generateUniqueName(path, 'source');
  const args = generateUniqueName(path, 'args');
  const call = t.callExpression(
    getRuntimeIdentifier(ctx, path, path.node.generator ? CALL_GENERATOR : CALL_FUNCTION),
    [source, createClosureArray(closure), createUpdater(path, closure), args],
  );

  const proxy = path.node.generator
    ? t.functionExpression(
        undefined,
        [t.restElement(args)],
        t.blockStatement([t.returnStatement(t.yieldExpression(call, true))]),
        true,
        true,
      )
    : t.arrowFunctionExpression([t.restElement(args)], call, true);

  return t.arrowFunctionExpression(
    [],
    t.blockStatement([
      t.variableDeclaration('const', [t.variableDeclarator(source, importEntry(entryFile))]),
      t.returnStatement(proxy),
    ]),
    true,
  );
}

export function splitFunction(
  ctx: StateContext,
  path: babel.NodePath<SplitFunction>,
  definition: FunctionDirectiveDefinition | FunctionCallDefinition,
): readonly [id: string, replacement: t.Expression] {
  const closure = analyzeClosure(path, !!definition.pure);
  const id = createSplitID(ctx, path, definition.idPrefix);

  const rootFile =
    ctx.options.mode === 'server' || definition.isomorphic
      ? createRootFile(
          ctx,
          createRootProgram(closure, (clone) => {
            assert(isValidFunction(clone), 'invariant');
            return clone;
          }).program,
        )
      : undefined;

  const entryFile = createEntryFile(
    ctx,
    id,
    path.node.generator ? WRAP_GENERATOR : WRAP_FUNCTION,
    rootFile,
    definition.target,
  );

  return [id, createReplacement(ctx, path, closure, entryFile)];
}

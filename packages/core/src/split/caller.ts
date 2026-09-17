import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { StateContext } from '../types';
import { generateUniqueName } from '../utils/generate-unique-name';
import { getImportIdentifier } from '../utils/get-import-identifier';
import type { Closure } from './closure';

export function getRuntimeIdentifier(
  ctx: StateContext,
  path: babel.NodePath,
  name: string,
): t.Identifier {
  return getImportIdentifier(ctx.imports, path, {
    kind: 'named',
    source: ctx.options.runtime,
    name,
  });
}

/**
 * `(await import('./entry')).default`
 */
export function importEntry(entryFile: string): t.Expression {
  return t.memberExpression(
    t.awaitExpression(t.importExpression(t.stringLiteral(entryFile))),
    t.identifier('default'),
  );
}

/**
 * `[[...values], [...mutables]]`, read at the time of the call.
 */
export function createClosureArray(closure: Closure): t.ArrayExpression {
  return t.arrayExpression([
    t.arrayExpression(
      closure.values.map(binding => t.identifier(binding.identifier.name)),
    ),
    t.arrayExpression(
      closure.mutables.map(binding => t.identifier(binding.identifier.name)),
    ),
  ]);
}

/**
 * `(mutations) => { [a, b] = mutations; }`, or `null` if nothing is mutated.
 */
export function createUpdater(
  path: babel.NodePath,
  closure: Closure,
): t.Expression {
  if (!closure.mutables.length) {
    return t.nullLiteral();
  }
  const mutations = generateUniqueName(path, 'mutations');
  return t.arrowFunctionExpression(
    [mutations],
    t.blockStatement([
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.arrayPattern(
            closure.mutables.map(binding =>
              t.identifier(binding.identifier.name),
            ),
          ),
          mutations,
        ),
      ),
    ]),
  );
}

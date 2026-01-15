import type * as babel from '@babel/core';
import type * as t from '@babel/types';
import type { RootBindings } from './split';
import {
  compileBindingMap,
  createEntryFile,
  createRootFile,
  getBindingMap,
  getFunctionReplacement,
  getMergedDependencies,
  getModuleImports,
  transformRootFunction,
} from './split';
import type {
  FunctionCallDefinition,
  FunctionDirectiveDefinition,
  StateContext,
} from './types';
import getForeignBindings from './utils/get-foreign-bindings';

function replaceFunction(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  definition:
    | FunctionDirectiveDefinition
    | FunctionCallDefinition,
  bindings: RootBindings,
): t.Expression {
  const dependencies = getMergedDependencies(bindings);

  const statements = getModuleImports(dependencies.modules);

  statements.push(transformRootFunction(path, dependencies));

  const entryFile = createEntryFile(
    ctx,
    path,
    ctx.options.mode === 'server'
      ? createRootFile(
          ctx,
          statements.concat(compileBindingMap(bindings, dependencies)),
        )
      : undefined,
    definition.target,
    definition.idPrefix,
  );

  return getFunctionReplacement(ctx, path, entryFile, dependencies);
}

export function splitFunction(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  definition:
    | FunctionDirectiveDefinition
    | FunctionCallDefinition,
): t.Expression {
  return replaceFunction(
    ctx,
    path,
    definition,
    getBindingMap(
      path,
      getForeignBindings(path, 'function'),
      !!definition.pure,
    ),
  );
}

import type * as babel from '@babel/core';
import type * as t from '@babel/types';
import {
  type RootBindings,
  compileBindingMap,
  createEntryFile,
  createRootFile,
  getBindingMap,
  getFunctionReplacement,
  getMergedDependencies,
  getModuleImports,
  transformRootFunction,
} from './split';
import type { FunctionCallDefinition, StateContext } from './types';
import getForeignBindings from './utils/get-foreign-bindings';

function replaceFunctionFromCall(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  func: FunctionCallDefinition,
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
    func.target,
    func.idPrefix,
  );

  return getFunctionReplacement(ctx, path, entryFile, dependencies);
}

export function splitFunctionFromCall(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  func: FunctionCallDefinition,
): t.Expression {
  const bindings = getBindingMap(path, getForeignBindings(path, 'function'));
  return replaceFunctionFromCall(ctx, path, func, bindings);
}

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
import type { FunctionDirectiveDefinition, StateContext } from './types';
import getForeignBindings from './utils/get-foreign-bindings';

function replaceFunctionDirective(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  directive: FunctionDirectiveDefinition,
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
    directive.target,
    directive.idPrefix,
  );

  return getFunctionReplacement(ctx, path, entryFile, dependencies);
}

export function splitFunctionDirective(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  directive: FunctionDirectiveDefinition,
): t.Expression {
  return replaceFunctionDirective(
    ctx,
    path,
    directive,
    getBindingMap(path, getForeignBindings(path, 'function')),
  );
}

import type * as babel from '@babel/core';
import type * as t from '@babel/types';
import type { Dependencies } from './split';
import {
  createEntryFile,
  createRootFile,
  getBindingDependencies,
  getFunctionReplacement,
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
  definition: FunctionDirectiveDefinition | FunctionCallDefinition,
  dependencies: Dependencies,
): t.Expression {
  const statements = getModuleImports(dependencies.modules);

  statements.push(transformRootFunction(path, dependencies));

  const entryFile = createEntryFile(
    ctx,
    path.node.generator ? 'generator' : 'function',
    path,
    ctx.options.mode === 'server' ? createRootFile(ctx, statements) : undefined,
    definition.target,
    definition.idPrefix,
  );

  return getFunctionReplacement(ctx, path, entryFile, dependencies);
}

export function splitFunction(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  definition: FunctionDirectiveDefinition | FunctionCallDefinition,
): t.Expression {
  return replaceFunction(
    ctx,
    path,
    definition,
    getBindingDependencies(
      path,
      getForeignBindings(path, 'function'),
      !!definition.pure,
    ),
  );
}

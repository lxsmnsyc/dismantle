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
import { getDescriptiveName } from './utils/get-descriptive-name';
import getForeignBindings from './utils/get-foreign-bindings';

function replaceFunction(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  definition: FunctionDirectiveDefinition | FunctionCallDefinition,
  dependencies: Dependencies,
) {
  const statements = getModuleImports(dependencies.modules);

  statements.push(transformRootFunction(path, dependencies));

  // Create an ID
  let id = `${definition.idPrefix || ''}${ctx.blocks.hash}-${ctx.blocks.count++}`;
  if (ctx.options.env !== 'production') {
    id += `-${getDescriptiveName(path, 'anonymous')}`;
  }

  const entryFile = createEntryFile(
    ctx,
    id,
    path.node.generator ? 'generator' : 'function',
    ctx.options.mode === 'server' ? createRootFile(ctx, statements) : undefined,
    definition.target,
  );

  return [
    id,
    getFunctionReplacement(ctx, path, entryFile, dependencies),
  ] as const;
}

export function splitFunction(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  definition: FunctionDirectiveDefinition | FunctionCallDefinition,
) {
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

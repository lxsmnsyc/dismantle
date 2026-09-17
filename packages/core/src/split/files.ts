import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { ImportDefinition, StateContext } from '../types';
import { generateCode } from '../utils/generator-shim';
import { getHierarchicalName } from '../utils/get-hierarchical-name';

function createVirtualFileName(ctx: StateContext): string {
  return `./${ctx.path.base}?mode=${ctx.options.mode}&${ctx.options.key}=${ctx
    .virtual.count++}${ctx.path.ext}`;
}

/**
 * Creates the ID used to register the split code.
 *
 * - Development: `<hash>-foo.bar`, from the names that contain the split code.
 *   Repeated names get a `-1`, `-2`, ... suffix.
 * - Production: `<hash>-<index>`, so function names are not exposed.
 */
export function createSplitID(
  ctx: StateContext,
  path: babel.NodePath,
  prefix: string | undefined,
): string {
  const base = `${prefix || ''}${ctx.blocks.hash}-`;
  const index = ctx.blocks.count++;
  if (ctx.options.env === 'production') {
    return `${base}${index}`;
  }
  const name = getHierarchicalName(path) || 'anonymous';
  const seen = ctx.blocks.names.get(name) || 0;
  ctx.blocks.names.set(name, seen + 1);
  return seen ? `${base}${name}-${seen}` : `${base}${name}`;
}

export function createRootFile(ctx: StateContext, program: t.Program): string {
  const rootFile = createVirtualFileName(ctx);
  ctx.onVirtualFile(rootFile, generateCode(ctx.id, program), 'root');
  return rootFile;
}

function createImport(
  local: t.Identifier,
  definition: ImportDefinition,
): t.ImportDeclaration {
  return t.importDeclaration(
    [
      definition.kind === 'named'
        ? t.importSpecifier(local, t.identifier(definition.name))
        : t.importDefaultSpecifier(local),
    ],
    t.stringLiteral(definition.source),
  );
}

/**
 * Creates the file that registers the split code:
 *
 * ```js
 * // server
 * import { register as entry } from 'target';
 * import { $$wrapFunction as wrap } from 'runtime';
 * import root from './root';
 * export default entry('id', wrap(root));
 *
 * // client
 * import { register as entry } from 'target';
 * export default entry('id');
 * ```
 */
export function createEntryFile(
  ctx: StateContext,
  id: string,
  wrapper: string,
  rootFile: string | undefined,
  target: ImportDefinition,
): string {
  const entry = t.identifier('entry');
  const statements: t.Statement[] = [createImport(entry, target)];
  const args: t.Expression[] = [t.stringLiteral(id)];

  if (rootFile) {
    const wrap = t.identifier('wrap');
    const root = t.identifier('root');
    statements.push(
      createImport(wrap, {
        kind: 'named',
        name: wrapper,
        source: ctx.options.runtime,
      }),
      createImport(root, { kind: 'default', source: rootFile }),
    );
    args.push(t.callExpression(wrap, [root]));
  }

  statements.push(t.exportDefaultDeclaration(t.callExpression(entry, args)));

  const entryFile = createVirtualFileName(ctx);
  ctx.onVirtualFile(
    entryFile,
    generateCode(ctx.id, t.program(statements)),
    'entry',
  );
  return entryFile;
}

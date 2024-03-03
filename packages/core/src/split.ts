import type * as babel from '@babel/core';
import type { Binding, BindingKind } from '@babel/traverse';
import * as t from '@babel/types';
import type { ImportDefinition, ModuleDefinition, StateContext } from './types';
import { generateUniqueName } from './utils/generate-unique-name';
import { generateCode } from './utils/generator-shim';
import { getDescriptiveName } from './utils/get-descriptive-name';
import getForeignBindings from './utils/get-foreign-bindings';
import { getIdentifiersFromLVal } from './utils/get-identifiers-from-lval';
import { getModuleDefinition } from './utils/get-module-definition';
import { getRootStatementPath } from './utils/get-root-statement-path';
import { isPathValid, unwrapPath } from './utils/unwrap';

function moduleDefinitionToImportSpecifier(definition: ModuleDefinition) {
  switch (definition.kind) {
    case 'default':
      return t.importDefaultSpecifier(t.identifier(definition.local));
    case 'named':
      return t.importSpecifier(
        t.identifier(definition.local),
        definition.imported
          ? t.identifier(definition.imported)
          : t.identifier(definition.local),
      );
    case 'namespace':
      return t.importNamespaceSpecifier(t.identifier(definition.local));
  }
}

function moduleDefinitionToImportDeclaration(definition: ModuleDefinition) {
  return t.importDeclaration(
    [moduleDefinitionToImportSpecifier(definition)],
    t.stringLiteral(definition.source),
  );
}

function moduleDefinitionsToImportDeclarations(
  definitions: ModuleDefinition[],
) {
  const declarations: t.ImportDeclaration[] = [];
  for (let i = 0, len = definitions.length; i < len; i++) {
    declarations[i] = moduleDefinitionToImportDeclaration(definitions[i]);
  }
  return declarations;
}

function isMutation(kind: BindingKind): boolean {
  switch (kind) {
    case 'let':
    case 'var':
    case 'param':
      return true;
    case 'const':
    case 'hoisted':
    case 'local':
    case 'module':
    case 'unknown':
      return false;
  }
}

function registerModuleLevelBinding(
  ctx: StateContext,
  modules: ModuleDefinition[],
  binding: string,
  target: Binding,
): void {
  const current = ctx.bindings.get(binding);
  if (current) {
    modules.push(current);
  } else if (isPathValid(target.path, t.isVariableDeclarator)) {
    const definitions = splitVariableDeclarator(ctx, target.path);
    for (let k = 0, klen = definitions.length; k < klen; k++) {
      modules.push(definitions[k]);
      ctx.bindings.set(definitions[k].local, definitions[k]);
    }
  } else if (isPathValid(target.path, t.isFunctionDeclaration)) {
    const definition = splitFunctionDeclaration(ctx, target.path);
    modules.push(definition);
    ctx.bindings.set(definition.local, definition);
  }
}

function registerBinding(
  ctx: StateContext,
  modules: ModuleDefinition[],
  locals: t.Identifier[],
  mutations: t.Identifier[],
  binding: string,
  target: Binding,
  pure?: boolean,
): void {
  if (target.kind === 'module') {
    const result = getModuleDefinition(target.path);
    if (result) {
      modules.push(result);
    }
  } else if (target.kind === 'param') {
    locals.push(target.identifier);
  } else {
    let blockParent = target.path.scope.getBlockParent();
    const programParent = target.path.scope.getProgramParent();
    // a FunctionDeclaration binding refers to itself as the block parent
    if (blockParent.path === target.path) {
      blockParent = blockParent.parent;
    }
    if (blockParent === programParent) {
      registerModuleLevelBinding(ctx, modules, binding, target);
    } else if (!pure) {
      locals.push(target.identifier);
      if (isMutation(target.kind)) {
        mutations.push(target.identifier);
      }
    }
  }
}

export interface ExtractedBindings {
  modules: ModuleDefinition[];
  locals: t.Identifier[];
  mutations: t.Identifier[];
}

export function extractBindings(
  ctx: StateContext,
  path: babel.NodePath,
  bindings: Set<string>,
  pure?: boolean,
): ExtractedBindings {
  const modules: ModuleDefinition[] = [];
  const locals: t.Identifier[] = [];
  const mutations: t.Identifier[] = [];
  for (const binding of bindings) {
    const target = path.scope.getBinding(binding);
    if (target) {
      registerBinding(ctx, modules, locals, mutations, binding, target, pure);
    }
  }

  return {
    modules,
    locals,
    mutations,
  };
}

function createVirtualFileName(ctx: StateContext) {
  return `./${ctx.path.base}?${ctx.options.key}=${ctx.virtual.count++}${
    ctx.path.ext
  }`;
}

export function createRootFile(
  ctx: StateContext,
  bindings: ExtractedBindings,
  replacement: t.Expression,
): string {
  const rootFile = createVirtualFileName(ctx);
  const rootContent = generateCode(
    ctx.id,
    t.program([
      ...(ctx.options.mode === 'server'
        ? moduleDefinitionsToImportDeclarations(bindings.modules)
        : []),
      t.exportDefaultDeclaration(replacement),
    ]),
  );
  ctx.onVirtualFile(
    rootFile,
    { code: rootContent.code, map: rootContent.map },
    'root',
  );
  return rootFile;
}

export function createEntryFile(
  ctx: StateContext,
  path: babel.NodePath,
  rootFile: string | undefined,
  imported: ImportDefinition,
  idPrefix?: string,
): string {
  // Create an ID
  let id = `${idPrefix || ''}${ctx.blocks.hash}-${ctx.blocks.count++}`;
  if (ctx.options.env !== 'production') {
    id += `-${getDescriptiveName(path, 'anonymous')}`;
  }
  const entryID = generateUniqueName(path, 'entry');
  const entryImports: ModuleDefinition[] = [
    {
      kind: imported.kind,
      source: imported.source,
      local: entryID.name,
      imported: imported.kind === 'named' ? imported.name : undefined,
    },
  ];
  const args: t.Expression[] = [t.stringLiteral(id)];
  if (rootFile) {
    const rootID = generateUniqueName(path, 'root');
    entryImports.push({
      kind: 'default',
      source: rootFile,
      local: rootID.name,
    });
    args.push(rootID);
  }

  // Create the registration call
  const entryFile = createVirtualFileName(ctx);
  const entryContent = generateCode(
    ctx.id,
    t.program([
      ...moduleDefinitionsToImportDeclarations(entryImports),
      t.exportDefaultDeclaration(t.callExpression(entryID, args)),
    ]),
  );
  ctx.onVirtualFile(
    entryFile,
    { code: entryContent.code, map: entryContent.map },
    'entry',
  );

  return entryFile;
}

function splitFunctionDeclaration(
  ctx: StateContext,
  path: babel.NodePath<t.FunctionDeclaration>,
): ModuleDefinition {
  const bindings = getForeignBindings(path, 'function');
  const { modules } = extractBindings(ctx, path, bindings);
  const file = createVirtualFileName(ctx);
  const compiled = generateCode(
    ctx.id,
    t.program([
      ...moduleDefinitionsToImportDeclarations(modules),
      t.exportNamedDeclaration(path.node),
    ]),
  );
  ctx.onVirtualFile(file, { code: compiled.code, map: compiled.map }, 'none');

  const statement = getRootStatementPath(path);

  const identifier = path.node.id || generateUniqueName(path, 'func');
  const definition: ModuleDefinition = {
    kind: 'named',
    local: identifier.name,
    source: file,
  };

  statement.insertBefore(moduleDefinitionToImportDeclaration(definition));
  path.remove();
  return definition;
}

function splitVariableDeclarator(
  ctx: StateContext,
  path: babel.NodePath<t.VariableDeclarator>,
): ModuleDefinition[] {
  const init = unwrapPath(path.get('init'), t.isExpression);
  const modules = init
    ? extractBindings(
        ctx,
        path,
        getForeignBindings(
          path,
          isPathValid(init, t.isArrowFunctionExpression) ||
            isPathValid(init, t.isFunctionExpression)
            ? 'function'
            : 'expression',
        ),
      ).modules
    : [];
  const file = createVirtualFileName(ctx);
  const parent = path.parentPath.node as t.VariableDeclaration;
  const compiled = generateCode(
    ctx.id,
    t.program([
      ...moduleDefinitionsToImportDeclarations(modules),
      t.exportNamedDeclaration(t.variableDeclaration(parent.kind, [path.node])),
    ]),
  );
  ctx.onVirtualFile(file, { code: compiled.code, map: compiled.map }, 'none');
  const definitions: ModuleDefinition[] = getIdentifiersFromLVal(
    path.node.id,
  ).map(name => ({
    kind: 'named',
    local: name,
    source: file,
  }));
  // Replace declaration with definition
  const statement = getRootStatementPath(path);
  if (statement) {
    statement.insertBefore(moduleDefinitionsToImportDeclarations(definitions));
  }
  path.remove();
  return definitions;
}

/**
 * These are internal code for the control flow of the server block
 * The goal is to transform these into return statements, and the
 * the return value with the associated control flow code.
 * This allows the replacement statement for the server block to
 * know what to do if it encounters the said statement on the server.
 */
export const BREAK_KEY = t.numericLiteral(0);
export const CONTINUE_KEY = t.numericLiteral(1);
export const RETURN_KEY = t.numericLiteral(2);
// If the function has no explicit return
export const NO_HALT_KEY = t.numericLiteral(3);
export const THROW_KEY = t.numericLiteral(4);
export const YIELD_KEY = t.numericLiteral(5);

export function getGeneratorReplacementForBlock(
  path: babel.NodePath,
  registerID: t.Identifier,
  args: (t.Identifier | t.SpreadElement | t.ArrayExpression)[],
): [replacements: t.Statement[], step: t.Identifier] {
  const iterator = generateUniqueName(path, 'iterator');
  const step = generateUniqueName(path, 'step');
  const replacement: t.Statement[] = [
    t.variableDeclaration('let', [
      t.variableDeclarator(step),
      // First, get the iterator by calling the generator
      t.variableDeclarator(
        iterator,
        t.awaitExpression(t.callExpression(registerID, args)),
      ),
    ]),
    // Create a while statement, the intent is to
    // repeatedly iterate the generator
    t.whileStatement(
      t.booleanLiteral(true),
      t.blockStatement([
        // Get the next value
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            step,
            t.awaitExpression(
              t.callExpression(
                t.memberExpression(iterator, t.identifier('next')),
                [],
              ),
            ),
          ),
        ),
        // Check if the step is done
        t.ifStatement(
          t.memberExpression(step, t.identifier('done')),
          t.blockStatement([
            // exit the loop
            t.breakStatement(),
          ]),
          // Otherwise, yield the value
          t.blockStatement([
            t.expressionStatement(
              t.yieldExpression(
                t.memberExpression(step, t.identifier('value')),
              ),
            ),
          ]),
        ),
      ]),
    ),
  ];
  return [replacement, step];
}

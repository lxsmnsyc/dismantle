import type * as babel from '@babel/core';
import type { Binding } from '@babel/traverse';
import * as t from '@babel/types';
import {
  DISMANTLE_CONTEXT,
  DISMANTLE_POP,
  DISMANTLE_PUSH,
  HIDDEN_FUNC,
  HIDDEN_GENERATOR,
} from './constants';
import { patchV8Identifier } from './patch-v8-identifier';
import type { ImportDefinition, ModuleDefinition, StateContext } from './types';
import assert from './utils/assert';
import { generateUniqueName } from './utils/generate-unique-name';
import { generateCode } from './utils/generator-shim';
import { getDescriptiveName } from './utils/get-descriptive-name';
import getForeignBindings from './utils/get-foreign-bindings';
import { getImportIdentifier } from './utils/get-import-identifier';
import { getModuleDefinition } from './utils/get-module-definition';
import { isPathValid, unwrapNode, unwrapPath } from './utils/unwrap';

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

export function moduleDefinitionToImportDeclaration(
  definition: ModuleDefinition,
) {
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

export interface Dependencies {
  modules: Binding[];
  locals: Binding[];
  mutations: Binding[];
}

export interface LocalDependencies extends Dependencies {
  variable: t.Identifier;
}

export type BindingMap = Map<babel.NodePath<ValidFunction>, LocalDependencies>;

export interface RootBindings {
  map: BindingMap;
  root: LocalDependencies;
}

interface ExtractDependenciesState {
  map: BindingMap;
  visited: Set<babel.NodePath>;
}

function extractDependenciesFromFunction(
  state: ExtractDependenciesState,
  target: Binding,
  path: babel.NodePath<
    t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression
  >,
): void {
  if (state.visited.has(target.path)) {
    return;
  }
  state.visited.add(target.path);
  if (!state.map.has(path)) {
    state.map.set(
      path,
      getBindingDependencies(state, path, getForeignBindings(path, 'function')),
    );
  }
}

function addLocalDependency(
  dependencies: LocalDependencies,
  target: Binding,
): void {
  if (target.constant) {
    if (!dependencies.locals.includes(target)) {
      dependencies.locals.push(target);
    }
  } else if (!dependencies.mutations.includes(target)) {
    dependencies.mutations.push(target);
  }
}

function extractDependenciesFromVariableDeclarator(
  state: ExtractDependenciesState,
  dependencies: LocalDependencies,
  target: Binding,
): void {
  if (!isPathValid(target.path, t.isVariableDeclarator)) {
    return;
  }
  // Get the init
  const init = unwrapPath(target.path.get('init'), t.isExpression);
  // Check for init
  if (init) {
    // Check if init is a function expression
    if (
      isPathValid(init, t.isArrowFunctionExpression) ||
      isPathValid(init, t.isFunctionExpression)
    ) {
      extractDependenciesFromFunction(state, target, init);
      return;
    }
  }
  addLocalDependency(dependencies, target);
}

function extractDependency(
  state: ExtractDependenciesState,
  dependencies: LocalDependencies,
  target: Binding,
): void {
  switch (target.kind) {
    // For module imports, we just push to them
    // to the module bindings
    case 'module': {
      dependencies.modules.push(target);
      break;
    }
    // For params, we push them as mutable locals
    case 'param': {
      addLocalDependency(dependencies, target);
      break;
    }
    case 'const':
    case 'let':
    case 'var': {
      extractDependenciesFromVariableDeclarator(state, dependencies, target);
      break;
    }
    case 'hoisted': {
      if (isPathValid(target.path, t.isFunctionDeclaration)) {
        extractDependenciesFromFunction(state, target, target.path);
      }
      break;
    }
    case 'local':
    case 'unknown':
      break;
  }
}

function getBindingDependencies(
  state: ExtractDependenciesState,
  path: babel.NodePath,
  identifiers: Set<string>,
): LocalDependencies {
  const bindings: LocalDependencies = {
    variable: t.identifier(getDescriptiveName(path, 'func')),
    modules: [],
    locals: [],
    mutations: [],
  };
  for (const identifier of identifiers) {
    const target = path.scope.getBinding(identifier);
    if (target) {
      // Recursively extract
      extractDependency(state, bindings, target);
    } else {
      // TODO globals
    }
  }

  return bindings;
}

export function getBindingMap(
  path: babel.NodePath<ValidBlock>,
  identifiers: Set<string>,
): RootBindings {
  const state: ExtractDependenciesState = {
    map: new Map(),
    visited: new Set(),
  };
  state.visited.add(path);
  const dependencies = getBindingDependencies(state, path, identifiers);
  return {
    map: state.map,
    root: dependencies,
  };
}

type ValidFunction =
  | t.FunctionDeclaration
  | t.FunctionExpression
  | t.ArrowFunctionExpression;

type ValidBlock = ValidFunction | t.BlockStatement;

function patchIdentifier(
  dependencies: Dependencies,
  context: t.Identifier,
  path: babel.NodePath<t.Identifier | t.JSXIdentifier>,
): void {
  const binding = path.scope.getBinding(path.node.name);
  if (binding) {
    const localsIndex = dependencies.locals.indexOf(binding);
    if (localsIndex > -1) {
      path.replaceWith(
        t.memberExpression(
          t.memberExpression(context, t.identifier('__l')),
          t.numericLiteral(localsIndex),
          true,
        ),
      );
    }
    const mutationsIndex = dependencies.mutations.indexOf(binding);
    if (mutationsIndex > -1) {
      path.replaceWith(
        t.memberExpression(
          t.memberExpression(context, t.identifier('__m')),
          t.numericLiteral(mutationsIndex),
          true,
        ),
      );
    }
  }
}

export function transformInnerReferences(
  body: babel.NodePath,
  context: t.Identifier,
  dependencies: Dependencies,
): void {
  body.traverse({
    ReferencedIdentifier(path) {
      patchIdentifier(dependencies, context, path);
    },
    AssignmentExpression(path) {
      const id = unwrapPath(path.get('left'), t.isIdentifier);
      if (id) {
        patchIdentifier(dependencies, context, id);
      }
    },
    UpdateExpression(path) {
      const id = unwrapPath(path.get('argument'), t.isIdentifier);
      if (id) {
        patchIdentifier(dependencies, context, id);
      }
    },
    CallExpression: {
      exit(child) {
        if (t.isExpression(child.node.callee)) {
          // check if it is a member expression
          const member = unwrapNode(child.node.callee, t.isMemberExpression);
          const object = member ? member.object : t.nullLiteral();
          child.replaceWith(
            t.callExpression(t.memberExpression(context, t.identifier('run')), [
              child.node.callee,
              object,
              ...child.node.arguments,
            ]),
          );
          child.skip();
        }
      },
    },
  });
}

export function transformFunctionForSplit(
  path: babel.NodePath<ValidFunction>,
  id: t.Identifier,
  dependencies: Dependencies,
): t.FunctionDeclaration {
  const backup = t.cloneNode(path.node, true, false);
  // Ensure body is a block statement
  const body = path.get('body');
  if (isPathValid(body, t.isExpression)) {
    body.replaceWith(t.blockStatement([t.returnStatement(body.node)]));
  }
  assert(isPathValid(body, t.isBlockStatement), 'invariant');
  // First, insert a context hook
  const context = generateUniqueName(path, 'context');
  const contextCall = t.v8IntrinsicIdentifier(DISMANTLE_CONTEXT);
  const header: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(context, t.callExpression(contextCall, [])),
    ]),
  ];
  // Transform body for closure context wrapping
  transformInnerReferences(body, context, dependencies);

  header.push(...body.node.body);
  body.replaceWith(t.blockStatement(header));
  const current = path.node;
  path.replaceWith(backup);
  return t.functionDeclaration(
    id,
    current.params,
    current.body as t.BlockStatement,
    current.generator,
    current.async,
  );
}

function createVirtualFileName(ctx: StateContext) {
  return `./${ctx.path.base}?mode=${ctx.options.mode}&${ctx.options.key}=${ctx
    .virtual.count++}${ctx.path.ext}`;
}

export function getModuleImports(modules: Binding[]): t.Statement[] {
  const statements: t.Statement[] = [];
  for (const mod of modules) {
    const definition = getModuleDefinition(mod.path);
    if (definition) {
      statements.push(moduleDefinitionToImportDeclaration(definition));
    }
  }
  return statements;
}

export function getMergedDependencies(bindings: RootBindings): Dependencies {
  const dirtyLocals: Binding[] = [];
  const dirtyMutations: Binding[] = [];
  const dirtyModules: Binding[] = [];

  dirtyLocals.push.apply(dirtyLocals, bindings.root.locals);
  dirtyMutations.push.apply(dirtyMutations, bindings.root.mutations);
  dirtyModules.push.apply(dirtyModules, bindings.root.modules);

  for (const [, binding] of bindings.map) {
    dirtyLocals.push.apply(dirtyLocals, binding.locals);
    dirtyMutations.push.apply(dirtyMutations, binding.mutations);
    dirtyModules.push.apply(dirtyModules, binding.modules);
  }

  const modules = [...new Set(dirtyModules)];
  const locals = [...new Set(dirtyLocals)];
  const mutations = [...new Set(dirtyMutations)];

  return {
    modules,
    locals,
    mutations,
  };
}

export function createRootFile(
  ctx: StateContext,
  statements: t.Statement[],
): string {
  const rootFile = createVirtualFileName(ctx);
  const node = t.file(t.program(statements));
  patchV8Identifier(ctx, node);
  const rootContent = generateCode(ctx.id, node);
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
  const entryID = t.identifier('entry');
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
    const rootID = t.identifier('root');
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
  args: (t.Expression | t.SpreadElement)[],
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

export function transformRootFunction(
  root: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  dependencies: Dependencies,
): t.Statement {
  const path = root.get('body');
  if (isPathValid(path, t.isExpression)) {
    path.replaceWith(t.blockStatement([t.returnStatement(path.node)]));
  }
  assert(isPathValid(path, t.isBlockStatement), 'invariant');
  const target =
    path.scope.getFunctionParent() || path.scope.getProgramParent();

  const closure = generateUniqueName(root, 'closure');
  const context = generateUniqueName(root, 'context');

  const applyMutations = dependencies.mutations.length
    ? t.memberExpression(context, t.identifier('__m'))
    : undefined;

  // Transform the control flow statements
  path.traverse({
    ReturnStatement(child) {
      const parent =
        child.scope.getFunctionParent() || child.scope.getProgramParent();
      if (parent === target) {
        const arg = child.get('argument');
        arg.replaceWith(
          t.arrayExpression([
            RETURN_KEY,
            arg.node ? arg.node : t.nullLiteral(),
            applyMutations ? applyMutations : t.nullLiteral(),
          ]),
        );
      }
    },
    YieldExpression(child) {
      const parent =
        child.scope.getFunctionParent() || child.scope.getProgramParent();
      if (parent === target) {
        if (child.node.delegate) {
          // TODO
        } else {
          const arg = child.get('argument');
          arg.replaceWith(
            t.arrayExpression([
              YIELD_KEY,
              arg.node ? arg.node : t.nullLiteral(),
              applyMutations ? applyMutations : t.nullLiteral(),
            ]),
          );
        }
      }
    },
  });

  const error = generateUniqueName(path, 'error');

  const throwResult: t.Expression[] = [THROW_KEY, error];
  const haltResult: t.Expression[] = [NO_HALT_KEY];

  if (applyMutations) {
    throwResult.push(applyMutations);
    haltResult.push(t.nullLiteral());
    haltResult.push(applyMutations);
  }

  transformInnerReferences(path, context, dependencies);

  path.node.body = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        context,
        t.callExpression(t.v8IntrinsicIdentifier(DISMANTLE_PUSH), [closure]),
      ),
    ]),
    t.tryStatement(
      t.blockStatement(path.node.body),
      t.catchClause(
        error,
        t.blockStatement([t.returnStatement(t.arrayExpression(throwResult))]),
      ),
      t.blockStatement([
        t.expressionStatement(
          t.callExpression(t.v8IntrinsicIdentifier(DISMANTLE_POP), [context]),
        ),
      ]),
    ),
    t.returnStatement(t.arrayExpression(haltResult)),
  ];

  return t.exportDefaultDeclaration(
    t.isFunctionExpression(root.node)
      ? t.functionExpression(
          root.node.id,
          [closure, ...root.node.params],
          root.node.body,
          root.node.generator,
          root.node.async,
        )
      : t.arrowFunctionExpression(
          [closure, ...root.node.params],
          root.node.body,
          root.node.async,
        ),
  );
}

export function compileBindingMap(
  bindings: RootBindings,
  dependencies: Dependencies,
): t.Statement[] {
  const statements: t.Statement[] = [];

  for (const [path, binding] of bindings.map) {
    statements.push(
      transformFunctionForSplit(path, binding.variable, dependencies),
    );
  }

  return statements;
}

export function getFunctionReplacement(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  entryFile: string,
  dependencies: Dependencies,
): t.Expression {
  const rest = generateUniqueName(path, 'rest');

  const returnType = generateUniqueName(path, 'type');
  const returnResult = generateUniqueName(path, 'result');
  const returnMutations = generateUniqueName(path, 'mutations');

  const source = generateUniqueName(path, 'source');

  const replacement: t.Statement[] = [];
  if (path.node.generator) {
    const funcID = generateUniqueName(path, 'fn');
    replacement.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          funcID,
          t.callExpression(
            getImportIdentifier(ctx.imports, path, {
              ...HIDDEN_GENERATOR,
              source: ctx.options.runtime,
            }),
            [
              source,
              dependencies.mutations.length
                ? t.arrowFunctionExpression(
                    [returnMutations],
                    t.assignmentExpression(
                      '=',
                      t.arrayPattern(
                        dependencies.mutations.map(id => id.identifier),
                      ),
                      returnMutations,
                    ),
                  )
                : t.nullLiteral(),
            ],
          ),
        ),
      ]),
    );
    const [reps, step] = getGeneratorReplacementForBlock(path, funcID, [
      t.arrayExpression([
        t.arrayExpression(dependencies.locals.map(id => id.identifier)),
        t.arrayExpression(dependencies.mutations.map(id => id.identifier)),
      ]),
      t.spreadElement(rest),
    ]);
    for (let i = 0, len = reps.length; i < len; i++) {
      replacement.push(reps[i]);
    }
    replacement.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.arrayPattern([returnType, returnResult]),
          t.memberExpression(step, t.identifier('value')),
        ),
      ]),
    );
  } else {
    replacement.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.arrayPattern([returnType, returnResult]),
          t.awaitExpression(
            t.callExpression(
              t.callExpression(
                getImportIdentifier(ctx.imports, path, {
                  ...HIDDEN_FUNC,
                  source: ctx.options.runtime,
                }),
                [
                  source,
                  dependencies.mutations.length
                    ? t.arrowFunctionExpression(
                        [returnMutations],
                        t.assignmentExpression(
                          '=',
                          t.arrayPattern(
                            dependencies.mutations.map(id => id.identifier),
                          ),
                          returnMutations,
                        ),
                      )
                    : t.nullLiteral(),
                ],
              ),
              [
                t.arrayExpression([
                  t.arrayExpression(
                    dependencies.locals.map(id => id.identifier),
                  ),
                  t.arrayExpression(
                    dependencies.mutations.map(id => id.identifier),
                  ),
                ]),
                t.spreadElement(rest),
              ],
            ),
          ),
        ),
      ]),
    );
  }

  replacement.push(t.returnStatement(returnResult));

  return t.arrowFunctionExpression(
    [],
    t.blockStatement([
      t.variableDeclaration('const', [
        t.variableDeclarator(
          source,
          t.memberExpression(
            t.awaitExpression(t.importExpression(t.stringLiteral(entryFile))),
            t.identifier('default'),
          ),
        ),
      ]),
      t.returnStatement(
        isPathValid(path, t.isFunctionExpression)
          ? t.functionExpression(
              path.node.id,
              [t.restElement(rest)],
              t.blockStatement(replacement),
              path.node.generator,
              true,
            )
          : t.arrowFunctionExpression(
              [t.restElement(rest)],
              t.blockStatement(replacement),
              true,
            ),
      ),
    ]),
    true,
  );
}

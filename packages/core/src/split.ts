import type * as babel from '@babel/core';
import type { Binding } from '@babel/traverse';
import * as t from '@babel/types';
import { DISMANTLE_CONTEXT, HIDDEN_FUNC, HIDDEN_GENERATOR } from './constants';
import { patchV8Identifier } from './patch-v8-identifier';
import type { ImportDefinition, ModuleDefinition, StateContext } from './types';
import { generateUniqueName } from './utils/generate-unique-name';
import { generateCode } from './utils/generator-shim';
import { getImportIdentifier } from './utils/get-import-identifier';
import { getModuleDefinition } from './utils/get-module-definition';
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
  modules: ModuleDefinition[];
  locals: Binding[];
  mutations: Binding[];
}

function addLocalDependency(dependencies: Dependencies, target: Binding): void {
  if (target.constant) {
    if (!dependencies.locals.includes(target)) {
      dependencies.locals.push(target);
    }
  } else if (!dependencies.mutations.includes(target)) {
    dependencies.mutations.push(target);
  }
}

function extractDependenciesFromVariableDeclarator(
  dependencies: Dependencies,
  target: Binding,
  isPure: boolean,
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
      return;
    }
  }
  if (!isPure) {
    addLocalDependency(dependencies, target);
  }
}

function extractDependency(
  dependencies: Dependencies,
  target: Binding,
  isPure: boolean,
): void {
  switch (target.kind) {
    // For module imports, we just push to them
    // to the module bindings
    case 'module': {
      const definition = getModuleDefinition(target.path);
      if (definition) {
        dependencies.modules.push(definition);
      }
      break;
    }
    // For params, we push them as mutable locals
    case 'param': {
      if (!isPure) {
        addLocalDependency(dependencies, target);
      }
      break;
    }
    case 'const':
    case 'let':
    case 'var': {
      extractDependenciesFromVariableDeclarator(dependencies, target, isPure);
      break;
    }
    case 'hoisted':
      break;
    case 'local':
    case 'unknown':
      break;
  }
}

export function getBindingDependencies(
  path: babel.NodePath,
  identifiers: Set<string>,
  isPure: boolean,
): Dependencies {
  const bindings: Dependencies = {
    modules: [],
    locals: [],
    mutations: [],
  };
  for (const identifier of identifiers) {
    const target = path.scope.getBinding(identifier);
    if (target) {
      extractDependency(bindings, target, isPure);
    } else {
      // TODO globals
    }
  }

  return bindings;
}

function patchIdentifier(
  dependencies: Dependencies,
  identifier: t.Identifier,
  path: babel.NodePath<t.Identifier | t.JSXIdentifier>,
): void {
  const binding = path.scope.getBinding(path.node.name);
  if (binding) {
    const localsIndex = dependencies.locals.indexOf(binding);
    if (localsIndex > -1) {
      path.replaceWith(
        t.memberExpression(
          t.memberExpression(identifier, t.identifier('l')),
          t.numericLiteral(localsIndex),
          true,
        ),
      );
      return;
    }
    const mutationsIndex = dependencies.mutations.indexOf(binding);
    if (mutationsIndex > -1) {
      path.replaceWith(
        t.memberExpression(
          t.memberExpression(identifier, t.identifier('m')),
          t.numericLiteral(mutationsIndex),
          true,
        ),
      );
    }
  }
}

function patchArrayPattern(
  dependencies: Dependencies,
  context: t.Identifier,
  path: babel.NodePath<t.ArrayPattern>,
): void {
  for (const element of path.get('elements')) {
    if (isPathValid(element, t.isLVal)) {
      patchLVal(dependencies, context, element);
    }
  }
}

function patchObjectPattern(
  dependencies: Dependencies,
  context: t.Identifier,
  path: babel.NodePath<t.ObjectPattern>,
): void {
  for (const property of path.get('properties')) {
    if (isPathValid(property, t.isRestElement)) {
      // {...rest} = foo;
      patchLVal(dependencies, context, property.get('argument'));
    } else if (isPathValid(property, t.isObjectProperty)) {
      const key = property.get('key');
      if (isPathValid(key, t.isIdentifier) && property.node.shorthand) {
        // { foo } = bar;
        patchLVal(dependencies, context, key);
        return;
      }
      const value = property.get('value');
      if (isPathValid(value, t.isLVal)) {
        patchLVal(dependencies, context, value);
      }
    }
  }
}

function patchLVal(
  dependencies: Dependencies,
  context: t.Identifier,
  path: babel.NodePath<t.LVal>,
): void {
  if (isPathValid(path, t.isArrayPattern)) {
    patchArrayPattern(dependencies, context, path);
  } else if (isPathValid(path, t.isAssignmentPattern)) {
    // [foo = bar] = baz;
    patchLVal(dependencies, context, path.get('left'));
  } else if (isPathValid(path, t.isIdentifier)) {
    patchIdentifier(dependencies, context, path);
  } else if (isPathValid(path, t.isObjectPattern)) {
    patchObjectPattern(dependencies, context, path);
  } else if (isPathValid(path, t.isRestElement)) {
    // {...rest} = foo;
    patchLVal(dependencies, context, path.get('argument'));
  } // TODO TS type casts
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
      const left = path.get('left');
      if (isPathValid(left, t.isLVal)) {
        patchLVal(dependencies, context, left);
      }
    },
    ForXStatement(path) {
      const left = path.get('left');
      if (isPathValid(left, t.isLVal)) {
        patchLVal(dependencies, context, left);
      }
    },
    UpdateExpression(path) {
      const id = unwrapPath(path.get('argument'), t.isIdentifier);
      if (id) {
        patchIdentifier(dependencies, context, id);
      }
    },
  });
}

function createVirtualFileName(ctx: StateContext) {
  return `./${ctx.path.base}?mode=${ctx.options.mode}&${ctx.options.key}=${ctx
    .virtual.count++}${ctx.path.ext}`;
}

export function getModuleImports(modules: ModuleDefinition[]): t.Statement[] {
  const statements: t.Statement[] = [];
  for (const mod of modules) {
    statements.push(moduleDefinitionToImportDeclaration(mod));
  }
  return statements;
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
  id: string,
  type: 'block' | 'function' | 'generator',
  rootFile: string | undefined,
  imported: ImportDefinition,
): string {
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
    const wrapper = t.identifier('wrapper');
    let keyword: string;
    if (type === 'block') {
      keyword = '$$wrapBlock';
    } else if (type === 'function') {
      keyword = '$$wrapFunction';
    } else {
      keyword = '$$wrapGenerator';
    }
    entryImports.push({
      kind: 'named',
      source: ctx.options.runtime,
      local: wrapper.name,
      imported: keyword,
    });
    args.push(t.callExpression(wrapper, [rootID]));
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
  if (dependencies.locals.length === 0 && dependencies.mutations.length === 0) {
    return t.exportDefaultDeclaration(root.node);
  }
  const path = root.get('body');

  const context = generateUniqueName(root, 'ctx');
  transformInnerReferences(path, context, dependencies);

  const newStatement = isPathValid(path, t.isExpression)
    ? t.blockStatement([t.returnStatement(path.node)])
    : (path.node as t.Statement);

  const statements = t.blockStatement([
    t.variableDeclaration('const', [
      t.variableDeclarator(
        context,
        t.callExpression(t.v8IntrinsicIdentifier(DISMANTLE_CONTEXT), []),
      ),
    ]),
    newStatement,
  ]);

  return t.exportDefaultDeclaration(
    t.isFunctionExpression(root.node)
      ? t.functionExpression(
          root.node.id,
          root.node.params,
          statements,
          root.node.generator,
          root.node.async,
        )
      : t.arrowFunctionExpression(
          root.node.params,
          statements,
          root.node.async,
        ),
  );
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
      t.objectExpression([
        t.objectProperty(
          t.identifier('l'),
          t.arrayExpression(dependencies.locals.map(id => id.identifier)),
        ),
        t.objectProperty(
          t.identifier('m'),
          t.arrayExpression(dependencies.mutations.map(id => id.identifier)),
        ),
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
                t.objectExpression([
                  t.objectProperty(
                    t.identifier('l'),
                    t.arrayExpression(
                      dependencies.locals.map(id => id.identifier),
                    ),
                  ),
                  t.objectProperty(
                    t.identifier('m'),
                    t.arrayExpression(
                      dependencies.mutations.map(id => id.identifier),
                    ),
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

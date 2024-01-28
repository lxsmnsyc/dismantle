import type * as babel from '@babel/core';
import type { Binding, BindingKind } from '@babel/traverse';
import * as t from '@babel/types';
import { HIDDEN_FUNC, HIDDEN_GENERATOR } from './hidden-imports';
import type {
  DirectiveDefinition,
  FunctionDefinition,
  ImportDefinition,
  ModuleDefinition,
  StateContext,
} from './types';
import assert from './utils/assert';
import { generateCode } from './utils/generator-shim';
import { getDescriptiveName } from './utils/get-descriptive-name';
import getForeignBindings from './utils/get-foreign-bindings';
import { getIdentifiersFromLVal } from './utils/get-identifiers-from-lval';
import { getImportIdentifier } from './utils/get-import-identifier';
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

interface ExtractedBindings {
  modules: ModuleDefinition[];
  locals: t.Identifier[];
  mutations: t.Identifier[];
}

function extractBindings(
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

function createRootFile(
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

function createEntryFile(
  ctx: StateContext,
  path: babel.NodePath,
  rootFile: string,
  imported: ImportDefinition,
): string {
  // Create an ID
  let id = `${ctx.blocks.hash}-${ctx.blocks.count++}`;
  if (ctx.options.env !== 'production') {
    id += `-${getDescriptiveName(path, 'anonymous')}`;
  }
  const entryID = path.scope.generateUidIdentifier('entry');
  const entryImports: ModuleDefinition[] = [
    {
      kind: imported.kind,
      source: imported.source,
      local: entryID.name,
      imported: imported.kind === 'named' ? imported.name : undefined,
    },
  ];
  const args: t.Expression[] = [t.stringLiteral(id)];
  if (ctx.options.mode === 'server') {
    const rootID = path.scope.generateUidIdentifier('root');
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

  const identifier = path.node.id || path.scope.generateUidIdentifier('func');
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
const BREAK_KEY = t.numericLiteral(0);
const CONTINUE_KEY = t.numericLiteral(1);
const RETURN_KEY = t.numericLiteral(2);
// If the function has no explicit return
const NO_HALT_KEY = t.numericLiteral(3);
const THROW_KEY = t.numericLiteral(4);
const YIELD_KEY = t.numericLiteral(5);

interface HaltingBlockResult {
  breaks: string[];
  breakCount: number;
  continues: string[];
  continueCount: number;
  hasReturn: boolean;
  hasYield: boolean;
}

function transformBlockContent(
  path: babel.NodePath<t.BlockStatement>,
  mutations: t.Identifier[],
): HaltingBlockResult {
  const target =
    path.scope.getFunctionParent() || path.scope.getProgramParent();

  const breaks: string[] = [];
  let breakCount = 0;
  const continues: string[] = [];
  let continueCount = 0;
  let hasReturn = false;
  let hasYield = false;

  const applyMutations = mutations.length
    ? path.scope.generateUidIdentifier('mutate')
    : undefined;

  // Transform the control flow statements
  path.traverse({
    BreakStatement(child) {
      const parent =
        child.scope.getFunctionParent() || child.scope.getProgramParent();
      if (parent === target) {
        const replacement: t.Expression[] = [BREAK_KEY];
        breakCount++;
        if (child.node.label) {
          const targetName = child.node.label.name;
          breaks.push(targetName);
          replacement.push(t.stringLiteral(targetName));
        } else {
          replacement.push(t.nullLiteral());
        }
        if (applyMutations) {
          replacement.push(t.callExpression(applyMutations, []));
        }
        child.replaceWith(t.returnStatement(t.arrayExpression(replacement)));
        child.skip();
      }
    },
    ContinueStatement(child) {
      const parent =
        child.scope.getFunctionParent() || child.scope.getProgramParent();
      if (parent === target) {
        const replacement: t.Expression[] = [CONTINUE_KEY];
        continueCount++;
        if (child.node.label) {
          const targetName = child.node.label.name;
          continues.push(targetName);
          replacement.push(t.stringLiteral(targetName));
        } else {
          replacement.push(t.nullLiteral());
        }
        if (applyMutations) {
          replacement.push(t.callExpression(applyMutations, []));
        }
        child.replaceWith(t.returnStatement(t.arrayExpression(replacement)));
        child.skip();
      }
    },
    ReturnStatement(child) {
      const parent =
        child.scope.getFunctionParent() || child.scope.getProgramParent();
      if (parent === target) {
        hasReturn = true;
        const arg = child.get('argument');
        arg.replaceWith(
          t.arrayExpression([
            RETURN_KEY,
            arg.node ? arg.node : t.nullLiteral(),
            applyMutations
              ? t.callExpression(applyMutations, [])
              : t.nullLiteral(),
          ]),
        );
      }
    },
    YieldExpression(child) {
      const parent =
        child.scope.getFunctionParent() || child.scope.getProgramParent();
      if (parent === target) {
        hasYield = true;
        if (child.node.delegate) {
          // TODO
        } else {
          const arg = child.get('argument');
          arg.replaceWith(
            t.arrayExpression([
              YIELD_KEY,
              arg.node ? arg.node : t.nullLiteral(),
              applyMutations
                ? t.callExpression(applyMutations, [])
                : t.nullLiteral(),
            ]),
          );
        }
      }
    },
  });

  const error = path.scope.generateUidIdentifier('error');

  const throwResult: t.Expression[] = [THROW_KEY, error];
  const haltResult: t.Expression[] = [NO_HALT_KEY];

  if (applyMutations) {
    throwResult.push(t.callExpression(applyMutations, []));
    haltResult.push(t.nullLiteral());
    haltResult.push(t.callExpression(applyMutations, []));
  }

  const statements: t.Statement[] = [
    t.tryStatement(
      t.blockStatement(path.node.body),
      t.catchClause(
        error,
        t.blockStatement([t.returnStatement(t.arrayExpression(throwResult))]),
      ),
    ),
    t.returnStatement(t.arrayExpression(haltResult)),
  ];

  if (applyMutations) {
    statements.unshift(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          applyMutations,
          t.arrowFunctionExpression(
            [],
            t.objectExpression(
              mutations.map(item => t.objectProperty(item, item, false, true)),
            ),
          ),
        ),
      ]),
    );
  }

  path.node.body = statements;
  return { breaks, continues, hasReturn, hasYield, breakCount, continueCount };
}

/**
 * This generates a chain of if-statements that checks the
 * received server return (which is transformed from the original block's
 * server statement)
 * Each if-statement matches an specific label, assuming that the original
 * break statement is a labeled break statement.
 * Otherwise, the output code is either a normal break statement or none.
 */
function getBreakCheck(
  returnType: t.Identifier,
  returnResult: t.Identifier,
  breakCount: number,
  breaks: string[],
  check: t.Statement | undefined,
): t.Statement | undefined {
  let current: t.Statement | undefined;
  if (breakCount !== breaks.length) {
    current = t.blockStatement([t.breakStatement()]);
  }
  for (let i = 0, len = breaks.length; i < len; i++) {
    const target = breaks[i];
    current = t.blockStatement([
      t.ifStatement(
        t.binaryExpression('===', returnResult, t.stringLiteral(target)),
        t.blockStatement([t.breakStatement(t.identifier(target))]),
        current,
      ),
    ]);
  }
  if (current) {
    return t.ifStatement(
      t.binaryExpression('===', returnType, BREAK_KEY),
      current,
      check,
    );
  }
  return check;
}

/**
 * This generates a chain of if-statements that checks the
 * received server return (which is transformed from the original block's
 * server statement)
 * Each if-statement matches an specific label, assuming that the original
 * continue statement is a labeled continue statement.
 * Otherwise, the output code is either a normal continue statement or none.
 */
function getContinueCheck(
  returnType: t.Identifier,
  returnResult: t.Identifier,
  continueCount: number,
  continues: string[],
  check: t.Statement | undefined,
): t.Statement | undefined {
  let current: t.Statement | undefined;
  if (continueCount !== continues.length) {
    current = t.blockStatement([t.continueStatement()]);
  }
  for (let i = 0, len = continues.length; i < len; i++) {
    const target = continues[i];
    current = t.blockStatement([
      t.ifStatement(
        t.binaryExpression('===', returnResult, t.stringLiteral(target)),
        t.blockStatement([t.continueStatement(t.identifier(target))]),
        current,
      ),
    ]);
  }
  if (current) {
    return t.ifStatement(
      t.binaryExpression('===', returnType, CONTINUE_KEY),
      current,
      check,
    );
  }
  return check;
}

function getGeneratorReplacementForServerBlock(
  path: babel.NodePath,
  registerID: t.Identifier,
  args: (t.Identifier | t.SpreadElement | t.ArrayExpression)[],
): [replacements: t.Statement[], step: t.Identifier] {
  const iterator = path.scope.generateUidIdentifier('iterator');
  const step = path.scope.generateUidIdentifier('step');
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

function getBlockReplacement(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  entryFile: string,
  bindings: ExtractedBindings,
  halting: HaltingBlockResult,
) {
  // Move to the replacement for the server block,
  // declare the type and result based from transformBlockContent
  const returnType = path.scope.generateUidIdentifier('type');
  const returnResult = path.scope.generateUidIdentifier('result');
  const returnMutations = path.scope.generateUidIdentifier('mutations');
  let check: t.Statement | undefined;
  // If the block has a return, we need to make sure that the
  // replacement does too.
  if (halting.hasReturn) {
    check = t.ifStatement(
      t.binaryExpression('===', returnType, RETURN_KEY),
      t.blockStatement([t.returnStatement(returnResult)]),
      check,
    );
  }
  // If the block has a break, we also do it.
  if (halting.breakCount > 0) {
    check = getBreakCheck(
      returnType,
      returnResult,
      halting.breakCount,
      halting.breaks,
      check,
    );
  }
  // If the block has a continue, we also do it.
  if (halting.continueCount > 0) {
    check = getContinueCheck(
      returnType,
      returnResult,
      halting.continueCount,
      halting.continues,
      check,
    );
  }
  const replacement: t.Statement[] = [];
  if (halting.hasYield) {
    const blockID = path.scope.generateUidIdentifier('block');
    replacement.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          blockID,
          t.callExpression(getImportIdentifier(ctx, path, HIDDEN_GENERATOR), [
            t.memberExpression(
              t.awaitExpression(t.importExpression(t.stringLiteral(entryFile))),
              t.identifier('default'),
            ),
            bindings.mutations.length
              ? t.arrowFunctionExpression(
                  [returnMutations],
                  t.assignmentExpression(
                    '=',
                    t.objectPattern(
                      bindings.mutations.map(item =>
                        t.objectProperty(item, item, false, true),
                      ),
                    ),
                    returnMutations,
                  ),
                )
              : t.nullLiteral(),
          ]),
        ),
      ]),
    );
    const [reps, step] = getGeneratorReplacementForServerBlock(
      path,
      blockID,
      bindings.locals,
    );
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
              t.callExpression(getImportIdentifier(ctx, path, HIDDEN_FUNC), [
                t.memberExpression(
                  t.awaitExpression(
                    t.importExpression(t.stringLiteral(entryFile)),
                  ),
                  t.identifier('default'),
                ),
                bindings.mutations.length
                  ? t.arrowFunctionExpression(
                      [returnMutations],
                      t.assignmentExpression(
                        '=',
                        t.objectPattern(
                          bindings.mutations.map(item =>
                            t.objectProperty(item, item, false, true),
                          ),
                        ),
                        returnMutations,
                      ),
                    )
                  : t.nullLiteral(),
              ]),
              bindings.locals,
            ),
          ),
        ),
      ]),
    );
  }
  if (check) {
    replacement.push(check);
  }

  return t.blockStatement(replacement);
}

function replaceBlock(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  directive: DirectiveDefinition,
  bindings: ExtractedBindings,
): void {
  // Transform all control statements
  const halting = transformBlockContent(path, bindings.mutations);
  const rootFile = createRootFile(
    ctx,
    bindings,
    t.functionExpression(
      undefined,
      bindings.locals,
      t.blockStatement(path.node.body),
      halting.hasYield,
      true,
    ),
  );
  const entryFile = createEntryFile(ctx, path, rootFile, directive.target);
  path.replaceWith(
    getBlockReplacement(ctx, path, entryFile, bindings, halting),
  );
}

export function splitBlock(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  directive: DirectiveDefinition,
): void {
  replaceBlock(
    ctx,
    path,
    directive,
    extractBindings(
      ctx,
      path,
      getForeignBindings(path, 'block'),
      directive.pure,
    ),
  );
}

function transformFunctionContent(
  path: babel.NodePath<t.BlockStatement>,
  mutations: t.Identifier[],
): void {
  const target =
    path.scope.getFunctionParent() || path.scope.getProgramParent();

  const applyMutations = mutations.length
    ? path.scope.generateUidIdentifier('mutate')
    : undefined;

  // Transform the control flow statements
  path.traverse({
    ReturnStatement(child) {
      const parent =
        child.scope.getFunctionParent() || child.scope.getProgramParent();
      if (parent === target) {
        const replacement: t.Expression[] = [RETURN_KEY];
        if (child.node.argument) {
          replacement.push(child.node.argument);
        } else {
          replacement.push(t.nullLiteral());
        }
        if (applyMutations) {
          replacement.push(t.callExpression(applyMutations, []));
        }
        child.replaceWith(t.returnStatement(t.arrayExpression(replacement)));
        child.skip();
      }
    },
  });

  const error = path.scope.generateUidIdentifier('error');

  const throwResult: t.Expression[] = [THROW_KEY, error];
  const haltResult: t.Expression[] = [NO_HALT_KEY];

  if (applyMutations) {
    throwResult.push(t.callExpression(applyMutations, []));
    haltResult.push(t.nullLiteral());
    haltResult.push(t.callExpression(applyMutations, []));
  }

  const statements: t.Statement[] = [
    t.tryStatement(
      t.blockStatement(path.node.body),
      t.catchClause(
        error,
        t.blockStatement([t.returnStatement(t.arrayExpression(throwResult))]),
      ),
    ),
    t.returnStatement(t.arrayExpression(haltResult)),
  ];

  if (applyMutations) {
    statements.unshift(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          applyMutations,
          t.arrowFunctionExpression(
            [],
            t.objectExpression(
              mutations.map(item => t.objectProperty(item, item, false, true)),
            ),
          ),
        ),
      ]),
    );
  }

  path.node.body = statements;
}

function getFunctionReplacement(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  entryFile: string,
  bindings: ExtractedBindings,
): t.Expression {
  const rest = path.scope.generateUidIdentifier('rest');

  const returnType = path.scope.generateUidIdentifier('type');
  const returnResult = path.scope.generateUidIdentifier('result');
  const returnMutations = path.scope.generateUidIdentifier('mutations');

  const source = path.scope.generateUidIdentifier('source');

  const replacement: t.Statement[] = [];
  if (path.node.generator) {
    const funcID = path.scope.generateUidIdentifier('fn');
    replacement.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          funcID,
          t.callExpression(getImportIdentifier(ctx, path, HIDDEN_GENERATOR), [
            source,
            bindings.mutations.length
              ? t.arrowFunctionExpression(
                  [returnMutations],
                  t.assignmentExpression(
                    '=',
                    t.objectPattern(
                      bindings.mutations.map(item =>
                        t.objectProperty(item, item, false, true),
                      ),
                    ),
                    returnMutations,
                  ),
                )
              : t.nullLiteral(),
          ]),
        ),
      ]),
    );
    const [reps, step] = getGeneratorReplacementForServerBlock(path, funcID, [
      t.arrayExpression(bindings.locals),
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
              t.callExpression(getImportIdentifier(ctx, path, HIDDEN_FUNC), [
                source,
                bindings.mutations.length
                  ? t.arrowFunctionExpression(
                      [returnMutations],
                      t.assignmentExpression(
                        '=',
                        t.objectPattern(
                          bindings.mutations.map(item =>
                            t.objectProperty(item, item, false, true),
                          ),
                        ),
                        returnMutations,
                      ),
                    )
                  : t.nullLiteral(),
              ]),
              [t.arrayExpression(bindings.locals), t.spreadElement(rest)],
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

function replaceIsomorphicFunction(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  func: FunctionDefinition,
  bindings: ExtractedBindings,
): t.Expression {
  const body = path.get('body');
  if (isPathValid(body, t.isExpression)) {
    body.replaceWith(t.blockStatement([t.returnStatement(body.node)]));
  }
  assert(isPathValid(body, t.isBlockStatement), 'invariant');
}

function replaceFunction(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  func: FunctionDefinition,
  bindings: ExtractedBindings,
): t.Expression {
  const body = path.get('body');
  if (isPathValid(body, t.isExpression)) {
    body.replaceWith(t.blockStatement([t.returnStatement(body.node)]));
  }
  assert(isPathValid(body, t.isBlockStatement), 'invariant');
  transformFunctionContent(body, bindings.mutations);
  const rootFile = createRootFile(
    ctx,
    bindings,
    t.isFunctionExpression(path.node)
      ? t.functionExpression(
          path.node.id,
          [t.arrayPattern(bindings.locals), ...path.node.params],
          path.node.body,
          path.node.async,
          path.node.generator,
        )
      : t.arrowFunctionExpression(
          [t.arrayPattern(bindings.locals), ...path.node.params],
          path.node.body,
          path.node.async,
        ),
  );

  const entryFile = createEntryFile(ctx, path, rootFile, func.target);

  return getFunctionReplacement(ctx, path, entryFile, bindings);
}

export function splitFunction(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  func: FunctionDefinition,
): t.Expression {
  const bindings = extractBindings(
    ctx,
    path,
    getForeignBindings(path, 'function'),
    func.pure,
  );
  if (func.isomorphic) {
    return replaceIsomorphicFunction(ctx, path, func, bindings);
  }
  return replaceFunction(ctx, path, func, bindings);
}

function replaceExpression(
  ctx: StateContext,
  path: babel.NodePath<t.Expression>,
  func: FunctionDefinition,
  bindings: ExtractedBindings,
): t.Expression {
  const rootFile = createRootFile(ctx, bindings, path.node);
  const entryFile = createEntryFile(ctx, path, rootFile, func.target);

  const rest = path.scope.generateUidIdentifier('rest');
  const source = path.scope.generateUidIdentifier('source');

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
        t.arrowFunctionExpression(
          [t.restElement(rest)],
          t.callExpression(source, [t.spreadElement(rest)]),
          true,
        ),
      ),
    ]),
    true,
  );
}

export function splitExpression(
  ctx: StateContext,
  path: babel.NodePath<t.Expression>,
  func: FunctionDefinition,
): t.Expression {
  return replaceExpression(
    ctx,
    path,
    func,
    extractBindings(
      ctx,
      path,
      getForeignBindings(path, 'expression'),
      func.pure,
    ),
  );
}

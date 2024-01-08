import * as t from '@babel/types';
import * as babel from '@babel/core';
import { DirectiveDefinition, ModuleDefinition, StateContext } from './types';
import getForeignBindings from './utils/get-foreign-bindings';
import { Binding, BindingKind } from '@babel/traverse';
import { getDescriptiveName } from './utils/get-descriptive-name';
import generator from './utils/generator-shim';
import { getRootStatementPath } from './utils/get-root-statement-path';
import { getModuleDefinition } from './utils/get-module-definition';
import { isPathValid, unwrapPath } from './utils/unwrap';
import { getIdentifiersFromLVal } from './utils/get-identifiers-from-lval';

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
): void {
  if (target.kind === 'module') {
    modules.push(getModuleDefinition(target.path));
  } else if (target.kind === 'param') {
    locals.push(target.identifier);
  } else {
    const blockParent = target.path.scope.getBlockParent();
    const programParent = target.path.scope.getProgramParent();
    if (blockParent === programParent) {
      registerModuleLevelBinding(ctx, modules, binding, target);
    } else {
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
): ExtractedBindings {
  const modules: ModuleDefinition[] = [];
  const locals: t.Identifier[] = [];
  const mutations: t.Identifier[] = [];
  for (const binding of bindings) {
    const target = path.scope.getBinding(binding);
    if (target) {
      registerBinding(ctx, modules, locals, mutations, binding, target);
    }
  }

  return {
    modules,
    locals,
    mutations,
  };
}

function splitFunctionDeclaration(
  ctx: StateContext,
  path: babel.NodePath<t.FunctionDeclaration>,
): ModuleDefinition {
  const bindings = getForeignBindings(path, 'function');
  const { modules } = extractBindings(ctx, path, bindings);
  const file = ctx.options.getVirtualFileName(ctx.path, ctx.virtual.count++);
  const compiled = generator(
    t.program([
      ...moduleDefinitionsToImportDeclarations(modules),
      t.exportDefaultDeclaration(path.node),
    ]),
  );
  ctx.onVirtualFile(file, compiled.code);

  const statement = getRootStatementPath(path);

  const identifier = path.node.id || path.scope.generateUidIdentifier('func');
  const definition: ModuleDefinition = {
    kind: 'default',
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
  const file = ctx.options.getVirtualFileName(ctx.path, ctx.virtual.count++);
  const parent = path.parentPath.node as t.VariableDeclaration;
  const compiled = generator(
    t.program([
      ...moduleDefinitionsToImportDeclarations(modules),
      t.exportNamedDeclaration(t.variableDeclaration(parent.kind, [path.node])),
    ]),
  );
  ctx.onVirtualFile(file, compiled.code);
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

// These are internal code for the control flow of the server block
// The goal is to transform these into return statements, and the
// the return value with the associated control flow code.
// This allows the replacement statement for the server block to
// know what to do if it encounters the said statement on the server.
const BREAK_KEY = t.numericLiteral(0);
const CONTINUE_KEY = t.numericLiteral(1);
const RETURN_KEY = t.numericLiteral(2);
// If the function has no explicit return
const NO_HALT_KEY = t.numericLiteral(3);
const THROW_KEY = t.numericLiteral(4);

function transformHalting(
  path: babel.NodePath<t.BlockStatement>,
  mutations: t.Identifier[],
): {
  breaks: string[];
  breakCount: number;
  continues: string[];
  continueCount: number;
  hasReturn: boolean;
  hasYield: boolean;
} {
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
    YieldExpression(child) {
      const parent =
        child.scope.getFunctionParent() || child.scope.getProgramParent();
      if (parent === target) {
        hasYield = true;
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

// This generates a chain of if-statements that checks the
// received server return (which is transformed from the original block's
// server statement)
// Each if-statement matches an specific label, assuming that the original
// break statement is a labeled break statement.
// Otherwise, the output code is either a normal break statement or none.
function getBreakCheck(
  returnType: t.Identifier,
  returnResult: t.Identifier,
  breakCount: number,
  breaks: string[],
  check: t.Statement,
): t.Statement {
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

// This generates a chain of if-statements that checks the
// received server return (which is transformed from the original block's
// server statement)
// Each if-statement matches an specific label, assuming that the original
// continue statement is a labeled continue statement.
// Otherwise, the output code is either a normal continue statement or none.
function getContinueCheck(
  returnType: t.Identifier,
  returnResult: t.Identifier,
  continueCount: number,
  continues: string[],
  check: t.Statement,
): t.Statement {
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
  path: babel.NodePath<t.BlockStatement>,
  registerID: t.Identifier,
  cloneArgs: t.Identifier[],
): [replacements: t.Statement[], step: t.Identifier] {
  const iterator = path.scope.generateUidIdentifier('iterator');
  const step = path.scope.generateUidIdentifier('step');
  const replacement: t.Statement[] = [
    t.variableDeclaration('let', [
      t.variableDeclarator(step),
      // First, get the iterator by calling the generator
      t.variableDeclarator(
        iterator,
        t.awaitExpression(t.callExpression(registerID, cloneArgs)),
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
            t.callExpression(
              t.memberExpression(iterator, t.identifier('next')),
              [],
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

function replaceBlock(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  directive: DirectiveDefinition,
  bindings: ExtractedBindings,
): void {
  // Transform all control statements
  const halting = transformHalting(path, bindings.mutations);
  // Create an ID
  let id = `${ctx.blocks.hash}-${ctx.blocks.count++}`;
  if (ctx.options.env !== 'production') {
    id += `-${getDescriptiveName(path, 'anonymous')}`;
  }
  const args: t.Expression[] = [t.stringLiteral(id)];
  if (ctx.options.mode === 'server') {
    args.push(
      t.functionExpression(
        undefined,
        bindings.locals,
        t.blockStatement(path.node.body),
        halting.hasYield,
        true,
      ),
    );
  }
  // Create the registration call
  const registrationFile = ctx.options.getVirtualFileName(
    ctx.path,
    ctx.virtual.count++,
  );
  const registerID = path.scope.generateUidIdentifier('register');
  const registrationContent = generator(
    t.program([
      ...(ctx.options.mode === 'server'
        ? moduleDefinitionsToImportDeclarations(bindings.modules)
        : []),
      moduleDefinitionToImportDeclaration({
        kind: directive.import.kind,
        source: directive.import.source,
        local: registerID.name,
        imported:
          directive.import.kind === 'named' ? directive.import.name : undefined,
      }),
      t.exportDefaultDeclaration(t.callExpression(registerID, args)),
    ]),
  );
  ctx.onEntryFile(registrationFile);
  ctx.onVirtualFile(registrationFile, registrationContent.code);

  // Move to the replacement for the server block,
  // declare the type and result based from transformHalting
  const returnType = path.scope.generateUidIdentifier('type');
  const returnResult = path.scope.generateUidIdentifier('result');
  const returnMutations = path.scope.generateUidIdentifier('mutations');
  let check: t.Statement = t.ifStatement(
    t.binaryExpression('===', returnType, THROW_KEY),
    t.blockStatement([t.throwStatement(returnResult)]),
  );
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

  const blockID = path.scope.generateUidIdentifier('block');
  // If the server block happens to be declared in a generator
  const replacement: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        blockID,
        t.memberExpression(
          t.awaitExpression(
            t.importExpression(t.stringLiteral(registrationFile)),
          ),
          t.identifier('default'),
        ),
      ),
    ]),
  ];
  if (halting.hasYield) {
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
          t.arrayPattern([returnType, returnResult, returnMutations]),
          t.memberExpression(step, t.identifier('value')),
        ),
      ]),
    );
  } else {
    replacement.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.arrayPattern([returnType, returnResult, returnMutations]),
          t.awaitExpression(t.callExpression(blockID, bindings.locals)),
        ),
      ]),
    );
  }
  if (bindings.mutations.length) {
    replacement.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.objectPattern(
            bindings.mutations.map(item =>
              t.objectProperty(item, item, false, true),
            ),
          ),
          returnMutations,
        ),
      ),
    );
  }
  if (check) {
    replacement.push(check);
  }
  path.replaceWith(t.blockStatement(replacement));
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
    extractBindings(ctx, path, getForeignBindings(path, 'block')),
  );
}

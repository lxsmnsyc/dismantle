import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { HIDDEN_FUNC, HIDDEN_GENERATOR } from './hidden-imports';
import type { ExtractedBindings } from './split';
import {
  NO_HALT_KEY,
  RETURN_KEY,
  THROW_KEY,
  createEntryFile,
  createRootFile,
  extractBindings,
  getGeneratorReplacementForBlock,
} from './split';
import type { FunctionCallDefinition, StateContext } from './types';
import assert from './utils/assert';
import getForeignBindings from './utils/get-foreign-bindings';
import { getImportIdentifier } from './utils/get-import-identifier';
import { isPathValid } from './utils/unwrap';

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
    const [reps, step] = getGeneratorReplacementForBlock(path, funcID, [
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
  func: FunctionCallDefinition,
  bindings: ExtractedBindings,
): t.Expression {
  const body = path.get('body');
  if (isPathValid(body, t.isExpression)) {
    body.replaceWith(t.blockStatement([t.returnStatement(body.node)]));
  }
  assert(isPathValid(body, t.isBlockStatement), 'invariant');
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
  const entryFile = createEntryFile(
    ctx,
    path,
    rootFile,
    func.target,
    func.isomorphic,
  );

  const source = path.scope.generateUidIdentifier('source');
  const rest = path.scope.generateUidIdentifier('rest');

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
          t.callExpression(source, [
            t.arrayExpression(bindings.locals),
            t.spreadElement(rest),
          ]),
          path.node.async,
        ),
      ),
    ]),
    true,
  );
}

function replaceFunctionFromCall(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  func: FunctionCallDefinition,
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
  const entryFile = createEntryFile(
    ctx,
    path,
    rootFile,
    func.target,
    func.isomorphic,
  );

  return getFunctionReplacement(ctx, path, entryFile, bindings);
}

export function splitFunctionFromCall(
  ctx: StateContext,
  path: babel.NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  func: FunctionCallDefinition,
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
  return replaceFunctionFromCall(ctx, path, func, bindings);
}

function replaceExpressionFromCall(
  ctx: StateContext,
  path: babel.NodePath<t.Expression>,
  func: FunctionCallDefinition,
  bindings: ExtractedBindings,
): t.Expression {
  const rootFile = createRootFile(ctx, bindings, path.node);
  const entryFile = createEntryFile(
    ctx,
    path,
    rootFile,
    func.target,
    func.isomorphic,
  );

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

export function splitExpressionFromCall(
  ctx: StateContext,
  path: babel.NodePath<t.Expression>,
  func: FunctionCallDefinition,
): t.Expression {
  return replaceExpressionFromCall(
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
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
import { generateUniqueName } from './utils/generate-unique-name';
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
    ? generateUniqueName(path, 'mutate')
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

  const error = generateUniqueName(path, 'error');

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
            getImportIdentifier(ctx, path, {
              ...HIDDEN_GENERATOR,
              source: ctx.options.runtime,
            }),
            [
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
            ],
          ),
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
              t.callExpression(
                getImportIdentifier(ctx, path, {
                  ...HIDDEN_FUNC,
                  source: ctx.options.runtime,
                }),
                [
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
                ],
              ),
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
  const entryFile = createEntryFile(
    ctx,
    path,
    createRootFile(
      ctx,
      bindings,
      t.isFunctionExpression(path.node)
        ? t.functionExpression(
            path.node.id,
            [t.arrayPattern(bindings.locals), ...path.node.params],
            path.node.body,
            path.node.generator,
            path.node.async,
          )
        : t.arrowFunctionExpression(
            [t.arrayPattern(bindings.locals), ...path.node.params],
            path.node.body,
            path.node.async,
          ),
    ),
    func.target,
    func.idPrefix,
  );

  const source = generateUniqueName(path, 'source');
  const rest = generateUniqueName(path, 'rest');

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
  const entryFile = createEntryFile(
    ctx,
    path,
    ctx.options.mode === 'server' || func.isomorphic
      ? createRootFile(
          ctx,
          bindings,
          t.isFunctionExpression(path.node)
            ? t.functionExpression(
                path.node.id,
                [t.arrayPattern(bindings.locals), ...path.node.params],
                path.node.body,
                path.node.generator,
                path.node.async,
              )
            : t.arrowFunctionExpression(
                [t.arrayPattern(bindings.locals), ...path.node.params],
                path.node.body,
                path.node.async,
              ),
        )
      : undefined,
    func.target,
    func.idPrefix,
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
  const entryFile = createEntryFile(
    ctx,
    path,
    ctx.options.mode === 'server' || func.isomorphic
      ? createRootFile(ctx, bindings, path.node)
      : undefined,
    func.target,
    func.idPrefix,
  );

  const rest = generateUniqueName(path, 'rest');
  const source = generateUniqueName(path, 'source');

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

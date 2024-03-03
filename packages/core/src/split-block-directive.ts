import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { HIDDEN_FUNC, HIDDEN_GENERATOR } from './hidden-imports';
import type { ExtractedBindings } from './split';
import {
  BREAK_KEY,
  CONTINUE_KEY,
  NO_HALT_KEY,
  RETURN_KEY,
  THROW_KEY,
  YIELD_KEY,
  createEntryFile,
  createRootFile,
  extractBindings,
  getGeneratorReplacementForBlock,
} from './split';
import type { BlockDirectiveDefinition, StateContext } from './types';
import { generateUniqueName } from './utils/generate-unique-name';
import getForeignBindings from './utils/get-foreign-bindings';
import { getImportIdentifier } from './utils/get-import-identifier';

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
    ? generateUniqueName(path, 'mutate')
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

function getBlockDirectiveReplacement(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  entryFile: string,
  bindings: ExtractedBindings,
  halting: HaltingBlockResult,
) {
  // Move to the replacement for the server block,
  // declare the type and result based from transformBlockContent
  const returnType = generateUniqueName(path, 'type');
  const returnResult = generateUniqueName(path, 'result');
  const returnMutations = generateUniqueName(path, 'mutations');
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
    const blockID = generateUniqueName(path, 'block');
    replacement.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          blockID,
          t.callExpression(
            getImportIdentifier(ctx, path, {
              ...HIDDEN_GENERATOR,
              source: ctx.options.runtime,
            }),
            [
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
            ],
          ),
        ),
      ]),
    );
    const [reps, step] = getGeneratorReplacementForBlock(
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
              t.callExpression(
                getImportIdentifier(ctx, path, {
                  ...HIDDEN_FUNC,
                  source: ctx.options.runtime,
                }),
                [
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
                ],
              ),
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

function replaceBlockDirective(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  directive: BlockDirectiveDefinition,
  bindings: ExtractedBindings,
): void {
  // Transform all control statements
  const halting = transformBlockContent(path, bindings.mutations);
  const entryFile = createEntryFile(
    ctx,
    path,
    ctx.options.mode === 'server' || directive.isomorphic
      ? createRootFile(
          ctx,
          bindings,
          t.functionExpression(
            undefined,
            bindings.locals,
            t.blockStatement(path.node.body),
            halting.hasYield,
            true,
          ),
        )
      : undefined,
    directive.target,
    directive.idPrefix,
  );
  path.replaceWith(
    getBlockDirectiveReplacement(ctx, path, entryFile, bindings, halting),
  );
}

export function splitBlockDirective(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  directive: BlockDirectiveDefinition,
): void {
  replaceBlockDirective(
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

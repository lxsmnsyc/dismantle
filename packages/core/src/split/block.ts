import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { BlockDirectiveDefinition, StateContext } from '../types';
import assert from '../utils/assert';
import { generateUniqueName } from '../utils/generate-unique-name';
import { createClosureArray, createUpdater, getRuntimeIdentifier, importEntry } from './caller';
import { type Closure, analyzeClosure } from './closure';
import {
  BREAK_CODE,
  CALL_BLOCK,
  CALL_BLOCK_GENERATOR,
  CONTINUE_CODE,
  RETURN_CODE,
  WRAP_BLOCK,
  WRAP_BLOCK_GENERATOR,
} from './constants';
import { type ControlFlow, rewriteBlockControlFlow } from './control-flow';
import { createEntryFile, createRootFile, createSplitID } from './files';
import { createRootProgram } from './root';

/**
 * `if (type === CODE) { if (result === "a") jump a; ...; jump; }`
 */
function createJumpCheck(
  type: t.Identifier,
  result: t.Identifier,
  code: number,
  labels: Set<string>,
  hasUnlabeled: boolean,
  createJump: (label?: t.Identifier) => t.Statement,
): t.Statement | undefined {
  if (!(labels.size || hasUnlabeled)) {
    return undefined;
  }
  const statements: t.Statement[] = [];
  for (const label of labels) {
    statements.push(
      t.ifStatement(
        t.binaryExpression('===', result, t.stringLiteral(label)),
        createJump(t.identifier(label)),
      ),
    );
  }
  if (hasUnlabeled) {
    statements.push(createJump());
  }
  return t.ifStatement(
    t.binaryExpression('===', type, t.numericLiteral(code)),
    t.blockStatement(statements),
  );
}

/**
 * ```js
 * const [type, result] = await $$callBlock(source, closure, update);
 * if (type === RETURN) return result;
 * if (type === BREAK) { ... }
 * if (type === CONTINUE) { ... }
 * ```
 */
function createReplacement(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  closure: Closure,
  flow: ControlFlow,
  entryFile: string,
): t.Statement[] {
  const call = t.callExpression(
    getRuntimeIdentifier(ctx, path, flow.hasYield ? CALL_BLOCK_GENERATOR : CALL_BLOCK),
    [importEntry(entryFile), createClosureArray(closure), createUpdater(path, closure)],
  );
  const invoke = flow.hasYield ? t.yieldExpression(call, true) : t.awaitExpression(call);

  const type = generateUniqueName(path, 'type');
  const result = generateUniqueName(path, 'result');
  const checks: t.Statement[] = [];

  if (flow.hasReturn) {
    checks.push(
      t.ifStatement(
        t.binaryExpression('===', type, t.numericLiteral(RETURN_CODE)),
        t.returnStatement(result),
      ),
    );
  }
  const breakCheck = createJumpCheck(
    type,
    result,
    BREAK_CODE,
    flow.breakLabels,
    flow.hasBreak,
    (label) => t.breakStatement(label),
  );
  if (breakCheck) {
    checks.push(breakCheck);
  }
  const continueCheck = createJumpCheck(
    type,
    result,
    CONTINUE_CODE,
    flow.continueLabels,
    flow.hasContinue,
    (label) => t.continueStatement(label),
  );
  if (continueCheck) {
    checks.push(continueCheck);
  }

  if (!checks.length) {
    return [t.expressionStatement(invoke)];
  }
  return [
    t.variableDeclaration('const', [t.variableDeclarator(t.arrayPattern([type, result]), invoke)]),
    ...checks,
  ];
}

export function splitBlockDirective(
  ctx: StateContext,
  path: babel.NodePath<t.BlockStatement>,
  definition: BlockDirectiveDefinition,
): t.Statement[] {
  const closure = analyzeClosure(path, !!definition.pure);
  const id = createSplitID(ctx, path, definition.idPrefix);

  const { program, target } = createRootProgram(closure, (clone) => {
    assert(t.isBlockStatement(clone), 'invariant');
    return t.functionExpression(undefined, [], clone, false, true);
  });
  // The control flow is needed on both sides: the root file returns it,
  // and the caller handles it.
  const flow = rewriteBlockControlFlow(program, target);

  const rootFile =
    ctx.options.mode === 'server' || definition.isomorphic
      ? createRootFile(ctx, program)
      : undefined;

  const entryFile = createEntryFile(
    ctx,
    id,
    flow.hasYield ? WRAP_BLOCK_GENERATOR : WRAP_BLOCK,
    rootFile,
    definition.target,
  );

  return createReplacement(ctx, path, closure, flow, entryFile);
}

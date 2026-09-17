import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { traverse } from '../utils/traverse';
import { BREAK_CODE, CONTINUE_CODE, RETURN_CODE } from './constants';

export interface ControlFlow {
  hasReturn: boolean;
  hasYield: boolean;
  hasBreak: boolean;
  hasContinue: boolean;
  breakLabels: Set<string>;
  continueLabels: Set<string>;
}

/**
 * Checks if a `break` or `continue` jumps to a statement inside the block.
 */
function isLocalJump(
  path: babel.NodePath<t.BreakStatement | t.ContinueStatement>,
  block: t.Node,
): boolean {
  const label = path.node.label?.name;
  let current: babel.NodePath | null = path.parentPath;
  while (current && current.node !== block) {
    if (label) {
      if (current.isLabeledStatement() && current.node.label.name === label) {
        return true;
      }
    } else if (
      current.isLoop() ||
      (path.isBreakStatement() && current.isSwitchStatement())
    ) {
      return true;
    }
    current = current.parentPath;
  }
  return false;
}

function createResult(code: number, value?: t.Expression | null) {
  return t.arrayExpression(
    value ? [t.numericLiteral(code), value] : [t.numericLiteral(code)],
  );
}

/**
 * Turns a split block (already wrapped in `block`) into a function whose
 * result tells the caller how to continue:
 *
 * - `return x` becomes `return [RETURN, x]`
 * - `break label` (leaving the block) becomes `return [BREAK, "label"]`
 * - `continue label` (leaving the block) becomes `return [CONTINUE, "label"]`
 * - `yield` is kept, the block becomes a generator.
 * - Falling through returns `undefined`.
 */
export function rewriteBlockControlFlow(
  program: t.Program,
  block: t.FunctionExpression,
): ControlFlow {
  const flow: ControlFlow = {
    hasReturn: false,
    hasYield: false,
    hasBreak: false,
    hasContinue: false,
    breakLabels: new Set(),
    continueLabels: new Set(),
  };
  const generated = new WeakSet<t.Node>();

  const jump = (
    path: babel.NodePath<t.BreakStatement | t.ContinueStatement>,
    code: number,
  ) => {
    if (isLocalJump(path, block)) {
      return;
    }
    const label = path.node.label?.name;
    const isBreak = code === BREAK_CODE;
    if (label) {
      (isBreak ? flow.breakLabels : flow.continueLabels).add(label);
    } else if (isBreak) {
      flow.hasBreak = true;
    } else {
      flow.hasContinue = true;
    }
    const replacement = t.returnStatement(
      createResult(code, label ? t.stringLiteral(label) : undefined),
    );
    generated.add(replacement);
    path.replaceWith(replacement);
  };

  traverse(t.file(program), {
    ReturnStatement(path) {
      if (
        generated.has(path.node) ||
        path.getFunctionParent()?.node !== block
      ) {
        return;
      }
      flow.hasReturn = true;
      path.node.argument = createResult(RETURN_CODE, path.node.argument);
    },
    YieldExpression(path) {
      if (path.getFunctionParent()?.node === block) {
        flow.hasYield = true;
      }
    },
    BreakStatement(path) {
      jump(path, BREAK_CODE);
    },
    ContinueStatement(path) {
      jump(path, CONTINUE_CODE);
    },
  });

  block.generator = flow.hasYield;

  return flow;
}

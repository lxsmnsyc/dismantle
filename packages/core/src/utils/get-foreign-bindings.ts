import type * as babel from '@babel/core';
import type { Scope } from '@babel/traverse';
import * as t from '@babel/types';
import { unwrapPath } from './unwrap';

type CheckType = 'block' | 'function';

interface ForeignBindingChecker {
  ids: Set<string>;
  root: Scope;
  mode: CheckType;
}

function isForeignBinding(
  checker: ForeignBindingChecker,
  current: Scope,
  name: string,
): boolean {
  if (current.hasGlobal(name)) {
    return false;
  }
  if (checker.root === current) {
    return true;
  }
  if (current.hasOwnBinding(name)) {
    if (checker.mode === 'block') {
      const binding = current.getBinding(name);
      return !!binding && binding.kind === 'param';
    }
    return false;
  }
  if (current.parent) {
    return isForeignBinding(checker, current.parent, name);
  }
  return true;
}

function isInTypescript(path: babel.NodePath): boolean {
  let parent = path.parentPath;
  while (parent) {
    if (t.isTypeScript(parent.node) && !t.isExpression(parent.node)) {
      return true;
    }
    parent = parent.parentPath;
  }
  return false;
}

function checkArrayPattern(
  checker: ForeignBindingChecker,
  scope: Scope,
  node: t.ArrayPattern,
): void {
  for (const element of node.elements) {
    if (element && t.isLVal(element)) {
      checkLVal(checker, scope, element);
    }
  }
}

function checkIdentifier(
  checker: ForeignBindingChecker,
  scope: Scope,
  node: t.Identifier,
): void {
  if (isForeignBinding(checker, scope, node.name)) {
    checker.ids.add(node.name);
  }
}

function checkObjectPattern(
  checker: ForeignBindingChecker,
  scope: Scope,
  node: t.ObjectPattern,
): void {
  for (const property of node.properties) {
    if (t.isRestElement(property)) {
      // {...rest} = foo;
      checkLVal(checker, scope, property.argument);
    } else if (t.isIdentifier(property.key)) {
      if (property.shorthand) {
        // { foo } = bar;
        checkLVal(checker, scope, property.key);
      } else if (t.isLVal(property.value)) {
        // { foo: bar } = baz;
        checkLVal(checker, scope, property.value);
      }
    } else if (t.isLVal(property.value)) {
      // { foo: bar } = baz;
      checkLVal(checker, scope, property.value);
    }
  }
}

function checkLVal(
  checker: ForeignBindingChecker,
  scope: Scope,
  node: t.LVal,
): void {
  switch (node.type) {
    case 'ArrayPattern':
      checkArrayPattern(checker, scope, node);
      break;
    case 'AssignmentPattern':
      // [foo = bar] = baz;
      checkLVal(checker, scope, node.left);
      break;
    case 'Identifier':
      checkIdentifier(checker, scope, node);
      break;
    case 'MemberExpression':
      // TODO probably support object mutations
      break;
    case 'ObjectPattern':
      checkObjectPattern(checker, scope, node);
      break;
    case 'RestElement':
      checkLVal(checker, scope, node.argument);
      break;
    case 'TSAsExpression':
      // checkLVal(scope, node.expression)
      break;
    case 'TSSatisfiesExpression':
      // checkLVal(scope, node.expression)
      break;
    case 'TSNonNullExpression':
      // checkLVal(scope, node.expression)
      break;
    case 'TSTypeAssertion':
      // checkLVal(scope, node.expression)
      break;
    case 'TSParameterProperty':
      break;
  }
}

export default function getForeignBindings(
  path: babel.NodePath,
  mode: CheckType,
): Set<string> {
  const checker: ForeignBindingChecker = {
    ids: new Set(),
    root: path.isFunction() ? path.scope.parent : path.scope,
    mode,
  };

  path.traverse({
    ReferencedIdentifier(p) {
      // Check identifiers that aren't in a TS expression
      if (
        !isInTypescript(p) &&
        isForeignBinding(checker, p.scope, p.node.name)
      ) {
        checker.ids.add(p.node.name);
      }
    },
    AssignmentExpression(p) {
      if (t.isLVal(p.node.left)) {
        checkLVal(checker, p.scope, p.node.left);
      }
    },
    ForXStatement(p) {
      if (t.isLVal(p.node.left)) {
        checkLVal(checker, p.scope, p.node.left);
      }
    },
    UpdateExpression(p) {
      const id = unwrapPath(p.get('argument'), t.isIdentifier);
      if (id) {
        checkIdentifier(checker, p.scope, id.node);
      }
    },
  });

  return checker.ids;
}

import type * as babel from '@babel/core';
import type { Scope } from '@babel/traverse';
import * as t from '@babel/types';
import { unwrapPath } from './unwrap';

function isForeignBinding(
  source: Scope,
  current: Scope,
  name: string,
  mode: 'block' | 'function',
): boolean {
  if (current.hasGlobal(name)) {
    return false;
  }
  if (source === current) {
    return true;
  }
  if (current.hasOwnBinding(name)) {
    if (mode === 'block') {
      const binding = current.getBinding(name);
      return !!binding && binding.kind === 'param';
    }
    return false;
  }
  if (current.parent) {
    return isForeignBinding(source, current.parent, name, mode);
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

export default function getForeignBindings(
  path: babel.NodePath,
  mode: 'block' | 'function' | 'expression',
): Set<string> {
  const identifiers = new Set<string>();
  const rootScope = path.isFunction() ? path.scope.parent : path.scope;
  path.traverse({
    ReferencedIdentifier(p) {
      // Check identifiers that aren't in a TS expression
      if (
        !isInTypescript(p) &&
        (mode === 'expression'
          ? !path.scope.hasGlobal(p.node.name)
          : isForeignBinding(rootScope, p.scope, p.node.name, mode))
      ) {
        identifiers.add(p.node.name);
      }
    },
    AssignmentExpression(p) {
      const id = unwrapPath(p.get('left'), t.isIdentifier);
      if (id) {
        identifiers.add(id.node.name);
      }
    },
    UnaryExpression(p) {
      const id = unwrapPath(p.get('argument'), t.isIdentifier);
      if (id) {
        identifiers.add(id.node.name);
      }
    },
  });

  return identifiers;
}

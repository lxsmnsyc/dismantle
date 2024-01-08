import type * as babel from '@babel/core';
import * as t from '@babel/types';

function isForeignBinding(
  source: babel.NodePath,
  current: babel.NodePath,
  name: string,
  mode: 'block' | 'function',
): boolean {
  if (current.scope.hasGlobal(name)) {
    return false;
  }
  if (source === current) {
    return true;
  }
  if (current.scope.hasOwnBinding(name)) {
    if (mode === 'block') {
      const binding = current.scope.getBinding(name);
      return !!binding && binding.kind === 'param';
    }
    return false;
  }
  if (current.parentPath) {
    return isForeignBinding(source, current.parentPath, name, mode);
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
  path.traverse({
    ReferencedIdentifier(p) {
      // Check identifiers that aren't in a TS expression
      if (
        !isInTypescript(p) &&
        (mode === 'expression'
          ? !path.scope.hasGlobal(p.node.name)
          : isForeignBinding(path, p, p.node.name, mode))
      ) {
        identifiers.add(p.node.name);
      }
    },
  });

  return identifiers;
}

import type * as babel from '@babel/core';
import * as t from '@babel/types';
import { isNestedExpression } from './unwrap';

function getKeyName(
  key: t.Node,
  computed: boolean | null | undefined,
): string | undefined {
  if (t.isPrivateName(key)) {
    return key.id.name;
  }
  if (computed) {
    return undefined;
  }
  if (t.isIdentifier(key)) {
    return key.name;
  }
  if (t.isStringLiteral(key) && t.isValidIdentifier(key.value, false)) {
    return key.value;
  }
  return undefined;
}

function getMemberName(node: t.Node): string | undefined {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isMemberExpression(node)) {
    return getKeyName(node.property, node.computed);
  }
  return undefined;
}

/**
 * Infers the name of an anonymous value from where it is assigned.
 * Wrappers like `server$(...)`, `await` and type casts are skipped.
 */
function getInferredName(path: babel.NodePath): string | undefined {
  let current = path;
  let parent = path.parentPath;
  while (
    parent &&
    (isNestedExpression(parent.node) ||
      parent.isAwaitExpression() ||
      (parent.isCallExpression() && current.listKey === 'arguments'))
  ) {
    current = parent;
    parent = parent.parentPath;
  }
  if (!parent) {
    return undefined;
  }
  const node = parent.node;
  if (t.isVariableDeclarator(node) && current.key === 'init') {
    return getMemberName(node.id);
  }
  if (
    (t.isAssignmentExpression(node) || t.isAssignmentPattern(node)) &&
    current.key === 'right'
  ) {
    return getMemberName(node.left);
  }
  if (
    (t.isObjectProperty(node) ||
      t.isClassProperty(node) ||
      t.isClassPrivateProperty(node) ||
      t.isClassAccessorProperty(node)) &&
    current.key === 'value'
  ) {
    return getKeyName(node.key, 'computed' in node && node.computed);
  }
  return undefined;
}

/**
 * Returns the name a node adds to the hierarchy, if any.
 */
function getSegment(path: babel.NodePath): string | undefined {
  const node = path.node;
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return node.id?.name;
    case 'FunctionExpression':
    case 'ClassExpression':
      return node.id?.name ?? getInferredName(path);
    case 'ArrowFunctionExpression':
    case 'ObjectExpression':
      return getInferredName(path);
    case 'ObjectMethod':
    case 'ClassMethod':
    case 'ClassPrivateMethod':
      return getKeyName(node.key, node.computed);
    default:
      return undefined;
  }
}

/**
 * Builds a dotted name from the named functions, classes and objects
 * that contain `path` (including `path` itself).
 *
 * For example, a function `bar` declared in a function `foo` is `foo.bar`.
 */
export function getHierarchicalName(path: babel.NodePath): string | undefined {
  const segments: string[] = [];
  let current: babel.NodePath | null = path;
  while (current) {
    const segment = getSegment(current);
    if (segment) {
      segments.unshift(segment);
    }
    current = current.parentPath;
  }
  return segments.length ? segments.join('.') : undefined;
}

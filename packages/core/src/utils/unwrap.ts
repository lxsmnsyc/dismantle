import type * as babel from '@babel/core';
import type * as t from '@babel/types';

type TypeFilter<V extends t.Node> = (node: t.Node) => node is V;

function isNode(value: unknown): value is t.Node {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export function isPathValid<V extends t.Node>(
  path: unknown,
  key: TypeFilter<V>,
): path is babel.NodePath<V> {
  if (typeof path !== 'object' || path === null || !('node' in path)) {
    return false;
  }
  return isNode(path.node) && key(path.node);
}

export type NestedExpression =
  | t.ParenthesizedExpression
  | t.TypeCastExpression
  | t.TSAsExpression
  | t.TSSatisfiesExpression
  | t.TSNonNullExpression
  | t.TSInstantiationExpression
  | t.TSTypeAssertion;

export function isNestedExpression(node: t.Node): node is NestedExpression {
  switch (node.type) {
    case 'ParenthesizedExpression':
    case 'TypeCastExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
    case 'TSInstantiationExpression':
      return true;
    default:
      return false;
  }
}

export function unwrapNode<V extends t.Node>(node: t.Node, key: TypeFilter<V>): V | undefined {
  if (key(node)) {
    return node;
  }
  if (isNestedExpression(node)) {
    return unwrapNode(node.expression, key);
  }
  return undefined;
}

export function unwrapPath<V extends t.Node>(
  path: unknown,
  key: TypeFilter<V>,
): babel.NodePath<V> | undefined {
  if (isPathValid(path, key)) {
    return path;
  }
  if (isPathValid(path, isNestedExpression)) {
    return unwrapPath(path.get('expression'), key);
  }
  return undefined;
}

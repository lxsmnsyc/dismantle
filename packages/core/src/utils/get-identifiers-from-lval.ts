import * as t from '@babel/types';

function getIdentifiersFromArrayPattern(node: t.ArrayPattern): string[] {
  const ids: string[] = [];
  for (let i = 0, len = node.elements.length; i < len; i++) {
    const el = node.elements[i];
    if (el) {
      ids.push(...getIdentifiersFromLVal(el));
    }
  }
  return ids;
}

function getIdentifiersFromObjectPattern(node: t.ObjectPattern): string[] {
  const ids: string[] = [];
  for (let i = 0, len = node.properties.length; i < len; i++) {
    const el = node.properties[i];
    if (el) {
      if (el.type === 'RestElement') {
        ids.push(...getIdentifiersFromLVal(el));
      } else if (t.isLVal(el.value)) {
        ids.push(...getIdentifiersFromLVal(el.value));
      }
    }
  }
  return ids;
}

export function getIdentifiersFromLVal(node: t.LVal): string[] {
  switch (node.type) {
    case 'Identifier':
      return [node.name];
    case 'ArrayPattern':
      return getIdentifiersFromArrayPattern(node);
    case 'AssignmentPattern':
      return getIdentifiersFromLVal(node.left);
    case 'ObjectPattern':
      return getIdentifiersFromObjectPattern(node);
    case 'RestElement':
      return getIdentifiersFromLVal(node.argument);
    default:
      return [];
  }
}

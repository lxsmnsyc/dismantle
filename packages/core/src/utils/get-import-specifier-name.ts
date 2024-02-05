import * as t from '@babel/types';

export function getImportSpecifierName(node: t.ImportSpecifier) {
  if (t.isIdentifier(node.imported)) {
    return node.imported.name;
  }
  return node.imported.value;
}

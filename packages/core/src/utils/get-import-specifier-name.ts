import type * as t from '@babel/types';

export function getImportSpecifierName(node: t.ImportSpecifier) {
  switch (node.imported.type) {
    case 'Identifier':
      return node.imported.name;
    case 'StringLiteral':
      return node.imported.value;
  }
}

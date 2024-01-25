import * as t from '@babel/types';
import type * as babel from '@babel/core';
import assert from './assert';
import { getImportSpecifierName } from './get-import-specifier-name';
import type { ModuleDefinition } from '../types';
import { isPathValid } from './unwrap';

export function getModuleDefinition(path: babel.NodePath): ModuleDefinition {
  assert(
    isPathValid(path, t.isImportSpecifier) ||
      isPathValid(path, t.isImportDefaultSpecifier) ||
      isPathValid(path, t.isImportNamespaceSpecifier),
    'invariant',
  );
  const parent =
    path.getStatementParent() as babel.NodePath<t.ImportDeclaration>;
  const source = parent.node.source.value;
  switch (path.node.type) {
    case 'ImportDefaultSpecifier':
      return {
        source,
        kind: 'default',
        local: path.node.local.name,
      };
    case 'ImportNamespaceSpecifier':
      return {
        source,
        kind: 'namespace',
        local: path.node.local.name,
      };
    case 'ImportSpecifier': {
      const imported = getImportSpecifierName(path.node);
      if (imported === 'default') {
        return {
          source,
          kind: 'default',
          local: path.node.local.name,
          imported: '',
        };
      }
      return {
        source,
        kind: 'named',
        local: path.node.local.name,
        imported,
      };
    }
  }
}

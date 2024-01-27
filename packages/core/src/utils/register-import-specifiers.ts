import type * as babel from '@babel/core';
import * as t from '@babel/types';
import type { FunctionDefinition, StateContext } from '../types';
import { getImportSpecifierName } from './get-import-specifier-name';

function registerImportSpecifier(
  ctx: StateContext,
  node:
    | t.ImportSpecifier
    | t.ImportDefaultSpecifier
    | t.ImportNamespaceSpecifier,
  definition: FunctionDefinition,
): void {
  if (t.isImportSpecifier(node)) {
    if (node.importKind === 'type' || node.importKind === 'typeof') {
      return;
    }
    const key = getImportSpecifierName(node);
    if (
      (definition.source.kind === 'named' && key === definition.source.name) ||
      (definition.source.kind === 'default' && key === 'default')
    ) {
      ctx.registrations.identifiers.set(node.local, definition);
    }
  }
  if (
    t.isImportDefaultSpecifier(node) &&
    definition.source.kind === 'default'
  ) {
    ctx.registrations.identifiers.set(node.local, definition);
  }
  if (t.isImportNamespaceSpecifier(node)) {
    let current = ctx.registrations.namespaces.get(node.local);
    if (!current) {
      current = [];
    }
    current.push(definition);
    ctx.registrations.namespaces.set(node.local, current);
  }
}

function registerImportDeclarationByDefinition(
  ctx: StateContext,
  path: babel.NodePath<t.ImportDeclaration>,
  definition: FunctionDefinition,
): void {
  for (let i = 0, len = path.node.specifiers.length; i < len; i++) {
    const specifier = path.node.specifiers[i];
    registerImportSpecifier(ctx, specifier, definition);
  }
}

export function registerImportSpecifiers(
  ctx: StateContext,
  programPath: babel.NodePath<t.Program>,
): void {
  const len = ctx.options.functions.length;
  if (!len) {
    return;
  }
  programPath.traverse({
    ImportDeclaration(path) {
      if (
        path.node.importKind === 'type' ||
        path.node.importKind === 'typeof'
      ) {
        return;
      }
      for (let i = 0; i < len; i++) {
        const func = ctx.options.functions[i];
        if (func.source.source === path.node.source.value) {
          registerImportDeclarationByDefinition(ctx, path, func);
        }
      }
    },
  });
}

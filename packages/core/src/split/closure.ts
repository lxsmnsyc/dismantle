import type * as babel from '@babel/core';
import type { Binding } from '@babel/traverse';
import * as t from '@babel/types';
import { generateUniqueName } from '../utils/generate-unique-name';
import { isPathValid, unwrapPath } from '../utils/unwrap';

export type ImportSpecifierPath = babel.NodePath<
  t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier
>;

export type ExtractableNode =
  | t.FunctionDeclaration
  | t.FunctionExpression
  | t.ArrowFunctionExpression
  | t.ClassDeclaration
  | t.ClassExpression;

export interface ExtractedFunction {
  binding: Binding;
  path: babel.NodePath<ExtractableNode>;
}

/**
 * Everything the split code needs from its surroundings.
 */
export interface Closure {
  /**
   * Import specifiers, re-imported by the root file.
   */
  imports: ImportSpecifierPath[];
  /**
   * Local values that the split code only reads.
   * They are sent to the remote side on every call.
   */
  values: Binding[];
  /**
   * Local variables that the split code writes to.
   * They are sent to the remote side and synced back after it runs.
   */
  mutables: Binding[];
  /**
   * Local functions and classes the split code depends on (directly or
   * transitively). Their code is copied into the root file instead of
   * being serialized.
   */
  functions: ExtractedFunction[];
  /**
   * The split target followed by every extracted function.
   */
  regions: babel.NodePath[];
  /**
   * Every identifier name that appears inside the regions.
   * Used to generate names that shadow nothing.
   */
  names: Set<string>;
  /**
   * Unbound names referenced inside the regions.
   */
  globals: Set<string>;
}

interface AnalysisState {
  pure: boolean;
  closure: Closure;
  captured: Set<Binding>;
  written: Set<Binding>;
  imports: Map<string, ImportSpecifierPath>;
  extracted: Set<Binding>;
}

function isWithin(path: babel.NodePath, ancestor: t.Node): boolean {
  let current: babel.NodePath | null = path;
  while (current) {
    if (current.node === ancestor) {
      return true;
    }
    current = current.parentPath;
  }
  return false;
}

function isInTypeAnnotation(path: babel.NodePath, region: t.Node): boolean {
  let current = path.parentPath;
  while (current && current.node !== region) {
    const node = current.node;
    if ((t.isTypeScript(node) || t.isFlow(node)) && !t.isExpression(node)) {
      return true;
    }
    current = current.parentPath;
  }
  return false;
}

function isValueIdentifier(path: babel.NodePath<t.Identifier>): boolean {
  const parent = path.parent;
  if (
    t.isLabeledStatement(parent) ||
    t.isBreakStatement(parent) ||
    t.isContinueStatement(parent)
  ) {
    return false;
  }
  const grandparent = path.parentPath?.parent;
  return (
    t.isReferenced(path.node, parent, grandparent) ||
    t.isBinding(path.node, parent, grandparent)
  );
}

/**
 * `this`, `super`, `arguments` and `new.target` only make sense if they
 * belong to a function that is copied along with the split code.
 */
function assertOwnContext(
  path: babel.NodePath,
  region: t.Node,
  keyword: string,
): void {
  let current = path.parentPath;
  while (current) {
    const node = current.node;
    const ownsContext =
      (t.isFunction(node) && !t.isArrowFunctionExpression(node)) ||
      t.isClassProperty(node) ||
      t.isClassPrivateProperty(node) ||
      t.isClassAccessorProperty(node) ||
      t.isStaticBlock(node);
    if (ownsContext) {
      return;
    }
    if (node === region) {
      break;
    }
    current = current.parentPath;
  }
  throw path.buildCodeFrameError(
    `"${keyword}" cannot be referenced across a split boundary.`,
  );
}

function getExtractableFunction(
  binding: Binding,
): babel.NodePath<ExtractableNode> | undefined {
  if (!binding.constant) {
    return undefined;
  }
  const path = binding.path;
  if (
    isPathValid(path, t.isFunctionDeclaration) ||
    isPathValid(path, t.isClassDeclaration)
  ) {
    return path;
  }
  // Named function and class expressions bind their own name
  if (
    binding.kind === 'local' &&
    (isPathValid(path, t.isFunctionExpression) ||
      isPathValid(path, t.isClassExpression))
  ) {
    return path;
  }
  if (
    isPathValid(path, t.isVariableDeclarator) &&
    t.isIdentifier(path.node.id)
  ) {
    const init = unwrapPath(path.get('init'), t.isExpression);
    if (
      init &&
      (isPathValid(init, t.isFunctionExpression) ||
        isPathValid(init, t.isArrowFunctionExpression) ||
        isPathValid(init, t.isClassExpression))
    ) {
      return init;
    }
  }
  return undefined;
}

function addImport(state: AnalysisState, binding: Binding): void {
  const path = binding.path;
  if (
    !(
      isPathValid(path, t.isImportSpecifier) ||
      isPathValid(path, t.isImportDefaultSpecifier) ||
      isPathValid(path, t.isImportNamespaceSpecifier)
    )
  ) {
    return;
  }
  const declaration = path.parent as t.ImportDeclaration;
  if (
    declaration.importKind === 'type' ||
    declaration.importKind === 'typeof' ||
    (t.isImportSpecifier(path.node) &&
      (path.node.importKind === 'type' || path.node.importKind === 'typeof'))
  ) {
    return;
  }
  const name = path.node.local.name;
  if (!state.imports.has(name)) {
    state.imports.set(name, path);
    state.closure.imports.push(path);
  }
}

function addReference(
  state: AnalysisState,
  region: t.Node,
  path: babel.NodePath<t.Identifier | t.JSXIdentifier>,
): void {
  const name = path.node.name;
  const binding = path.scope.getBinding(name);
  if (!binding) {
    if (name === 'arguments') {
      assertOwnContext(path, region, name);
    }
    state.closure.globals.add(name);
    return;
  }
  if (isWithin(binding.path, region)) {
    return;
  }
  if (binding.kind === 'module') {
    addImport(state, binding);
    return;
  }
  const extractable = getExtractableFunction(binding);
  if (extractable) {
    extractFunction(state, binding, extractable);
  } else if (!state.pure) {
    state.captured.add(binding);
  }
}

function addWrites(
  state: AnalysisState,
  region: t.Node,
  path: babel.NodePath,
  target: t.Node | null | undefined,
): void {
  if (!target) {
    return;
  }
  for (const name of Object.keys(t.getBindingIdentifiers(target))) {
    const binding = path.scope.getBinding(name);
    if (binding && !isWithin(binding.path, region)) {
      state.written.add(binding);
    }
  }
}

function analyzeRegion(state: AnalysisState, region: babel.NodePath): void {
  const node = region.node;
  state.closure.regions.push(region);

  region.traverse({
    Identifier(path) {
      state.closure.names.add(path.node.name);
      if (isValueIdentifier(path) && !isInTypeAnnotation(path, node)) {
        addReference(state, node, path);
      }
    },
    JSXIdentifier(path) {
      if (path.isReferencedIdentifier()) {
        state.closure.names.add(path.node.name);
        addReference(state, node, path);
      }
    },
    AssignmentExpression(path) {
      addWrites(state, node, path, path.node.left);
    },
    UpdateExpression(path) {
      addWrites(state, node, path, path.node.argument);
    },
    ForXStatement(path) {
      if (!t.isVariableDeclaration(path.node.left)) {
        addWrites(state, node, path, path.node.left);
      }
    },
    ThisExpression(path) {
      assertOwnContext(path, node, 'this');
    },
    Super(path) {
      assertOwnContext(path, node, 'super');
    },
    MetaProperty(path) {
      if (path.node.meta.name === 'new') {
        assertOwnContext(path, node, 'new.target');
      }
    },
  });
}

function extractFunction(
  state: AnalysisState,
  binding: Binding,
  path: babel.NodePath<ExtractableNode>,
): void {
  if (state.extracted.has(binding)) {
    return;
  }
  state.extracted.add(binding);
  state.closure.functions.push({ binding, path });
  analyzeRegion(state, path);
}

/**
 * Finds the binding a name resolves to at the split site, ignoring
 * bindings declared inside the target (they are gone after the split).
 */
function getVisibleBinding(
  target: babel.NodePath,
  name: string,
): Binding | undefined {
  let scope: babel.NodePath['scope'] | undefined = target.scope;
  while (scope) {
    const binding = scope.getOwnBinding(name);
    if (binding && !isWithin(binding.path, target.node)) {
      return binding;
    }
    scope = scope.parent;
  }
  return undefined;
}

/**
 * The caller reads captured bindings by name. A copied function can capture
 * a binding that is shadowed at the split site, so the shadowing binding
 * gets renamed.
 */
function unshadowCaptures(target: babel.NodePath, closure: Closure): void {
  for (const binding of [...closure.values, ...closure.mutables]) {
    const name = binding.identifier.name;
    const visible = getVisibleBinding(target, name);
    if (visible && visible !== binding) {
      const newName = generateUniqueName(target, name).name;
      visible.scope.rename(name, newName);
      closure.names.add(newName);
    }
  }
}

/**
 * Collects the dependencies of a split target.
 *
 * - Imports are re-imported.
 * - Local functions and classes are copied, and their own dependencies are
 *   collected as well.
 * - Every other local binding is captured by value. It is tracked as a
 *   mutable if the split code (or a copied function) writes to it.
 *
 * With `pure`, no value is captured. Functions are still copied.
 */
export function analyzeClosure(target: babel.NodePath, pure: boolean): Closure {
  const state: AnalysisState = {
    pure,
    closure: {
      imports: [],
      values: [],
      mutables: [],
      functions: [],
      regions: [],
      names: new Set(),
      globals: new Set(),
    },
    captured: new Set(),
    written: new Set(),
    imports: new Map(),
    extracted: new Set(),
  };

  analyzeRegion(state, target);

  for (const binding of state.captured) {
    if (state.written.has(binding)) {
      state.closure.mutables.push(binding);
    } else {
      state.closure.values.push(binding);
    }
  }

  unshadowCaptures(target, state.closure);

  return state.closure;
}

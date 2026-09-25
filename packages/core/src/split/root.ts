import type * as babel from '@babel/core';
import type { Binding } from '@babel/traverse';
import * as t from '@babel/types';
import assert from '../utils/assert';
import type { Closure } from './closure';

function createUniqueName(base: string, taken: Set<string>): string {
  let index = 1;
  let name: string;
  do {
    name = `${base}_${index++}`;
  } while (taken.has(name));
  taken.add(name);
  return name;
}

/**
 * Picks the name every captured binding gets inside the root file.
 * A binding keeps its name unless it would clash with an import,
 * a global, or another captured binding with the same name.
 */
function resolveNames(closure: Closure): Map<Binding, string> {
  const taken = new Set([...closure.names, ...closure.globals]);
  const owners = new Map<string, Binding | undefined>();
  for (const specifier of closure.imports) {
    owners.set(specifier.node.local.name, undefined);
  }
  for (const name of closure.globals) {
    owners.set(name, undefined);
  }

  const names = new Map<Binding, string>();
  const bindings = [
    ...closure.values,
    ...closure.mutables,
    ...closure.functions.map((fn) => fn.binding),
  ];
  for (const binding of bindings) {
    const name = binding.identifier.name;
    if (owners.has(name) && owners.get(name) !== binding) {
      names.set(binding, createUniqueName(name, taken));
    } else {
      owners.set(name, binding);
      names.set(binding, name);
    }
  }
  return names;
}

function isNameReference(path: babel.NodePath): boolean {
  const parent = path.parent;
  if (t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent)) {
    return false;
  }
  if (path.isJSXIdentifier()) {
    return path.isReferencedIdentifier();
  }
  const grandparent = path.parentPath?.parent;
  return (
    t.isReferenced(path.node, parent, grandparent) || t.isBinding(path.node, parent, grandparent)
  );
}

/**
 * Clones the regions with the resolved names applied.
 *
 * Renaming happens on the original AST (so scope information is accurate),
 * then the nodes get cloned and the original names get restored.
 */
function cloneRegions(closure: Closure, names: Map<Binding, string>): t.Node[] {
  const renames: [node: t.Identifier | t.JSXIdentifier, name: string][] = [];
  for (const [binding, name] of names) {
    const original = binding.identifier.name;
    if (name === original) {
      continue;
    }
    const visit = (path: babel.NodePath<t.Identifier | t.JSXIdentifier>): void => {
      if (
        path.node.name === original &&
        isNameReference(path) &&
        path.scope.getBinding(original) === binding
      ) {
        renames.push([path.node, name]);
      }
    };
    for (const region of closure.regions) {
      region.traverse({ Identifier: visit, JSXIdentifier: visit });
    }
  }

  const originals = renames.map(([node]) => node.name);
  for (const [node, name] of renames) {
    node.name = name;
  }
  const clones = closure.regions.map((region) => t.cloneNode(region.node, true, false));
  for (let i = 0, len = renames.length; i < len; i++) {
    renames[i][0].name = originals[i];
  }
  return clones;
}

function createImports(closure: Closure): t.ImportDeclaration[] {
  const declarations: t.ImportDeclaration[] = [];
  for (const specifier of closure.imports) {
    const parent = specifier.parent;
    assert(t.isImportDeclaration(parent), 'invariant');
    const declaration = t.importDeclaration(
      [t.cloneNode(specifier.node, true, false)],
      t.cloneNode(parent.source),
    );
    if (parent.attributes) {
      declaration.attributes = parent.attributes.map((attribute) => t.cloneNode(attribute));
    }
    declarations.push(declaration);
  }
  return declarations;
}

function getName(names: Map<Binding, string>, binding: Binding): string {
  const name = names.get(binding);
  assert(name, 'invariant');
  return name;
}

function identifiersOf(bindings: Binding[], names: Map<Binding, string>): t.Identifier[] {
  return bindings.map((binding) => t.identifier(getName(names, binding)));
}

export interface RootProgram<T extends t.Expression> {
  program: t.Program;
  target: T;
}

/**
 * Creates the root file's program:
 *
 * ```js
 * import { dep } from 'module';
 *
 * export default (closure) => {
 *   const [value] = closure[0];
 *   let [count] = closure[1];
 *   function helper() { count++; }
 *   return [
 *     async () => { helper(); return value; },
 *     () => [count],
 *   ];
 * };
 * ```
 *
 * The runtime calls the factory once per remote call, runs the target
 * and uses the second function to read the mutated variables back.
 */
export function createRootProgram<T extends t.Expression>(
  closure: Closure,
  createTarget: (clone: t.Node) => T,
): RootProgram<T> {
  const names = resolveNames(closure);
  const [targetClone, ...functionClones] = cloneRegions(closure, names);
  const target = createTarget(targetClone);

  const taken = new Set([...closure.names, ...closure.globals, ...names.values()]);
  const closureID = t.identifier(createUniqueName('closure', taken));

  const body: t.Statement[] = [];
  if (closure.values.length) {
    body.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.arrayPattern(identifiersOf(closure.values, names)),
          t.memberExpression(closureID, t.numericLiteral(0), true),
        ),
      ]),
    );
  }
  if (closure.mutables.length) {
    body.push(
      t.variableDeclaration('let', [
        t.variableDeclarator(
          t.arrayPattern(identifiersOf(closure.mutables, names)),
          t.memberExpression(closureID, t.numericLiteral(1), true),
        ),
      ]),
    );
  }

  // Function declarations are hoisted, so they go first.
  // Everything else is declared in reverse discovery order so that
  // a class is declared after the class it extends.
  const declarations: t.Statement[] = [];
  for (let i = 0, len = functionClones.length; i < len; i++) {
    const clone = functionClones[i];
    const name = getName(names, closure.functions[i].binding);
    if (t.isFunctionDeclaration(clone)) {
      body.push(clone);
    } else if (t.isClassDeclaration(clone)) {
      declarations.unshift(clone);
    } else {
      assert(t.isExpression(clone), 'invariant');
      declarations.unshift(
        t.variableDeclaration('const', [t.variableDeclarator(t.identifier(name), clone)]),
      );
    }
  }
  body.push(...declarations);

  body.push(
    t.returnStatement(
      t.arrayExpression([
        target,
        closure.mutables.length
          ? t.arrowFunctionExpression([], t.arrayExpression(identifiersOf(closure.mutables, names)))
          : t.nullLiteral(),
      ]),
    ),
  );

  const program = t.program([
    ...createImports(closure),
    t.exportDefaultDeclaration(
      t.arrowFunctionExpression(
        closure.values.length || closure.mutables.length ? [closureID] : [],
        t.blockStatement(body),
      ),
    ),
  ]);

  return { program, target };
}

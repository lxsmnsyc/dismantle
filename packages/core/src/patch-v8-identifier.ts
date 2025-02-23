import type * as babel from '@babel/core';
import _traverse from '@babel/traverse';
import type * as t from '@babel/types';
import {
  DISMANTLE_CONTEXT,
  DISMANTLE_FUNC,
  DISMANTLE_GEN,
  DISMANTLE_POP,
  DISMANTLE_PUSH,
  HIDDEN_CONTEXT,
  HIDDEN_FUNC,
  HIDDEN_GENERATOR,
  HIDDEN_POP,
  HIDDEN_PUSH,
} from './hidden-imports';
import type { StateContext } from './types';
import { getImportIdentifier } from './utils/get-import-identifier';

interface State {
  map: Map<string, t.Identifier>;
  runtime: string;
}

function getV8Replacement(
  ctx: State,
  path: babel.NodePath<t.V8IntrinsicIdentifier>,
): t.Identifier | undefined {
  switch (path.node.name) {
    case DISMANTLE_CONTEXT:
      return getImportIdentifier(ctx.map, path, {
        ...HIDDEN_CONTEXT,
        source: ctx.runtime,
      });
    case DISMANTLE_FUNC:
      return getImportIdentifier(ctx.map, path, {
        ...HIDDEN_FUNC,
        source: ctx.runtime,
      });
    case DISMANTLE_GEN:
      return getImportIdentifier(ctx.map, path, {
        ...HIDDEN_GENERATOR,
        source: ctx.runtime,
      });
    case DISMANTLE_POP:
      return getImportIdentifier(ctx.map, path, {
        ...HIDDEN_POP,
        source: ctx.runtime,
      });
    case DISMANTLE_PUSH:
      return getImportIdentifier(ctx.map, path, {
        ...HIDDEN_PUSH,
        source: ctx.runtime,
      });
    default:
      return undefined;
  }
}

const V8_PATCH: babel.Visitor<State> = {
  V8IntrinsicIdentifier(path, ctx) {
    const result = getV8Replacement(ctx, path);
    if (result) {
      path.replaceWith(result);
    }
  },
};

type TraverseShim = typeof _traverse;

// https://github.com/babel/babel/issues/15269
const traverse: TraverseShim =
  typeof _traverse !== 'function'
    ? (_traverse as unknown as { default: TraverseShim }).default
    : _traverse;

export function patchV8Identifier(ctx: StateContext, node: t.File) {
  traverse(node, V8_PATCH, undefined, {
    map: new Map(),
    runtime: ctx.options.runtime,
  });
}

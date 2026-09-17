import _traverse from '@babel/traverse';

type TraverseShim = typeof _traverse;

// https://github.com/babel/babel/issues/15269
export const traverse: TraverseShim =
  typeof _traverse !== 'function'
    ? (_traverse as unknown as { default: TraverseShim }).default
    : _traverse;

import _generator from '@babel/generator';
import type * as t from '@babel/types';
import type { CodeOutput } from '../types';

type GeneratorShim = typeof _generator;

// https://github.com/babel/babel/issues/15269
const generator: GeneratorShim =
  typeof _generator !== 'function'
    ? (_generator as unknown as { default: GeneratorShim }).default
    : _generator;

export function generateCode(id: string, node: t.Node): CodeOutput {
  const result = generator(node, {
    sourceMaps: true,
    sourceFileName: id,
  });
  return {
    code: result.code,
    map: result.map,
  };
}

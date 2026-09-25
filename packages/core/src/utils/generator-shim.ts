import _generator from '@babel/generator';
import type * as t from '@babel/types';
import type { CodeOutput } from '../types';
import { interopDefault } from './interop';

const generator = interopDefault(_generator);

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

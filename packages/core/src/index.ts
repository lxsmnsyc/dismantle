import * as babel from '@babel/core';
import path from 'path';
import type { Options, StateContext } from './types';
import assert from './utils/assert';
import { plugin } from './plugin';
import xxHash32 from './utils/xxhash32';

export interface Output {
  code: babel.BabelFileResult['code'];
  map: babel.BabelFileResult['map'];
  files: Map<string, string>;
}

export {
  NamedImportDefinition,
  DefaultImportDefinition,
  DirectiveDefinition,
  ImportDefinition,
  Options,
} from './types';

export async function compile(
  code: string,
  id: string,
  options: Options,
): Promise<Output> {
  const parsedPath = path.parse(id);

  const ctx: StateContext = {
    path: parsedPath,
    imports: new Map(),
    virtual: {
      files: new Map(),
      count: 0,
    },
    options,
    bindings: new Map(),
    blocks: {
      hash: xxHash32(id).toString(16),
      count: 0,
    },
  };

  const plugins: babel.ParserOptions['plugins'] = ['jsx'];

  if (/\.[mc]?tsx?$/i.test(id)) {
    plugins.push('typescript');
  }

  const result = await babel.transformAsync(code, {
    plugins: [[plugin, ctx]],
    parserOpts: {
      plugins,
    },
    filename: parsedPath.base,
    ast: false,
    sourceFileName: id,
    sourceMaps: true,
    configFile: false,
    babelrc: false,
  });

  assert(result, 'invariant');

  const files = new Map();

  for (const [key, value] of ctx.virtual.files) {
    files.set(path.join(parsedPath.dir, key), value);
  }

  return {
    code: result.code,
    map: result.map,
    files,
  };
}

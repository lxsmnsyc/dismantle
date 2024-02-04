import * as babel from '@babel/core';
import path from 'node:path';
import { plugin } from './plugin';
import type { CodeOutput, Options, StateContext } from './types';
import assert from './utils/assert';
import xxHash32 from './utils/xxhash32';

export interface Output extends CodeOutput {
  files: Map<string, CodeOutput>;
  entries: string[];
  roots: string[];
}

export type {
  BlockDirectiveDefinition,
  CodeOutput,
  DefaultImportDefinition,
  FunctionCallDefinition,
  FunctionDirectiveDefinition,
  ImportDefinition,
  NamedImportDefinition,
  Options,
} from './types';

export async function compile(
  id: string,
  code: string,
  options: Options,
): Promise<Output> {
  const parsedPath = path.parse(id);

  const entries: string[] = [];
  const roots: string[] = [];
  const files = new Map<string, CodeOutput>();

  const ctx: StateContext = {
    id,
    path: parsedPath,
    imports: new Map(),
    virtual: {
      count: 0,
    },
    options,
    bindings: new Map(),
    blocks: {
      hash: xxHash32(id).toString(16),
      count: 0,
    },
    onVirtualFile(current, content, mode) {
      const filePath = path.join(parsedPath.dir, current);
      files.set(path.join(parsedPath.dir, current), content);
      if (mode === 'entry') {
        entries.push(filePath);
      } else if (mode === 'root') {
        roots.push(filePath);
      }
    },
    registrations: {
      identifiers: new Map(),
      namespaces: new Map(),
    },
  };

  const plugins: babel.ParserOptions['plugins'] = [
    'jsx',
    // import { example } from 'example' with { example: true };
    'importAttributes',
    // () => throw example
    'throwExpressions',
    // You know what this is
    'decorators',
    // const { #example: example } = this;
    'destructuringPrivate',
    // using example = myExample()
    'explicitResourceManagement',
  ];

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

  return {
    code: result.code,
    map: result.map,
    files,
    entries,
    roots,
  };
}

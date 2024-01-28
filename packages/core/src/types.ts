import type * as babel from '@babel/core';
import type * as t from '@babel/types';
import type * as path from 'node:path';

export interface NamedImportDefinition {
  kind: 'named';
  name: string;
  source: string;
}

export interface DefaultImportDefinition {
  kind: 'default';
  source: string;
}

export type ImportDefinition = DefaultImportDefinition | NamedImportDefinition;

export interface DirectiveDefinition {
  isomorphic?: boolean;
  value: string;
  target: ImportDefinition;
  pure?: boolean;
}

export interface FunctionDefinition {
  isomorphic?: boolean;
  source: ImportDefinition;
  target: ImportDefinition;
  handle: ImportDefinition;
  pure?: boolean;
}

export interface Options {
  key: string;
  mode: 'server' | 'client';
  env: 'production' | 'development';
  directives: DirectiveDefinition[];
  functions: FunctionDefinition[];
}

export interface ModuleDefinition {
  source: string;
  kind: 'default' | 'named' | 'namespace';
  local: string;
  imported?: string;
}

export interface CodeOutput {
  code: babel.BabelFileResult['code'];
  map: babel.BabelFileResult['map'];
}

export interface StateContext {
  id: string;
  path: path.ParsedPath;
  imports: Map<string, t.Identifier>;
  virtual: {
    count: number;
  };
  blocks: {
    hash: string;
    count: number;
  };
  bindings: Map<string, ModuleDefinition>;
  options: Options;
  onVirtualFile: (
    path: string,
    content: CodeOutput,
    mode: 'entry' | 'root' | 'none',
  ) => void;
  registrations: {
    identifiers: Map<t.Identifier, FunctionDefinition>;
    namespaces: Map<t.Identifier, FunctionDefinition[]>;
  };
}

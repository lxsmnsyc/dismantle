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
  value: string;
  import: ImportDefinition;
}

export interface FunctionDefinition {
  type: 'function' | 'promise';
  source: ImportDefinition;
  target: ImportDefinition;
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

export interface StateContext {
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
    content: string,
    mode: 'entry' | 'root' | 'none',
  ) => void;
  registrations: {
    identifiers: Map<t.Identifier, FunctionDefinition>;
    namespaces: Map<t.Identifier, FunctionDefinition[]>;
  };
}

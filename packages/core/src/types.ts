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

export interface BlockDirectiveDefinition {
  type: 'block-directive';
  isomorphic?: boolean;
  pure?: boolean;
  directive: string;
  target: ImportDefinition;
  idPrefix?: string;
}

export interface FunctionDirectiveDefinition {
  type: 'function-directive';
  isomorphic?: boolean;
  pure?: boolean;
  directive: string;
  target: ImportDefinition;
  handle: ImportDefinition;
  idPrefix?: string;
}

export type DirectiveDefinition =
  | BlockDirectiveDefinition
  | FunctionDirectiveDefinition;

export interface FunctionCallDefinition {
  type: 'function-call';
  isomorphic?: boolean;
  pure?: boolean;
  source: ImportDefinition;
  target: ImportDefinition;
  handle: ImportDefinition;
  idPrefix?: string;
}

export interface Options {
  key: string;
  mode: 'server' | 'client';
  env: 'production' | 'development';
  definitions: (
    | BlockDirectiveDefinition
    | FunctionDirectiveDefinition
    | FunctionCallDefinition
  )[];
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
    identifiers: Map<t.Identifier, FunctionCallDefinition>;
    namespaces: Map<t.Identifier, FunctionCallDefinition[]>;
  };
}

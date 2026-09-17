import type * as path from 'node:path';

import type * as babel from '@babel/core';
import type * as t from '@babel/types';

export interface NamedImportDefinition {
  kind: 'named';
  /**
   * The exported name to import.
   */
  name: string;
  /**
   * The module to import from.
   */
  source: string;
}

export interface DefaultImportDefinition {
  kind: 'default';
  /**
   * The module to import from.
   */
  source: string;
}

export type ImportDefinition = DefaultImportDefinition | NamedImportDefinition;

export interface BaseDefinition {
  /**
   * Called in entry files to register the split code.
   * Receives the ID, and the wrapped root file if it was emitted.
   */
  target: ImportDefinition;
  /**
   * Emits the root file in both modes, so the split code exists on both
   * sides. `target` receives the wrapped root file in `client` mode too.
   *
   * Defaults to `false`.
   */
  isomorphic?: boolean;
  /**
   * Disables value capturing. Imports, functions and classes still work.
   *
   * Defaults to `false`.
   */
  pure?: boolean;
  /**
   * Added in front of every generated ID.
   */
  idPrefix?: string;
}

export interface BlockDirectiveDefinition extends BaseDefinition {
  type: 'block-directive';
  /**
   * The directive to look for, e.g. `'use server'`.
   */
  directive: string;
}

export interface FunctionDirectiveDefinition extends BaseDefinition {
  type: 'function-directive';
  /**
   * The directive to look for, e.g. `'use server'`.
   */
  directive: string;
  /**
   * Called in place of the function with the ID and an async factory
   * that returns the function to call.
   */
  handle: ImportDefinition;
}

export type DirectiveDefinition =
  | BlockDirectiveDefinition
  | FunctionDirectiveDefinition;

export interface FunctionCallDefinition extends BaseDefinition {
  type: 'function-call';
  /**
   * The imported function whose argument gets split, e.g. `server$`.
   */
  source: ImportDefinition;
  /**
   * Called in place of the call with the ID and an async factory
   * that returns the function to call.
   */
  handle: ImportDefinition;
}

export interface Options {
  /**
   * Added to the names of generated files,
   * e.g. `./file.ts?mode=server&<key>=0.ts`.
   */
  key: string;
  /**
   * The module the output imports runtime helpers from.
   * It must re-export `dismantle/runtime`.
   */
  runtime: string;
  /**
   * `server` emits root files. `client` only emits entry files.
   */
  mode: 'server' | 'client';
  /**
   * `development` names IDs after the code that contains the split code.
   * `production` uses indexes.
   */
  env: 'production' | 'development';
  definitions: (DirectiveDefinition | FunctionCallDefinition)[];
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
    names: Map<string, number>;
  };
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

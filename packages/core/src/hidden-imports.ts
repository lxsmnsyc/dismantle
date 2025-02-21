import type { ImportDefinition } from './types';

export const HIDDEN_FUNC: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$func',
};

export const HIDDEN_GENERATOR: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$gen',
};

export const HIDDEN_SYNC: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$sync',
};

export const HIDDEN_ASYNC: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$async',
};

export const HIDDEN_CONTEXT: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$context',
};

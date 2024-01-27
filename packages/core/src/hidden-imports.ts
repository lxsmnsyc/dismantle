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

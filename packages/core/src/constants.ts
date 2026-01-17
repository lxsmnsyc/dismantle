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

export const HIDDEN_CONTEXT: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$context',
};

export const DISMANTLE_CONTEXT = 'dismantle__context';

export const DISMANTLE_GEN = 'dismantle__gen';

export const DISMANTLE_FUNC = 'dismantle__func';

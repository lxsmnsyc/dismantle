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

export const HIDDEN_CREATE: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$create',
};

export const HIDDEN_CONTEXT: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$context',
};

export const HIDDEN_RUN: ImportDefinition = {
  kind: 'named',
  source: 'dismantle/runtime',
  name: '$$run',
};

export const DISMANTLE_CONTEXT = 'dismantle__context';

export const DISMANTLE_GEN = 'dismantle__gen';

export const DISMANTLE_FUNC = 'dismantle__func';

export const DISMANTLE_RUN = 'dismantle__run';

export const DISMANTLE_SKIP = '@dismantle skip';

export const DISMANTLE_REF = '@dismantle ref';

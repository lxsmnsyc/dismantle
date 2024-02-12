import type * as compiler from '../compiler';

export const SERVER: compiler.Options = {
  directive: 'use server',
  mode: 'server',
  env: 'development',
};
export const CLIENT: compiler.Options = {
  directive: 'use server',
  mode: 'client',
  env: 'development',
};
export const ID = 'example.ts';

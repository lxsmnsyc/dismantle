/**
 * Result codes shared between the compiled output and the runtime.
 * They must stay in sync with `runtime/index.ts`.
 */
export const BREAK_CODE = 0;
export const CONTINUE_CODE = 1;
export const RETURN_CODE = 2;

/**
 * Runtime exports used by the entry files (server side).
 */
export const WRAP_FUNCTION = '$$wrapFunction';
export const WRAP_GENERATOR = '$$wrapGenerator';
export const WRAP_BLOCK = '$$wrapBlock';
export const WRAP_BLOCK_GENERATOR = '$$wrapBlockGenerator';

/**
 * Runtime exports used by the replacement code (caller side).
 */
export const CALL_FUNCTION = '$$callFunction';
export const CALL_GENERATOR = '$$callGenerator';
export const CALL_BLOCK = '$$callBlock';
export const CALL_BLOCK_GENERATOR = '$$callBlockGenerator';

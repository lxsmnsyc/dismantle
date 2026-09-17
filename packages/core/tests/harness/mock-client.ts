import { getHandler } from './mock-server';

export { handle, handleGenerator } from './mock-server';

type Handler = (...args: unknown[]) => unknown;

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

/**
 * Simulates a network boundary: everything crossing it gets cloned, so
 * functions or shared references would fail loudly.
 */
async function* transferIterator(iterable: AsyncIterable<unknown>): AsyncGenerator {
  for await (const value of iterable) {
    yield structuredClone(value);
  }
}

async function transferValue(value: unknown): Promise<unknown> {
  return structuredClone(await value);
}

export function register(id: string, handler?: Handler): Handler {
  // Isomorphic splits pass the handler, so it runs locally
  if (handler) {
    return handler;
  }
  // Returns an async iterable for generators, and a promise otherwise.
  return (...args): unknown => {
    const result = getHandler(id)(...structuredClone(args));
    if (isAsyncIterable(result)) {
      return transferIterator(result);
    }
    return transferValue(result);
  };
}

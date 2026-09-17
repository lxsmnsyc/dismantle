import { getHandler } from './mock-server';

export { handle, handleGenerator } from './mock-server';

/**
 * Simulates a network boundary: everything crossing it gets cloned, so
 * functions or shared references would fail loudly.
 */
async function* transferIterator(
  iterable: AsyncIterable<unknown>,
): AsyncGenerator<unknown> {
  for await (const value of iterable) {
    yield structuredClone(value);
  }
}

export function register(
  id: string,
  handler?: (...args: unknown[]) => unknown,
) {
  // Isomorphic splits pass the handler, so it runs locally
  if (handler) {
    return handler;
  }
  return (...args: unknown[]) => {
    const result = getHandler(id)(...structuredClone(args));
    if (
      result &&
      typeof result === 'object' &&
      Symbol.asyncIterator in result
    ) {
      return transferIterator(result as AsyncIterable<unknown>);
    }
    return Promise.resolve(result).then(value => structuredClone(value));
  };
}

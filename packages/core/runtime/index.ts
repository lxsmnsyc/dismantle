/**
 * Result codes. They must stay in sync with `src/split/constants.ts`.
 */
const BREAK = 0;
const CONTINUE = 1;
const RETURN = 2;
const NO_HALT = 3;
const THROW = 4;
const YIELD = 5;

type ResultCode =
  | typeof BREAK
  | typeof CONTINUE
  | typeof RETURN
  | typeof NO_HALT
  | typeof THROW
  | typeof YIELD;

/**
 * Captured variables: `[values, mutables]`.
 */
export type Closure = [values: unknown[], mutables: unknown[]];

/**
 * The result sent back to the caller. `mutations` holds the latest values
 * of the mutable variables, in the same order as `Closure[1]`.
 */
export type Result = [code: ResultCode, value?: unknown, mutations?: unknown[]];

/**
 * What a split block returns: a control flow tuple, or `undefined` if the
 * block ran to its end.
 */
type BlockResult = [code: ResultCode, value?: unknown] | undefined;

type Sync = (() => unknown[]) | null;

/**
 * The default export of a root file.
 */
export type Factory<T> = (closure: Closure) => [target: T, sync: Sync];

type Update = ((mutations: unknown[]) => void) | null;

type MaybePromise<T> = T | Promise<T>;

type AnyIterator =
  | Iterator<unknown, unknown, undefined>
  | AsyncIterator<unknown, unknown, undefined>;

function toResult(code: ResultCode, value: unknown, sync: Sync): Result {
  return sync ? [code, value, sync()] : [code, value];
}

function toBlockResult(result: BlockResult, sync: Sync): Result {
  return result
    ? toResult(result[0], result[1], sync)
    : toResult(NO_HALT, undefined, sync);
}

async function* iterate(
  iterator: AnyIterator,
  sync: Sync,
): AsyncGenerator<Result, unknown, undefined> {
  while (true) {
    const step = await iterator.next();
    if (step.done) {
      return step.value;
    }
    yield toResult(YIELD, step.value, sync);
  }
}

// Server side

export function $$wrapFunction<T extends unknown[]>(
  factory: Factory<(...args: T) => unknown>,
): (closure: Closure, ...args: T) => Promise<Result> {
  return async (closure, ...args) => {
    let sync: Sync = null;
    try {
      const [target, currentSync] = factory(closure);
      sync = currentSync;
      return toResult(RETURN, await target(...args), sync);
    } catch (error) {
      return toResult(THROW, error, sync);
    }
  };
}

export function $$wrapGenerator<T extends unknown[]>(
  factory: Factory<(...args: T) => AnyIterator>,
): (closure: Closure, ...args: T) => AsyncGenerator<Result> {
  // biome-ignore lint/suspicious/useAwait: async generator that only delegates
  return async function* (closure, ...args) {
    let sync: Sync = null;
    try {
      const [target, currentSync] = factory(closure);
      sync = currentSync;
      const value = yield* iterate(target(...args), sync);
      yield toResult(RETURN, value, sync);
    } catch (error) {
      yield toResult(THROW, error, sync);
    }
  };
}

export function $$wrapBlock(
  factory: Factory<() => Promise<BlockResult>>,
): (closure: Closure) => Promise<Result> {
  return async closure => {
    let sync: Sync = null;
    try {
      const [target, currentSync] = factory(closure);
      sync = currentSync;
      return toBlockResult(await target(), sync);
    } catch (error) {
      return toResult(THROW, error, sync);
    }
  };
}

export function $$wrapBlockGenerator(
  factory: Factory<() => AnyIterator>,
): (closure: Closure) => AsyncGenerator<Result> {
  // biome-ignore lint/suspicious/useAwait: async generator that only delegates
  return async function* (closure) {
    let sync: Sync = null;
    try {
      const [target, currentSync] = factory(closure);
      sync = currentSync;
      const result = yield* iterate(target(), sync);
      yield toBlockResult(result as BlockResult, sync);
    } catch (error) {
      yield toResult(THROW, error, sync);
    }
  };
}

// Caller side

function settle(
  [code, value, mutations]: Result,
  update: Update,
): [code: ResultCode, value: unknown] {
  if (update && mutations) {
    update(mutations);
  }
  if (code === THROW) {
    throw value;
  }
  return [code, value];
}

async function* consume(
  results: MaybePromise<AsyncIterable<Result>>,
  update: Update,
): AsyncGenerator<unknown, [code: ResultCode, value: unknown], undefined> {
  for await (const result of await results) {
    const settled = settle(result, update);
    if (settled[0] !== YIELD) {
      return settled;
    }
    yield settled[1];
  }
  throw new Error('Remote generator ended without a result.');
}

export async function $$callFunction<T extends unknown[]>(
  source: (closure: Closure, ...args: T) => MaybePromise<Result>,
  closure: Closure,
  update: Update,
  args: T,
): Promise<unknown> {
  return settle(await source(closure, ...args), update)[1];
}

// biome-ignore lint/suspicious/useAwait: async generator that only delegates
export async function* $$callGenerator<T extends unknown[]>(
  source: (closure: Closure, ...args: T) => MaybePromise<AsyncIterable<Result>>,
  closure: Closure,
  update: Update,
  args: T,
): AsyncGenerator<unknown, unknown, undefined> {
  return (yield* consume(source(closure, ...args), update))[1];
}

export async function $$callBlock(
  source: (closure: Closure) => MaybePromise<Result>,
  closure: Closure,
  update: Update,
): Promise<[code: ResultCode, value: unknown]> {
  return settle(await source(closure), update);
}

export function $$callBlockGenerator(
  source: (closure: Closure) => MaybePromise<AsyncIterable<Result>>,
  closure: Closure,
  update: Update,
): AsyncGenerator<unknown, [code: ResultCode, value: unknown], undefined> {
  return consume(source(closure), update);
}

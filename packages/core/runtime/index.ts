type BasicFunctionCode =
  | 0 // break
  | 1 // continue
  | 2 // return
  | 3 // no halt
  | 4; // throw;

type BasicGeneratorCode = BasicFunctionCode | 5; // yield;

export function $$func<T extends any[], R>(
  callback: (
    ...args: T
  ) => Promise<[type: BasicFunctionCode, result: R, mutations: unknown]>,
  update?: (result: unknown) => void,
): (...args: T) => Promise<unknown> {
  return async (...args: T) => {
    const [type, result, mutations] = await callback(...args);
    if (update) {
      update(mutations);
    }
    if (type === 4) {
      throw result;
    }
    return [type, result];
  };
}

export function $$gen<T extends any[], R>(
  callback: (
    ...args: T
  ) => AsyncGenerator<
    [type: BasicGeneratorCode, result: R, mutations: unknown]
  >,
  update?: (result: unknown) => void,
): (...args: T) => AsyncGenerator<unknown> {
  return async function* (...args: T): AsyncGenerator<unknown> {
    let step: IteratorResult<
      [type: BasicGeneratorCode, result: R, mutations: unknown]
    >;
    const iterator = await callback(...args);
    while (true) {
      step = await iterator.next();
      if (step.done) {
        break;
      }
      const [type, result, mutations] = step.value;
      if (update) {
        update(mutations);
      }
      if (type === 5) {
        yield result;
      }
    }
    const [type, result, mutations] = step.value;
    if (update) {
      update(mutations);
    }
    if (type === 4) {
      throw result;
    }
    return [type, result];
  };
}

let CURRENT_CONTEXT: DismantleContext | undefined;

export class DismantleContext {
  state: unknown[] = [];

  get(index: number): unknown {
    return this.state[index];
  }

  set(index: number, value: unknown): unknown {
    this.state[index] = value;
    return value;
  }

  run<T extends any[], R>(
    source: unknown,
    callback: (...args: T) => R,
    args: T,
  ): R {
    const parent = CURRENT_CONTEXT;
    CURRENT_CONTEXT = this;
    try {
      return callback.apply(source, args);
    } finally {
      CURRENT_CONTEXT = parent;
    }
  }
}

export function $$context(): DismantleContext {
  const current = CURRENT_CONTEXT;
  if (!current) {
    throw new Error('Missing dismantle context');
  }
  return current;
}

export type Result<T> = [code: 2, value: T] | [code: 4, value: unknown];

export function $$sync<T extends any[], R>(
  callback: (...args: T) => R,
): (...args: T) => Result<R> {
  return (...args: T): Result<R> => {
    const context = new DismantleContext();
    try {
      return [2, context.run(null, callback, args)];
    } catch (error) {
      return [4, error];
    }
  };
}

export function $$async<T extends any[], R>(
  callback: (...args: T) => Promise<R>,
): (...args: T) => Promise<Result<R>> {
  return async (...args: T): Promise<Result<R>> => {
    const context = new DismantleContext();
    try {
      return [2, await context.run(null, callback, args)];
    } catch (error) {
      return [4, error];
    }
  };
}

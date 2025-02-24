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

type Closure = unknown[];

let CURRENT_CONTEXT: DismantleContext | undefined;

interface DismantleContext {
  l: Closure;
  m: Closure;
}

export function $$run<T extends any[], R>(
  context: DismantleContext,
  callback: (...args: T) => R,
  ...args: T
): R {
  const parent = CURRENT_CONTEXT;
  CURRENT_CONTEXT = context;
  try {
    return callback.apply(null, args);
  } finally {
    CURRENT_CONTEXT = parent;
  }
}

export function $$context(): DismantleContext {
  const current = CURRENT_CONTEXT;
  if (!current) {
    throw new Error('Missing dismantle context');
  }
  return current;
}

export function $$push([l, m]: [Closure, Closure]):
  | DismantleContext
  | undefined {
  const parent = CURRENT_CONTEXT;
  CURRENT_CONTEXT = { l, m };
  return parent;
}

export function $$pop(parent: DismantleContext | undefined): void {
  CURRENT_CONTEXT = parent;
}

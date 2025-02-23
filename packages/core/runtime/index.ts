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

export class DismantleContext {
  public __m: Closure;
  public __l: Closure;
  constructor(closure: [Closure, Closure]) {
    this.__l = closure[0];
    this.__m = closure[1];
  }

  run<T extends any[], R>(
    source: unknown,
    callback: (...args: T) => R,
    ...args: T
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

export function $$push(
  closure: [Closure, Closure],
): DismantleContext | undefined {
  const parent = CURRENT_CONTEXT;
  CURRENT_CONTEXT = new DismantleContext(closure);
  return parent;
}

export function $$pop(parent: DismantleContext | undefined): void {
  CURRENT_CONTEXT = parent;
}

type Handler = (...args: unknown[]) => unknown;

const handlers = new Map<string, Handler>();
let calls = 0;

export function getRemoteCalls(): number {
  return calls;
}

export function resetRemoteCalls(): void {
  calls = 0;
}

export function getHandler(id: string): Handler {
  const handler = handlers.get(id);
  if (!handler) {
    throw new Error(`Missing handler for ${id}`);
  }
  return handler;
}

export function register(id: string, handler: Handler): Handler {
  const counted: Handler = (...args) => {
    calls++;
    return handler(...args);
  };
  handlers.set(id, counted);
  return counted;
}

// Handles for function-call and function-directive definitions
export function handle(
  _id: string,
  factory: () => Promise<Handler>,
): (...args: unknown[]) => Promise<unknown> {
  return async (...args) => (await factory())(...args);
}

export function handleGenerator(
  _id: string,
  factory: () => Promise<(...args: unknown[]) => AsyncGenerator<unknown, unknown>>,
): (...args: unknown[]) => AsyncGenerator<unknown, unknown> {
  return async function* callGenerator(...args) {
    return yield* (await factory())(...args);
  };
}

type Handler = (...args: unknown[]) => unknown;

interface Store {
  handlers: Map<string, Handler>;
  calls: number;
}

// Shared through globalThis so every copy of this module sees the same state
const shared = globalThis as { __DISMANTLE_TEST__?: Store };
shared.__DISMANTLE_TEST__ ||= { handlers: new Map(), calls: 0 };
const store = shared.__DISMANTLE_TEST__;

export function getRemoteCalls(): number {
  return store.calls;
}

export function resetRemoteCalls(): void {
  store.calls = 0;
}

export function getHandler(id: string): Handler {
  const handler = store.handlers.get(id);
  if (!handler) {
    throw new Error(`Missing handler for ${id}`);
  }
  return handler;
}

export function register(id: string, handler: Handler): Handler {
  const counted: Handler = (...args) => {
    store.calls++;
    return handler(...args);
  };
  store.handlers.set(id, counted);
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
  factory: () => Promise<Handler>,
): (...args: unknown[]) => AsyncGenerator<unknown> {
  return async function* (...args) {
    return yield* (await factory())(...args) as AsyncGenerator<unknown>;
  };
}

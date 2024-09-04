import type { JSX } from 'solid-js';
import { Suspense, createResource, createSignal } from 'solid-js';

async function sleep<T>(value: T, ms: number): Promise<T> {
  return new Promise<T>(res => {
    setTimeout(res, ms, value);
  });
}

export function App(): JSX.Element {
  const [state, setState] = createSignal(0);

  const prefix = 'Worker Count';

  async function serverCount(value: number) {
    'use worker';

    console.log('Received', value);
    const immediate = `${prefix}: ${value}`;
    return {
      immediate,
      delayed: sleep(immediate, 5000),
    };
  }

  const [data] = createResource(state, async value => serverCount(value));

  function increment(): void {
    setState(c => c + 1);
  }

  return (
    <>
      <button type="button" onClick={increment}>
        {`Client Count: ${state()}`}
      </button>
      <div>
        <Suspense fallback={<h1>Loading</h1>}>
          <h1>{data()?.immediate}</h1>
        </Suspense>
      </div>
    </>
  );
}

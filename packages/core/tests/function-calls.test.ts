import { afterAll, describe, expect, it } from 'vitest';
import { MODES, cleanup, getRemoteCalls, load } from './harness';

afterAll(cleanup);

interface Module {
  run: (...args: unknown[]) => Promise<unknown>;
}

const FUNCTIONS: [name: string, create: (body: string) => string][] = [
  ['arrow function', (body) => `server$(async (input) => { ${body} })`],
  ['function expression', (body) => `server$(async function (input) { ${body} })`],
  ['non-async function', (body) => `server$(function (input) { ${body} })`],
];

describe.each(MODES)('function calls (%s)', (mode) => {
  describe.each(FUNCTIONS)('%s', (_name, create) => {
    it('runs the function remotely', async () => {
      const mod = await load<Module>(
        mode,
        `
        import { server$ } from 'mock';
        const remote = ${create(`return 'remote ' + input;`)};
        export async function run(input) {
          return remote(input);
        }
        `,
      );
      expect(await mod.run('call')).toBe('remote call');
      expect(getRemoteCalls()).toBe(1);
    });

    it('captures local and top-level values', async () => {
      const mod = await load<Module>(
        mode,
        `
        import { server$ } from 'mock';
        const top = 'top';
        export async function run(value) {
          const local = 'local';
          const remote = ${create('return [top, local, input];')};
          return remote(value);
        }
        `,
      );
      expect(await mod.run('input')).toEqual(['top', 'local', 'input']);
    });
  });

  it('supports namespace imports', async () => {
    const mod = await load<Module>(
      mode,
      `
      import * as mock from 'mock';
      export async function run(input) {
        const remote = mock.server$(async (value) => value * 2);
        return remote(input);
      }
      `,
    );
    expect(await mod.run(21)).toBe(42);
    expect(getRemoteCalls()).toBe(1);
  });

  it('streams generators with mutations between steps', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { serverGenerator$ } from 'mock';
      export async function run() {
        let total = 0;
        async function* inner() { yield 'a'; yield 'b'; }
        const stream = serverGenerator$(async function* (limit) {
          yield* inner();
          for (let i = 1; i <= limit; i++) {
            total += i;
            yield i;
          }
          return 'done';
        });
        const seen = [];
        const iterator = stream(3);
        while (true) {
          const step = await iterator.next();
          if (step.done) {
            seen.push(step.value);
            break;
          }
          seen.push([step.value, total]);
        }
        return seen;
      }
      `,
    );
    expect(await mod.run()).toEqual([['a', 0], ['b', 0], [1, 1], [2, 3], [3, 6], 'done']);
  });
});

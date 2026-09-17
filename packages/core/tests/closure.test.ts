import { afterAll, describe, expect, it } from 'vitest';
import { cleanup, load, MODES } from './harness';

afterAll(cleanup);

interface Module {
  run: (...args: unknown[]) => Promise<unknown>;
}

describe.each(MODES)('closure (%s)', mode => {
  it('captures local values', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      export async function run(prefix) {
        const suffix = '!';
        const greet = server$(async (name) => prefix + name + suffix);
        return greet('world');
      }
      `,
    );
    expect(await mod.run('hello ')).toBe('hello world!');
  });

  it('syncs mutations back to the caller', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      export async function run() {
        let count = 0;
        let history = [];
        const add = server$(async (n) => {
          count += n;
          history = [...history, count];
          return count;
        });
        const first = await add(2);
        count *= 10;
        const second = await add(3);
        return [first, second, count, history];
      }
      `,
    );
    expect(await mod.run()).toEqual([2, 23, 23, [2, 23]]);
  });

  it('copies local helpers instead of serializing them', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      export async function run() {
        let calls = 0;
        const base = 10;
        const track = () => { calls++; };
        const double = (x) => { track(); return x * 2; };
        function addBase(x) { track(); return double(x) + base; }
        const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
        const compute = server$(async (n) => addBase(n) + fib(n));
        const result = await compute(6);
        return [result, calls];
      }
      `,
    );
    expect(await mod.run()).toEqual([30, 2]);
  });

  it('copies module-level helpers and classes', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      import { basename } from 'node:path';
      const SEPARATOR = ':';
      class Base { name() { return 'base'; } }
      class Child extends Base { name() { return super.name() + SEPARATOR + 'child'; } }
      function label(file) { return basename(file) + SEPARATOR + new Child().name(); }
      export async function run() {
        const describe = server$(async (file) => label(file));
        return describe('/a/b/c.txt');
      }
      `,
    );
    expect(await mod.run()).toBe('c.txt:base:child');
  });

  it('renames captured bindings that share a name', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      import { basename } from 'node:path';
      export async function run() {
        const value = 'outer';
        const read = () => value + basename('/x/y');
        {
          const value = 'inner';
          let basename = 'local';
          const combine = server$(async () => {
            basename += '!';
            return [read(), value, basename];
          });
          const result = await combine();
          return [...result, basename];
        }
      }
      `,
    );
    expect(await mod.run()).toEqual(['outery', 'inner', 'local!', 'local!']);
  });

  it('rethrows errors and still syncs mutations', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      export async function run() {
        let step = 'start';
        const fail = server$(async () => {
          step = 'failed';
          throw new Error('boom');
        });
        try {
          await fail();
          return 'unreachable';
        } catch (error) {
          return [error.message, step];
        }
      }
      `,
    );
    expect(await mod.run()).toEqual(['boom', 'failed']);
  });

  it('does not capture values in pure mode', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      const double = (x) => x * 2;
      export async function run(value) {
        const compute = server$(async (n) => double(n) + 1);
        return compute(value);
      }
      `,
      { pure: true },
    );
    expect(await mod.run(4)).toBe(9);
  });

  it('ignores type-only references', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      import type { Stats } from 'node:fs';
      interface Point { x: number; y: number }
      export async function run(x: number) {
        type Pair = [Point, Point];
        const origin: Point = { x: 0, y: 0 };
        const distance = server$(async (to: Point): Promise<number> => {
          const pair: Pair = [origin, to];
          const stats: Stats | undefined = undefined;
          return (pair[1].x - pair[0].x) + (stats ? 1 : 0);
        });
        return distance({ x, y: 0 });
      }
      `,
    );
    expect(await mod.run(5)).toBe(5);
  });

  it('tracks destructuring and loop assignments', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      export async function run(items) {
        let first, rest, last, count = 0;
        const update = server$(async (input) => {
          [first, ...rest] = input;
          ({ length: count } = input);
          for (last of input) {}
        });
        await update(items);
        return [first, rest, last, count];
      }
      `,
    );
    expect(await mod.run([1, 2, 3])).toEqual([1, [2, 3], 3, 3]);
  });

  it('copies recursive named function expressions', async () => {
    const mod = await load<Module>(
      mode,
      `
      import { server$ } from 'mock';
      export async function run(n) {
        const factorial = function fact(x) { return x <= 1 ? 1 : x * fact(x - 1); };
        const compute = server$(async (value) => factorial(value));
        return compute(n);
      }
      `,
    );
    expect(await mod.run(5)).toBe(120);
  });
});

describe('errors', () => {
  it('rejects "this" across a split boundary', async () => {
    await expect(
      load(
        'server',
        `
        import { server$ } from 'mock';
        export const object = {
          value: 1,
          method() {
            return server$(async () => this.value);
          },
        };
        `,
      ),
    ).rejects.toThrow('"this" cannot be referenced across a split boundary.');
  });

  it('rejects "arguments" across a split boundary', async () => {
    await expect(
      load(
        'server',
        `
        export async function run() {
          'use server';
          return arguments.length;
        }
        `,
      ),
    ).rejects.toThrow(
      '"arguments" cannot be referenced across a split boundary.',
    );
  });
});

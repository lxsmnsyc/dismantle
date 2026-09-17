import { afterAll, describe, expect, it } from 'vitest';
import { cleanup, compile, getRemoteCalls, load, MODES } from './harness';

afterAll(cleanup);

type Run = (...args: unknown[]) => Promise<unknown>;

interface Module {
  run: Run;
}

/**
 * Statements that can hold a directive block. `body` is the block content.
 */
const STATEMENTS: [name: string, wrap: (body: string) => string][] = [
  ['block statement', body => `{ ${body} }`],
  ['if statement', body => `if (input) { ${body} } else { log = ['else']; }`],
  ['else clause', body => `if (!input) { log = ['if']; } else { ${body} }`],
  [
    'try statement',
    body => `try { ${body} } finally { log = [...log, 'finally']; }`,
  ],
  ['catch clause', body => `try { throw 'error'; } catch (error) { ${body} }`],
  ['finally clause', body => `try { log = ['try']; } finally { ${body} }`],
  ['labeled statement', body => `label: { ${body} }`],
  [
    'arrow function',
    body => `const inner = async () => { ${body} }; await inner();`,
  ],
  [
    'function declaration',
    body => `async function inner() { ${body} } await inner();`,
  ],
  [
    'function expression',
    body => `const inner = async function () { ${body} }; await inner();`,
  ],
];

const EXPECTED_LOGS: Record<string, unknown[]> = {
  'try statement': ['top', 'local', 'input', 'finally'],
  'finally clause': ['try', 'top', 'local', 'input'],
};

const LOOPS: [name: string, wrap: (body: string) => string][] = [
  [
    'for statement',
    body =>
      `for (let i = 0; i < items.length; i++) { 'use server'; const item = items[i]; ${body} }`,
  ],
  [
    'for-in statement',
    body =>
      `for (const key in items) { 'use server'; const item = items[key]; ${body} }`,
  ],
  [
    'for-of statement',
    body => `for (const item of items) { 'use server'; ${body} }`,
  ],
  [
    'while statement',
    body =>
      `let i = 0; while (i < items.length) { 'use server'; const item = items[i++]; ${body} }`,
  ],
  [
    'do-while statement',
    body =>
      `let i = 0; do { 'use server'; const item = items[i++]; ${body} } while (i < items.length)`,
  ],
];

const ITEMS = ['a', 'b', 'c', 'd'];

describe.each(MODES)('block directives (%s)', mode => {
  describe.each(STATEMENTS)('%s', (name, wrap) => {
    it('runs the block remotely with local and top-level values', async () => {
      const mod = await load<Module>(
        mode,
        `
        const top = 'top';
        export async function run(input) {
          const local = 'local';
          let log = [];
          ${wrap(`'use server'; log = [...log, top, local, input];`)}
          return log;
        }
        `,
      );
      expect(await mod.run('input')).toEqual(
        EXPECTED_LOGS[name] ?? ['top', 'local', 'input'],
      );
      expect(getRemoteCalls()).toBe(1);
    });

    it('skips blocks in non-async functions', async () => {
      const output = await compile(
        mode,
        `
        export function run(input) {
          let log = [];
          ${wrap(`'use server'; log = [...log, input];`).replaceAll('async ', '').replaceAll('await ', '')}
          return log;
        }
        `,
      );
      expect(output.entries).toEqual([]);
      expect(output.code).toContain("'use server'");
    });
  });

  describe.each(LOOPS)('%s', (_name, wrap) => {
    const run = async (body: string, outer?: string) => {
      const loop = wrap(body);
      const mod = await load<Module>(
        mode,
        `
        export async function run(items) {
          let log = [];
          ${outer ? `outer: for (const round of [1, 2]) { ${loop}; ${outer} }` : loop}
          return log;
        }
        `,
      );
      return mod.run(ITEMS);
    };

    it('runs every iteration remotely', async () => {
      expect(await run('log = [...log, item];')).toEqual(ITEMS);
      expect(getRemoteCalls()).toBe(ITEMS.length);
    });

    it('breaks out of the loop', async () => {
      expect(
        await run(`if (item === 'c') break; log = [...log, item];`),
      ).toEqual(['a', 'b']);
    });

    it('continues the loop', async () => {
      expect(
        await run(`if (item === 'b') continue; log = [...log, item];`),
      ).toEqual(['a', 'c', 'd']);
    });

    it('breaks out of a labeled loop', async () => {
      expect(
        await run(
          `if (item === 'c') break outer; log = [...log, item];`,
          `log = [...log, '|'];`,
        ),
      ).toEqual(['a', 'b']);
    });

    it('continues a labeled loop', async () => {
      expect(
        await run(
          `if (item === 'c') continue outer; log = [...log, item];`,
          `log = [...log, '|'];`,
        ),
      ).toEqual(['a', 'b', 'a', 'b']);
    });

    it('keeps jumps that stay inside the block', async () => {
      expect(
        await run(
          'inner: for (const n of [1, 2, 3]) { if (n === 2) continue inner; if (n === 3) break; log = [...log, item + n]; }',
        ),
      ).toEqual(['a1', 'b1', 'c1', 'd1']);
    });
  });

  it('returns from the enclosing function', async () => {
    const mod = await load<Module>(
      mode,
      `
      export async function run(input) {
        'use server';
        if (input > 0) {
          return 'positive';
        }
        return 'other';
      }
      `,
    );
    expect(await mod.run(1)).toBe('positive');
    expect(await mod.run(-1)).toBe('other');
  });

  it('continues after the block with mutated values', async () => {
    const mod = await load<Module>(
      mode,
      `
      export async function run(input) {
        let value = input;
        const factor = 3;
        const scale = (x) => x * factor;
        {
          'use server';
          value = scale(value);
        }
        return value + 1;
      }
      `,
    );
    expect(await mod.run(2)).toBe(7);
  });

  it('throws into the enclosing try statement', async () => {
    const mod = await load<Module>(
      mode,
      `
      export async function run() {
        let state = 'idle';
        try {
          'use server';
          state = 'running';
          throw new Error('failed');
        } catch (error) {
          return [error.message, state];
        }
      }
      `,
    );
    expect(await mod.run()).toEqual(['failed', 'running']);
  });

  it('yields from the enclosing generator', async () => {
    const mod = await load<{
      stream: (limit: number) => AsyncGenerator<unknown, unknown>;
    }>(
      mode,
      `
      export async function* stream(limit) {
        let count = 0;
        let snapshots = [];
        while (true) {
          'use server';
          count++;
          if (count > limit) {
            return snapshots;
          }
          yield count;
          snapshots = [...snapshots, count * 10];
        }
      }
      `,
    );
    const values: unknown[] = [];
    const iterator = mod.stream(3);
    while (true) {
      const step = await iterator.next();
      if (step.done) {
        expect(values).toEqual([1, 2, 3]);
        expect(step.value).toEqual([10, 20, 30]);
        break;
      }
      values.push(step.value);
    }
  });

  it('runs top-level blocks', async () => {
    const mod = await load<{ log: unknown[] }>(
      mode,
      `
      const prefix = 'top';
      export let log = [];
      for (const item of ['a', 'b']) {
        'use server';
        log = [...log, prefix + item];
      }
      `,
    );
    expect(mod.log).toEqual(['topa', 'topb']);
  });
});

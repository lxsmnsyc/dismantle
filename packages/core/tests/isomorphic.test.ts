import { afterAll, describe, expect, it } from 'vitest';
import { cleanup, compile, getRemoteCalls, load } from './harness';

afterAll(cleanup);

const CASES: [name: string, code: string][] = [
  [
    'block directives',
    `
    export async function run(input) {
      let result;
      {
        'use server';
        input.touched = true;
        result = input.callback();
      }
      return result;
    }
    `,
  ],
  [
    'function directives',
    `
    export async function run(input) {
      async function remote(value) {
        'use remote';
        value.touched = true;
        return value.callback();
      }
      return remote(input);
    }
    `,
  ],
  [
    'function calls',
    `
    import { server$ } from 'mock';
    export async function run(input) {
      const remote = server$(async (value) => {
        value.touched = true;
        return value.callback();
      });
      return remote(input);
    }
    `,
  ],
];

describe.each(CASES)('isomorphic %s', (_name, code) => {
  it('emits root files in client mode', async () => {
    const output = await compile('client', code, { isomorphic: true });
    expect(output.roots).toHaveLength(1);
    const entry = output.files.get(output.entries[0])?.code;
    expect(entry).toContain('import root from');
    expect(entry).toContain('wrap(root)');
  });

  it('runs the split code locally on the client', async () => {
    const mod = await load<{
      run: (input: { callback: () => string; touched?: boolean }) => unknown;
    }>('client', code, { isomorphic: true });
    // Functions and shared references would not survive a remote call
    const input = { callback: () => 'local', touched: false };
    expect(await mod.run(input)).toBe('local');
    expect(input.touched).toBe(true);
    expect(getRemoteCalls()).toBe(0);
  });

  it('still splits the code without the option', async () => {
    const output = await compile('client', code);
    expect(output.roots).toEqual([]);
    expect(output.entries).toHaveLength(1);
  });
});

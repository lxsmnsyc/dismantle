import { afterAll, describe, expect, it } from 'vitest';
import { MODES, cleanup, getRemoteCalls, load } from './harness';

afterAll(cleanup);

interface Module {
  run: (...args: unknown[]) => Promise<unknown>;
}

const FUNCTIONS: [name: string, declare: (body: string) => string][] = [
  ['arrow function', (body) => `const remote = async (input) => { ${body} };`],
  ['function declaration', (body) => `async function remote(input) { ${body} }`],
  ['function expression', (body) => `const remote = async function (input) { ${body} };`],
  ['non-async function', (body) => `const remote = function (input) { ${body} };`],
];

describe.each(MODES)('function directives (%s)', (mode) => {
  describe.each(FUNCTIONS)('%s', (_name, declare) => {
    it('runs the function remotely', async () => {
      const mod = await load<Module>(
        mode,
        `
        ${declare(`'use remote'; return 'remote ' + input;`)}
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
        const top = 'top';
        export async function run(value) {
          let calls = 0;
          const local = 'local';
          ${declare(`'use remote'; calls++; return [top, local, input];`)}
          const first = await remote(value);
          const second = await remote(value);
          return [first, second, calls];
        }
        `,
      );
      expect(await mod.run('input')).toEqual([
        ['top', 'local', 'input'],
        ['top', 'local', 'input'],
        2,
      ]);
      expect(getRemoteCalls()).toBe(2);
    });
  });
});

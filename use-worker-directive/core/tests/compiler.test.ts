import { describe, expect, it } from 'vitest';
import { type Output, compile } from '../compiler';

const CODE = `
export async function run(input) {
  let count = 0;
  {
    'use worker';
    count = input + 1;
  }
  return count;
}
`;

const ENTRY_ID = /entry\("([^"]+)"/;

async function getEntry(
  mode: 'server' | 'client',
  code: string,
  options: { directive?: string; prefix?: string; pure?: boolean } = {},
): Promise<{ output: Output; entry: string; id: string | undefined }> {
  const output = await compile('/src/example.ts', code, {
    mode,
    env: 'development',
    ...options,
  });
  expect(output.entries).toHaveLength(1);
  const entry = output.files.get(output.entries[0])?.code ?? '';
  return { output, entry, id: ENTRY_ID.exec(entry)?.[1] };
}

describe.each(['server', 'client'] as const)('compile (%s)', (mode) => {
  it(`registers blocks through use-worker-directive/${mode}`, async () => {
    const { output, entry, id } = await getEntry(mode, CODE);
    expect(entry).toContain(`from "use-worker-directive/${mode}"`);
    expect(output.code).toContain('from "use-worker-directive/runtime"');
    expect(id).toMatch(/^\/__worker\/[0-9a-f]+-run$/);
    expect(output.roots).toHaveLength(mode === 'server' ? 1 : 0);
  });

  it('uses a custom directive and prefix', async () => {
    const { id } = await getEntry(mode, CODE.replace("'use worker'", "'use remote'"), {
      directive: 'use remote',
      prefix: 'custom',
    });
    expect(id).toMatch(/^\/custom\/[0-9a-f]+-run$/);
  });

  it('captures closures unless pure', async () => {
    const { output } = await getEntry(mode, CODE);
    expect(output.code).toContain('[[input], [count]]');

    const pure = await getEntry(mode, CODE, { pure: true });
    expect(pure.output.code).toContain('[[], []]');
  });
});

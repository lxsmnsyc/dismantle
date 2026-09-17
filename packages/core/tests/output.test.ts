import { describe, expect, it } from 'vitest';
import { compile } from './harness';

const ROOT_IMPORT = /import root from/;
const ENTRY_ID = /entry\("([^"]+)"\)/;
const HASH_PREFIX = /^[0-9a-f]+-/;

const CODE = `
import { server$ } from 'mock';
import { query } from 'database';
import { render } from 'renderer';

export async function page(id) {
  const fetchUser = server$(async () => query('user', id));
  let data;
  {
    'use server';
    data = await query('page', id);
  }
  return render(await fetchUser(), data);
}
`;

function codeOf(output: Awaited<ReturnType<typeof compile>>, file: string) {
  const content = output.files.get(file);
  expect(content).toBeDefined();
  return content?.code ?? '';
}

describe('output files', () => {
  it('emits a root and an entry per split on the server', async () => {
    const output = await compile('server', CODE);
    expect(output.roots).toHaveLength(2);
    expect(output.entries).toHaveLength(2);
    expect([...output.files.keys()].sort()).toEqual(
      [...output.roots, ...output.entries].sort(),
    );
    for (const entry of output.entries) {
      expect(codeOf(output, entry)).toMatch(ROOT_IMPORT);
    }
  });

  it('emits only entries on the client', async () => {
    const output = await compile('client', CODE);
    expect(output.roots).toEqual([]);
    expect(output.entries).toHaveLength(2);
    expect([...output.files.keys()]).toEqual(output.entries);
    for (const entry of output.entries) {
      expect(codeOf(output, entry)).not.toMatch(ROOT_IMPORT);
    }
  });

  it('keeps imports used only by split code out of the caller', async () => {
    const client = await compile('client', CODE);
    expect(client.code).not.toContain('database');
    expect(client.code).toContain('renderer');
    for (const entry of client.entries) {
      expect(codeOf(client, entry)).not.toContain('database');
    }

    const server = await compile('server', CODE);
    for (const root of server.roots) {
      expect(codeOf(server, root)).toContain(
        `import { query } from 'database';`,
      );
      expect(codeOf(server, root)).not.toContain('renderer');
    }
  });

  it('removes the directives', async () => {
    const output = await compile('server', CODE);
    expect(output.code).not.toContain('use server');
    for (const root of output.roots) {
      expect(codeOf(output, root)).not.toContain('use server');
    }
  });

  it('maps root files back to the original source', async () => {
    const output = await compile('server', CODE);
    for (const root of output.roots) {
      const map = output.files.get(root)?.map;
      expect(map?.sources).toEqual(['/virtual/example.ts']);
    }
  });
});

async function getIDs(
  code: string,
  env: 'development' | 'production' = 'development',
): Promise<(string | undefined)[]> {
  const output = await compile('client', code, { env });
  return output.entries.map(entry =>
    ENTRY_ID.exec(output.files.get(entry)?.code ?? '')?.[1].replace(
      HASH_PREFIX,
      '',
    ),
  );
}

describe('split IDs', () => {
  it.each([
    [
      'server functions in functions',
      'function foo() { const bar = server$(async () => 1); }',
      ['foo.bar'],
    ],
    [
      'function directives in functions',
      `function foo() { async function bar() { 'use remote'; } }`,
      ['foo.bar'],
    ],
    [
      'nested arrow functions',
      'function outer() { const inner = () => { const fn = server$(async () => 1); }; }',
      ['outer.inner.fn'],
    ],
    ['blocks', `async function foo() { { 'use server'; } }`, ['foo']],
    [
      'class methods',
      `class Api { async load() { 'use server'; } async #save() { 'use server'; } }`,
      ['Api.load', 'Api.save'],
    ],
    [
      'object members',
      `const api = { async load() { 'use server'; }, save: server$(async () => 1) };`,
      ['api.load', 'api.save'],
    ],
    ['assignments', 'exports.handler = server$(async () => 1);', ['handler']],
    [
      'named function expressions',
      `const a = async function b() { 'use server'; };`,
      ['b'],
    ],
    ['anonymous functions', 'server$(async () => 1);', ['anonymous']],
    [
      'repeated names',
      `async function foo() { { 'use server'; } { 'use server'; } { 'use server'; } }`,
      ['foo', 'foo-1', 'foo-2'],
    ],
  ])('names %s', async (_name, code, expected) => {
    expect(await getIDs(`import { server$ } from 'mock';\n${code}`)).toEqual(
      expected,
    );
  });

  it('uses indexes in production', async () => {
    expect(
      await getIDs(
        `import { server$ } from 'mock';
        async function page() {
          const fetchUser = server$(async () => 1);
          { 'use server'; }
        }`,
        'production',
      ),
    ).toEqual(['0', '1']);
  });
});

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as compiler from '../../src';
import { resetRemoteCalls } from './mock-server';

export { getRemoteCalls } from './mock-server';

const ID = '/virtual/example.ts';
const KEY = 'dismantle-test';
// One directory per test file, since test files run in parallel
const OUTPUT = path.join(__dirname, '.output', randomUUID());
const RUNTIME = path.join(__dirname, '../../runtime/index.ts');
const MOCK_SERVER = path.join(__dirname, 'mock-server.ts');
const MOCK_CLIENT = path.join(__dirname, 'mock-client.ts');
const MOCK = path.join(__dirname, 'mock.ts');

export type Mode = 'server' | 'client';

export const MODES: Mode[] = ['client', 'server'];

export interface CompileOptions {
  pure?: boolean;
  isomorphic?: boolean;
  env?: compiler.Options['env'];
}

function getOptions(
  mode: Mode,
  { pure = false, isomorphic = false, env = 'development' }: CompileOptions,
): compiler.Options {
  const target = {
    kind: 'named',
    source: `mock/${mode}`,
    name: 'register',
  } as const;
  const handle = (name: string) => ({ kind: 'named', source: `mock/${mode}`, name }) as const;
  return {
    key: KEY,
    runtime: 'mock/runtime',
    mode,
    env,
    definitions: [
      {
        type: 'block-directive',
        directive: 'use server',
        pure,
        isomorphic,
        target,
      },
      {
        type: 'function-directive',
        directive: 'use remote',
        pure,
        isomorphic,
        target,
        handle: handle('handle'),
      },
      {
        type: 'function-call',
        source: { kind: 'named', source: 'mock', name: 'server$' },
        pure,
        isomorphic,
        target,
        handle: handle('handle'),
      },
      {
        type: 'function-call',
        source: { kind: 'named', source: 'mock', name: 'serverGenerator$' },
        pure,
        isomorphic,
        target,
        handle: handle('handleGenerator'),
      },
    ],
  };
}

function toFileName(mode: Mode, specifier: string): string {
  const match = new RegExp(`\\?mode=\\w+&${KEY}=(\\d+)`).exec(specifier);
  return match ? `${mode}-${match[1]}.ts` : `${mode}-main.ts`;
}

function rewriteImports(mode: Mode, code: string): string {
  return code.replace(/(["'])([^"'\n]+)\1/g, (full: string, _quote: string, specifier: string) => {
    if (specifier === 'mock') {
      return JSON.stringify(MOCK);
    }
    if (specifier === 'mock/runtime') {
      return JSON.stringify(RUNTIME);
    }
    if (specifier === 'mock/server') {
      return JSON.stringify(MOCK_SERVER);
    }
    if (specifier === 'mock/client') {
      return JSON.stringify(MOCK_CLIENT);
    }
    if (specifier.startsWith('./example.ts?')) {
      return JSON.stringify(`./${toFileName(mode, specifier)}`);
    }
    return full;
  });
}

async function writeOutput(dir: string, mode: Mode, output: compiler.Output): Promise<void> {
  await fs.writeFile(path.join(dir, `${mode}-main.ts`), rewriteImports(mode, output.code ?? ''));
  for (const [file, content] of output.files) {
    await fs.writeFile(
      path.join(dir, toFileName(mode, file)),
      rewriteImports(mode, content.code ?? ''),
    );
  }
}

export async function compile(
  mode: Mode,
  code: string,
  options: CompileOptions = {},
): Promise<compiler.Output> {
  return compiler.compile(ID, code, getOptions(mode, options));
}

/**
 * Compiles `code` for both sides, registers the server entries and loads
 * the module as `mode` sees it. Resets the remote call counter.
 */
export async function load<T>(mode: Mode, code: string, options: CompileOptions = {}): Promise<T> {
  const dir = path.join(OUTPUT, randomUUID());
  await fs.mkdir(dir, { recursive: true });

  const server = await compile('server', code, options);
  await writeOutput(dir, 'server', server);
  for (const entry of server.entries) {
    await import(path.join(dir, toFileName('server', entry)));
  }

  if (mode === 'client') {
    const client = await compile('client', code, options);
    await writeOutput(dir, 'client', client);
  }

  resetRemoteCalls();
  return (await import(path.join(dir, `${mode}-main.ts`))) as T;
}

export async function cleanup(): Promise<void> {
  await fs.rm(OUTPUT, { recursive: true, force: true });
}

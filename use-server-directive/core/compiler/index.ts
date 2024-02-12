import * as dismantle from 'dismantle';

const DEFAULT_PREFIX = '__server';
const DEFAULT_DIRECTIVE = 'use server';

export interface Options extends Pick<dismantle.Options, 'mode' | 'env'> {
  directive?: string;
  prefix?: string;
  pure?: boolean;
}

export type Output = dismantle.Output;
export type CodeOutput = dismantle.CodeOutput;

export async function compile(
  id: string,
  code: string,
  options: Options,
): Promise<Output> {
  return await dismantle.compile(id, code, {
    key: 'use-server-directive',
    mode: options.mode,
    env: options.env,
    definitions: [
      {
        type: 'block-directive',
        directive: options.directive || DEFAULT_DIRECTIVE,
        idPrefix: `/${options.prefix || DEFAULT_PREFIX}/`,
        pure: options.pure,
        target: {
          kind: 'named',
          source: `use-server-directive/${options.mode}`,
          name: '$$server',
        },
      },
    ],
  });
}

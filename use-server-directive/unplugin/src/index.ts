import type { FilterPattern } from '@rollup/pluginutils';
import { createFilter } from '@rollup/pluginutils';
import path from 'node:path';
import { createUnplugin } from 'unplugin';
import type { Options, Output } from 'use-server-directive/compiler';
import { compile } from 'use-server-directive/compiler';

export interface UseServerDirectivePluginFilter {
  include?: FilterPattern;
  exclude?: FilterPattern;
}

export interface UseServerDirectivePluginOptions extends Options {
  filter?: UseServerDirectivePluginFilter;
}

const DEFAULT_INCLUDE = 'src/**/*.{jsx,tsx,ts,js,mjs,cjs}';
const DEFAULT_EXCLUDE = 'node_modules/**/*.{jsx,tsx,ts,js,mjs,cjs}';

const useServerDirectivePlugin = createUnplugin(
  (options: UseServerDirectivePluginOptions) => {
    const filter = createFilter(
      options.filter?.include || DEFAULT_INCLUDE,
      options.filter?.exclude || DEFAULT_EXCLUDE,
    );

    let env: UseServerDirectivePluginOptions['env'];
    let files: Output['files'];

    return [
      {
        name: 'use-server-directive/loader',
        resolveId(id, importer) {
          if (!importer) {
            return undefined;
          }
          const joined = path.join(importer, id);
          if (files.has(joined)) {
            return joined;
          }
          return undefined;
        },
        load(id) {
          if (id.startsWith('\0')) {
            return null;
          }
          const result = files.get(id);
          if (!result) {
            return null;
          }
          return {
            code: result.code || '',
            map: result.map,
          };
        },
      },
      {
        name: 'use-server-directive/compiler',
        vite: {
          enforce: 'pre',
          configResolved(config) {
            env = config.mode !== 'production' ? 'development' : 'production';
          },
          async transform(code, id, opts) {
            if (filter(id)) {
              const result = await compile(id, code, {
                ...options,
                mode: opts?.ssr ? 'server' : 'client',
                env,
              });
              for (const [file, content] of result.files) {
                files.set(file, content);
              }
              return {
                code: result.code || '',
                map: result.map,
              };
            }
            return undefined;
          },
        },
        transformInclude(id) {
          return filter(id);
        },
        async transform(code, id) {
          const result = await compile(id, code, options);
          for (const [file, content] of result.files) {
            files.set(file, content);
          }
          return {
            code: result.code || '',
            map: result.map,
          };
        },
      },
    ];
  },
);

export default useServerDirectivePlugin;

import type { Options, Output } from 'use-server-directive/compiler';
import { compile } from 'use-server-directive/compiler';
import type { FilterPattern, Plugin } from 'vite';
import { createFilter } from 'vite';

export interface UseServerDirectivePluginFilter {
  include?: FilterPattern;
  exclude?: FilterPattern;
}

export interface UseServerDirectivePluginOptions extends Omit<Options, 'mode'> {
  filter?: UseServerDirectivePluginFilter;
}

const DEFAULT_INCLUDE = 'src/**/*.{jsx,tsx,ts,js,mjs,cjs}';
const DEFAULT_EXCLUDE = 'node_modules/**/*.{jsx,tsx,ts,js,mjs,cjs}';

const VIRTUAL_MODULE = 'use-server-directive/preload';

const useServerDirectivePlugin = (
  options: UseServerDirectivePluginOptions,
): Plugin[] => {
  const filter = createFilter(
    options.filter?.include || DEFAULT_INCLUDE,
    options.filter?.exclude || DEFAULT_EXCLUDE,
  );

  let env: UseServerDirectivePluginOptions['env'] = options.env;
  const files: Record<Options['mode'], Output['files']> = {
    server: new Map(),
    client: new Map(),
  };
  const entries: Record<Options['mode'], Set<string>> = {
    server: new Set(),
    client: new Set(),
  };

  return [
    {
      name: 'use-server-directive/setup',
      enforce: 'pre',
      configResolved(config) {
        env = config.mode !== 'production' ? 'development' : 'production';
      },
      buildStart() {
        files.client.clear();
        files.server.clear();
        entries.client.clear();
        entries.server.clear();
      },
    },
    {
      name: 'use-server-directive/preload',
      enforce: 'pre',
      resolveId(source) {
        if (source === VIRTUAL_MODULE) {
          return { id: VIRTUAL_MODULE, moduleSideEffects: true };
        }
        return null;
      },
      load(id, opts) {
        const mode = opts?.ssr ? 'server' : 'client';
        if (id === VIRTUAL_MODULE) {
          return [...entries[mode]]
            .map(entry => `import "${entry}";`)
            .join('\n');
        }
        return null;
      },
    },
    {
      name: 'use-server-directive/virtuals',
      enforce: 'pre',
      async resolveId(source, importer, opts) {
        if (importer) {
          const result = await this.resolve(source, importer, opts);
          const mode = opts?.ssr ? 'server' : 'client';
          if (result && files[mode].has(result.id)) {
            return result;
          }
        }
        return null;
      },
      load(id, opts) {
        const mode = opts?.ssr ? 'server' : 'client';
        const result = files[mode].get(id);
        if (result) {
          return {
            code: result.code || '',
            map: result.map,
          };
        }
        return null;
      },
    },
    {
      name: 'use-server-directive/compiler',
      async transform(code, id, opts) {
        const mode = opts?.ssr ? 'server' : 'client';
        if (filter(id)) {
          const result = await compile(id, code, {
            ...options,
            mode,
            env,
          });
          for (const [file, content] of result.files) {
            files[mode].set(file, content);
          }
          for (const entry of result.entries) {
            entries[mode].add(entry);
          }
          return {
            code: result.code || '',
            map: result.map,
          };
        }
        return null;
      },
    },
  ];
};

export default useServerDirectivePlugin;

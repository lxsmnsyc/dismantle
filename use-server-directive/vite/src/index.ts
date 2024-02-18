import type { Options, Output } from 'use-server-directive/compiler';
import { compile } from 'use-server-directive/compiler';
import type { FilterPattern, Plugin, ViteDevServer } from 'vite';
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

interface DeferredPromise<T> {
  reference: Promise<T>;
  resolve: (value: T) => void;
  reject: (value: any) => void;
}

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve: DeferredPromise<T>['resolve'];
  let reject: DeferredPromise<T>['reject'];

  return {
    reference: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    resolve(value) {
      resolve(value);
    },
    reject(value) {
      reject(value);
    },
  };
}

class Debouncer<T> {
  promise: DeferredPromise<T>;

  private timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private source: () => T) {
    this.promise = createDeferredPromise();
    this.defer();
  }

  defer(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    this.timeout = setTimeout(() => {
      this.promise.resolve(this.source());
    }, 1000);
  }
}

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

  const preload: Record<Options['mode'], Debouncer<string> | undefined> = {
    server: undefined,
    client: undefined,
  };

  let currentServer: ViteDevServer;

  return [
    {
      name: 'use-server-directive/setup',
      enforce: 'pre',
      configResolved(config) {
        env = config.mode !== 'production' ? 'development' : 'production';
      },
      configureServer(server) {
        currentServer = server;
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
          const current = new Debouncer(() =>
            [...entries[mode]].map(entry => `import "${entry}";`).join('\n'),
          );
          preload[mode] = current;
          return current.promise.reference;
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
        if (!filter(id)) {
          return null;
        }
        const preloader = preload[mode];
        if (preloader) {
          preloader.defer();
        }
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

        if (currentServer) {
          const target =
            currentServer.moduleGraph.getModuleById(VIRTUAL_MODULE);
          if (target) {
            currentServer.moduleGraph.invalidateModule(target);
          }
        }
        return {
          code: result.code || '',
          map: result.map,
        };
      },
    },
  ];
};

export default useServerDirectivePlugin;

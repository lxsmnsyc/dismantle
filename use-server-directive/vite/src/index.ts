import type { Options } from 'use-server-directive/compiler';
import { compile } from 'use-server-directive/compiler';
import type { FilterPattern, Plugin, ViteDevServer } from 'vite';
import { createFilter } from 'vite';
import { createManifest, mergeManifestRecord } from './manifest';

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

function invalidateModules(
  server: ViteDevServer | undefined,
  result: ReturnType<typeof mergeManifestRecord>,
): void {
  if (server) {
    for (let i = 0, len = result.invalidated.length; i < len; i++) {
      const target = server.moduleGraph.getModuleById(result.invalidated[i]);
      if (target) {
        server.moduleGraph.invalidateModule(target);
      }
    }
    if (result.invalidePreload) {
      const target = server.moduleGraph.getModuleById(VIRTUAL_MODULE);
      if (target) {
        server.moduleGraph.invalidateModule(target);
      }
    }
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

  const manifest = createManifest();

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
            [...manifest[mode].entries]
              .map(entry => `import "${entry}";`)
              .join('\n'),
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
          if (result && manifest[mode].files.has(result.id)) {
            return result;
          }
        }
        return null;
      },
      load(id, opts) {
        const mode = opts?.ssr ? 'server' : 'client';
        const result = manifest[mode].files.get(id);
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

        invalidateModules(
          currentServer,
          mergeManifestRecord(manifest[mode], {
            files: result.files,
            entries: new Set(result.entries),
          }),
        );

        return {
          code: result.code || '',
          map: result.map,
        };
      },
    },
  ];
};

export default useServerDirectivePlugin;

import { compile, type Options } from 'use-worker-directive/compiler';
import type { FilterPattern, Plugin } from 'vite';
import { createFilter } from 'vite';
import { createManifest, mergeManifestRecord } from './manifest';

export interface UseWorkerDirectivePluginFilter {
  include?: FilterPattern;
  exclude?: FilterPattern;
}

export interface UseWorkerDirectivePluginOptions
  extends Omit<Options, 'mode' | 'env'> {
  filter?: UseWorkerDirectivePluginFilter;
}

const DEFAULT_INCLUDE = 'src/**/*.{jsx,tsx,ts,js,mjs,cjs}';
const DEFAULT_EXCLUDE = 'node_modules/**/*.{jsx,tsx,ts,js,mjs,cjs}';

const CLIENT_VIRTUAL_MODULE = 'use-worker-directive/setup-client';
const SERVER_VIRTUAL_MODULE = 'use-worker-directive:server?worker';

const FOOTER_SCRIPT = `import { $$setup } from 'use-worker-directive/server';
            
$$setup();`;

const SETUP_SCRIPT = `import CustomWorker from '${SERVER_VIRTUAL_MODULE}';
import { $$worker } from 'use-worker-directive/client';

$$worker(new CustomWorker());`;

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

const useWorkerDirectivePlugin = (
  options: UseWorkerDirectivePluginOptions,
): Plugin[] => {
  const filter = createFilter(
    options.filter?.include || DEFAULT_INCLUDE,
    options.filter?.exclude || DEFAULT_EXCLUDE,
  );

  let env: Options['env'];

  const manifest = createManifest();

  const preload: Record<Options['mode'], Debouncer<string> | undefined> = {
    server: undefined,
    client: undefined,
  };

  const workerPlugin: Plugin[] = [
    {
      name: 'use-worker-directive/setup',
      enforce: 'pre',
      resolveId(source) {
        if (source === SERVER_VIRTUAL_MODULE) {
          return { id: SERVER_VIRTUAL_MODULE, moduleSideEffects: true };
        }
        if (source === CLIENT_VIRTUAL_MODULE) {
          return { id: CLIENT_VIRTUAL_MODULE, moduleSideEffects: true };
        }
        return null;
      },
      load(id) {
        if (
          id === SERVER_VIRTUAL_MODULE ||
          id === '/use-worker-directive:server?worker_file&type=module'
        ) {
          const current = new Debouncer(() => {
            const result = [...manifest.server.entries]
              .map(entry => `import "${entry}";`)
              .join('\n');

            return `${result}\n${FOOTER_SCRIPT}`;
          });
          preload.server = current;
          return current.promise.reference;
        }
        if (id === CLIENT_VIRTUAL_MODULE) {
          return SETUP_SCRIPT;
        }
        return null;
      },
    },
    {
      name: 'use-worker-directive/virtuals',
      enforce: 'pre',
      async resolveId(source, importer, opts) {
        if (importer) {
          const result = await this.resolve(source, importer, opts);
          if (!result) {
            return null;
          }
          if (manifest.server.files.has(result.id)) {
            return result;
          }
          if (manifest.client.files.has(result.id)) {
            return result;
          }
        }
        return null;
      },
      load(id) {
        const clientResult = manifest.client.files.get(id);
        if (clientResult) {
          return {
            code: clientResult.code || '',
            map: clientResult.map,
          };
        }
        const serverResult = manifest.server.files.get(id);
        if (serverResult) {
          return {
            code: serverResult.code || '',
            map: serverResult.map,
          };
        }
        return null;
      },
    },
  ];

  return [
    ...workerPlugin,
    {
      name: 'use-worker-directive/compiler',
      async transform(code, id) {
        if (!filter(id)) {
          return null;
        }
        const clientPreloader = preload.client;
        if (clientPreloader) {
          clientPreloader.defer();
        }
        const clientResult = await compile(id, code, {
          ...options,
          mode: 'client',
          env,
        });

        mergeManifestRecord(manifest.client, {
          files: clientResult.files,
          entries: new Set(clientResult.entries),
        });

        const serverPreloader = preload.server;
        if (serverPreloader) {
          serverPreloader.defer();
        }
        const serverResult = await compile(id, code, {
          ...options,
          mode: 'server',
          env,
        });

        mergeManifestRecord(manifest.server, {
          files: serverResult.files,
          entries: new Set(serverResult.entries),
        });

        return {
          code: clientResult.code || '',
          map: clientResult.map,
        };
      },
    },
  ];
};

export default useWorkerDirectivePlugin;

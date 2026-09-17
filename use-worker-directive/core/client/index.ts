import { deserialize } from 'seroval';
import { type SerializedWorkerData, sendWorkerData } from '../shared/data';

let WORKER: Worker;

export function $$worker(instance: Worker): void {
  WORKER = instance;
}

let INSTANCE = 0;

declare const $R: Record<string, unknown>;

async function createWorkerPromise(id: string, instance: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<SerializedWorkerData>): void => {
      if (!(event.data.id === id && event.data.instance === instance)) {
        return;
      }
      if (event.data.type === 'close') {
        WORKER.removeEventListener('message', onMessage);
        Reflect.deleteProperty($R, instance);
      } else if (event.data.type === 'error') {
        const reason = event.data.data;
        reject(
          reason instanceof Error
            ? reason
            : new Error('Worker function failed.', { cause: reason }),
        );
        Reflect.deleteProperty($R, instance);
      } else {
        const result = deserialize(event.data.data);
        if (event.data.initial) {
          resolve(result);
        }
      }
    };
    WORKER.addEventListener('message', onMessage);
  });
}

async function handler(id: string, args: unknown[]): Promise<unknown> {
  const instance = `use-worker-directive:${INSTANCE++}`;

  const result = createWorkerPromise(id, instance);

  sendWorkerData(WORKER, id, instance, args);

  return await result;
}

export function $$server(id: string): (...args: unknown[]) => Promise<unknown> {
  return async (...args) => handler(id, args);
}

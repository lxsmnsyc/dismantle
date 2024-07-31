import { deserialize } from 'seroval';
import { sendWorkerData, type SerializedWorkerData } from '../shared/data';

let WORKER: Worker;

export function $$worker(instance: Worker): void {
  WORKER = instance;
}

let INSTANCE = 0;

declare const $R: Record<string, unknown>;

function createWorkerPromise<R>(id: string, instance: string): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const onMessage = (event: MessageEvent<SerializedWorkerData>) => {
      if (!(event.data.id === id && event.data.instance === instance)) {
        return;
      }
      if (event.data.type === 'close') {
        WORKER.removeEventListener('message', onMessage);
        delete $R[instance];
      } else if (event.data.type === 'error') {
        reject(event.data.data);
        delete $R[instance];
      } else {
        const result = deserialize(event.data.data);
        if (event.data.initial) {
          resolve(result as R);
        }
      }
    };
    WORKER.addEventListener('message', onMessage);
  });
}

async function handler<T extends unknown[], R>(
  id: string,
  args: T,
): Promise<R> {
  const instance = `use-worker-directive:${INSTANCE++}`;

  const result = createWorkerPromise<R>(id, instance);

  sendWorkerData(WORKER, id, instance, args);

  return await result;
}

export function $$server<T extends unknown[], R>(
  id: string,
): (...args: T) => Promise<R> {
  return (...args: T): Promise<R> => handler(id, args);
}

import { deserialize } from 'seroval';
import { sendWorkerData, type SerializedWorkerData } from '../shared/data';

type ServerHandler<Args extends unknown[], Return> = (
  ...args: Args
) => Promise<Return>;

type HandlerRegistration = [
  id: string,
  callback: ServerHandler<unknown[], unknown>,
];

const REGISTRATIONS = new Map<string, HandlerRegistration>();

export function $$server(
  id: string,
  callback: ServerHandler<unknown[], unknown>,
): ServerHandler<unknown[], unknown> {
  const reg: HandlerRegistration = [id, callback];
  REGISTRATIONS.set(id, reg);
  return callback;
}

declare const $R: Record<string, unknown>;

export function $$setup(): void {
  self.onmessage = (event: MessageEvent<SerializedWorkerData>) => {
    if (event.data.type === 'next') {
      const result = deserialize(event.data.data);
      if (event.data.initial) {
        const registration = REGISTRATIONS.get(event.data.id);
        if (registration) {
          const [id, callback] = registration;
          if (id === event.data.id) {
            sendWorkerData(
              self,
              event.data.id,
              event.data.instance,
              callback.apply(null, result as unknown[]),
            );
            return;
          }
        }
        throw new Error(`Worker function "${event.data.id}" is not found.`);
      }
    } else {
      delete $R[event.data.instance];
    }
  };
}

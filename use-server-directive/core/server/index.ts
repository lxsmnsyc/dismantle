import type { SerovalJSON } from 'seroval';
import {
  crossSerializeStream,
  fromJSON,
  getCrossReferenceHeader,
} from 'seroval';
import {
  BlobPlugin,
  CustomEventPlugin,
  DOMExceptionPlugin,
  EventPlugin,
  FilePlugin,
  FormDataPlugin,
  HeadersPlugin,
  ReadableStreamPlugin,
  RequestPlugin,
  ResponsePlugin,
  URLPlugin,
  URLSearchParamsPlugin,
} from 'seroval-plugins/web';
import {
  USE_SERVER_DIRECTIVE_ID_HEADER,
  USE_SERVER_DIRECTIVE_INDEX_HEADER,
  type ServerHandler,
} from '../shared/utils';

type HandlerRegistration = [
  id: string,
  callback: ServerHandler<unknown[], unknown>,
];

const REGISTRATIONS = new Map<string, HandlerRegistration>();

function createChunk(data: string): Uint8Array {
  const encodeData = new TextEncoder().encode(data);
  const bytes = encodeData.length;
  const baseHex = bytes.toString(16);
  const totalHex = '00000000'.substring(0, 8 - baseHex.length) + baseHex; // 32-bit
  const head = new TextEncoder().encode(`;0x${totalHex};`);

  const chunk = new Uint8Array(12 + bytes);
  chunk.set(head);
  chunk.set(encodeData, 12);
  return chunk;
}

function serializeToStream<T>(instance: string, value: T): ReadableStream {
  return new ReadableStream({
    start(controller): void {
      crossSerializeStream(value, {
        scopeId: instance,
        plugins: [
          CustomEventPlugin,
          DOMExceptionPlugin,
          EventPlugin,
          FormDataPlugin,
          HeadersPlugin,
          ReadableStreamPlugin,
          RequestPlugin,
          ResponsePlugin,
          URLSearchParamsPlugin,
          URLPlugin,
        ],
        onSerialize(data, initial) {
          controller.enqueue(
            createChunk(
              initial ? `(${getCrossReferenceHeader(instance)},${data})` : data,
            ),
          );
        },
        onDone() {
          controller.close();
        },
        onError(error) {
          controller.error(error);
        },
      });
    },
  });
}

export async function handleRequest(
  request: Request,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const registration = REGISTRATIONS.get(url.pathname);
  const instance = request.headers.get(USE_SERVER_DIRECTIVE_INDEX_HEADER);
  const target = request.headers.get(USE_SERVER_DIRECTIVE_ID_HEADER);
  if (registration && instance) {
    const [id, callback] = registration;
    if (id !== target) {
      return new Response(
        serializeToStream(
          instance,
          new Error(`Invalid request for ${instance}`),
        ),
        {
          headers: {
            'Content-Type': 'text/javascript',
            [USE_SERVER_DIRECTIVE_INDEX_HEADER]: instance,
            [USE_SERVER_DIRECTIVE_ID_HEADER]: target || '',
          },
          status: 500,
        },
      );
    }
    try {
      const args = fromJSON<unknown[]>((await request.json()) as SerovalJSON, {
        plugins: [
          BlobPlugin,
          CustomEventPlugin,
          DOMExceptionPlugin,
          EventPlugin,
          FilePlugin,
          FormDataPlugin,
          HeadersPlugin,
          ReadableStreamPlugin,
          RequestPlugin,
          ResponsePlugin,
          URLSearchParamsPlugin,
          URLPlugin,
        ],
      });
      const result = callback(...args);
      return new Response(serializeToStream(instance, result), {
        headers: {
          'Content-Type': 'text/javascript',
          [USE_SERVER_DIRECTIVE_INDEX_HEADER]: instance,
          [USE_SERVER_DIRECTIVE_ID_HEADER]: id,
        },
        status: 200,
      });
    } catch (error) {
      return new Response(serializeToStream(instance, error), {
        headers: {
          'Content-Type': 'text/javascript',
          [USE_SERVER_DIRECTIVE_INDEX_HEADER]: instance,
          [USE_SERVER_DIRECTIVE_ID_HEADER]: id,
        },
        status: 500,
      });
    }
  }
  return undefined;
}

export function $$server(
  id: string,
  callback: ServerHandler<unknown[], unknown>,
): ServerHandler<unknown[], unknown> {
  const reg: HandlerRegistration = [id, callback];
  REGISTRATIONS.set(id, reg);
  return callback;
}

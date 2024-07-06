import { deserialize, toJSONAsync } from 'seroval';
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
} from '../shared/utils';

export type MaybePromise<T> = T | Promise<T>;

export type Interceptor = (request: Request) => MaybePromise<Request>;

const INTERCEPTORS: Interceptor[] = [];

export function interceptRequest(callback: Interceptor): void {
  INTERCEPTORS.push(callback);
}

async function serverHandler(id: string, init: RequestInit): Promise<Response> {
  let root = new Request(id, init);
  for (const intercept of INTERCEPTORS) {
    // eslint-disable-next-line no-await-in-loop
    root = await intercept(root);
  }
  const result = await fetch(root);
  return result;
}

declare const $R: Record<string, unknown>;

class SerovalChunkReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = new Uint8Array(0);
  private done = false;
  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  async readChunk(): Promise<void> {
    // if there's no chunk, read again
    const chunk = await this.reader.read();
    if (chunk.done) {
      this.done = true;
    } else {
      // repopulate the buffer
      const newBuffer = new Uint8Array(this.buffer.length + chunk.value.length);
      newBuffer.set(this.buffer);
      newBuffer.set(chunk.value, this.buffer.length);
      this.buffer = newBuffer;
    }
  }

  async next(): Promise<IteratorResult<string>> {
    // Check if the buffer is empty
    if (this.buffer.length === 0) {
      // if we are already done...
      if (this.done) {
        return {
          done: true,
          value: undefined,
        };
      }
      // Otherwise, read a new chunk
      await this.readChunk();
      return await this.next();
    }
    // Read the "byte header"
    // The byte header tells us how big the expected data is
    // so we know how much data we should wait before we
    // deserialize the data
    const head = new TextDecoder().decode(this.buffer.subarray(1, 11));
    const bytes = Number.parseInt(head, 16); // ;0x00000000;
    // Check if the buffer has enough bytes to be parsed
    while (bytes > this.buffer.length - 12) {
      // If it's not enough, and the reader is done
      // then the chunk is invalid.
      if (this.done) {
        throw new Error('Malformed server function stream.');
      }
      // Otherwise, we read more chunks
      await this.readChunk();
    }
    // Extract the exact chunk as defined by the byte header
    const partial = new TextDecoder().decode(
      this.buffer.subarray(12, 12 + bytes),
    );
    // The rest goes to the buffer
    this.buffer = this.buffer.subarray(12 + bytes);

    // Deserialize the chunk
    return {
      done: false,
      value: deserialize(partial),
    };
  }

  async drain(): Promise<void> {
    while (true) {
      const result = await this.next();
      if (result.done) {
        break;
      }
    }
  }
}

async function deserializeResponse<T>(
  id: string,
  response: Response,
): Promise<T> {
  const instance = response.headers.get(USE_SERVER_DIRECTIVE_INDEX_HEADER);
  const target = response.headers.get(USE_SERVER_DIRECTIVE_ID_HEADER);
  if (!instance || target !== id) {
    throw new Error(`Invalid response for ${id}.`);
  }
  if (!response.body) {
    throw new Error('missing body');
  }
  const reader = new SerovalChunkReader(response.body);

  const result = await reader.next();

  if (!result.done) {
    reader.drain().then(
      () => {
        delete $R[instance];
      },
      () => {
        // no-op
      },
    );
  }

  if (response.ok) {
    return result.value as T;
  }
  if (import.meta.env.DEV) {
    throw result.value;
  }
  throw new Error(`function "${id}" threw an unhandled server-side error.`);
}

async function serializeFunctionBody<T extends unknown[]>(
  body: T,
): Promise<string> {
  return JSON.stringify(
    await toJSONAsync(body, {
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
    }),
  );
}

let INSTANCE = 0;

async function handler<T extends unknown[], R>(
  id: string,
  args: T,
): Promise<R> {
  return deserializeResponse(
    id,
    await serverHandler(id, {
      headers: {
        [USE_SERVER_DIRECTIVE_INDEX_HEADER]: `use-server-directive:${INSTANCE++}`,
        [USE_SERVER_DIRECTIVE_ID_HEADER]: id,
      },
      method: 'POST',
      body: await serializeFunctionBody(args),
    }),
  );
}

export function $$server<T extends unknown[], R>(
  id: string,
): (...args: T) => Promise<R> {
  return (...args: T): Promise<R> => handler(id, args);
}

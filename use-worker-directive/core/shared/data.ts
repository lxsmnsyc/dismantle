import { crossSerializeStream, getCrossReferenceHeader } from 'seroval';
import {
  CustomEventPlugin,
  DOMExceptionPlugin,
  EventPlugin,
  FormDataPlugin,
  HeadersPlugin,
  ReadableStreamPlugin,
  RequestPlugin,
  ResponsePlugin,
  URLPlugin,
  URLSearchParamsPlugin,
} from 'seroval-plugins/web';

interface SerializedWorkerDataBase {
  id: string;
  instance: string;
}

interface SerializedWorkerDataNext extends SerializedWorkerDataBase {
  type: 'next';
  initial: boolean;
  data: string;
}

interface SerializedWorkerDataClose extends SerializedWorkerDataBase {
  type: 'close';
}

interface SerializedWorkerDataError extends SerializedWorkerDataBase {
  type: 'error';
  data: unknown;
}

export type SerializedWorkerData =
  | SerializedWorkerDataNext
  | SerializedWorkerDataClose
  | SerializedWorkerDataError;

export function sendWorkerData<T>(
  target: (Window & typeof globalThis) | Worker,
  id: string,
  instance: string,
  data: T,
): () => void {
  return crossSerializeStream(data, {
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
      target.postMessage({
        id,
        instance,
        type: 'next',
        initial,
        data: initial ? `(${getCrossReferenceHeader(instance)},${data})` : data,
      });
    },
    onDone() {
      target.postMessage({
        id,
        instance,
        type: 'done',
      });
    },
    onError(error) {
      target.postMessage({
        id,
        instance,
        type: 'error',
        data: error,
      });
    },
  });
}

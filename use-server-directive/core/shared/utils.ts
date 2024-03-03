export type ServerHandler<Args extends unknown[], Return> = (
  ...args: Args
) => Promise<Return>;

export const USE_SERVER_DIRECTIVE_INDEX_HEADER = 'X-Use-Server-Directive-Index';
export const USE_SERVER_DIRECTIVE_ID_HEADER = 'X-Use-Server-Directive-ID';

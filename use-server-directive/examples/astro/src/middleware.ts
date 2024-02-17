import 'use-server-directive/preload';

export function onRequest(_, next) {
  return next();
}

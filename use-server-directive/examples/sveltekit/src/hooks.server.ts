import { handleRequest } from 'use-server-directive/server';

import 'use-server-directive/preload';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  return (await handleRequest(event.request)) || (await resolve(event));
}

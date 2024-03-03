import type { JSX } from 'solid-js';
import { ClientOnly, Inner } from './Inner';

export default function Example(): JSX.Element {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

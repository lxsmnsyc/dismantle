import { render } from 'solid-js/web';
import { App } from './App';

import 'use-worker-directive/setup';

const root = document.getElementById('root');

if (root) {
  render(() => <App />, root);
}

import { compile } from 'dismantle';
import fs from 'node:fs/promises';
import path from 'node:path';

const target = path.join(process.cwd(), 'input.js');

const result = await compile(target, await fs.readFile(target, 'utf-8'), {
  key: 'example',
  mode: 'server',
  env: 'development',
  definitions: [
    {
      type: 'block-directive',
      directive: 'use server',
      target: {
        kind: 'named',
        name: '$$server',
        source: 'my-example',
      },
    },
    {
      type: 'function-directive',
      directive: 'use server',
      target: {
        kind: 'named',
        name: '$$server',
        source: 'my-example',
      },
      handle: {
        kind: 'named',
        name: '$$server',
        source: 'my-example/server',
      },
      // isomorphic: true,
    },
    {
      type: 'function-call',
      // isomorphic: true,
      source: {
        kind: 'named',
        name: 'server$',
        source: 'my-example',
      },
      target: {
        kind: 'named',
        name: 'registerServer$',
        source: 'my-example/server',
      },
      handle: {
        kind: 'named',
        name: '$$server',
        source: 'my-example/server',
      },
    },
  ],
});

console.log('ENTRY');
console.log(result.code);
console.log(result.map);

console.log('\nVIRTUALS');
for (const [name, content] of result.files) {
  console.log('FILE', name);
  console.log(content.code);
}

console.log('\nENTRIES');
console.log(result.entries);

console.log('\nROOTs');
console.log(result.roots);

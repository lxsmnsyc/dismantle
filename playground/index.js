import { compile } from 'dismantle';

const code = `
import { server$ } from 'my-example';

async function foo() {
  let count = 0;

  async function* log(value) {
    'use server';
    for (let i = 0; i < 10; i++) {
      yield value + i;
    }
    count++;
  }
}
`;

const result = await compile('/path/to/example.ts', code, {
  key: 'example',
  mode: 'server',
  env: 'development',
  directives: [
    {
      value: 'use server',
      import: {
        kind: 'named',
        name: '$$server',
        source: 'my-example',
      },
    },
  ],
  functions: [
    {
      source: {
        kind: 'named',
        name: 'server$',
        source: 'my-example',
      },
      target: {
        kind: 'named',
        name: 'server$',
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
  console.log(content);
}

console.log('\nENTRIES');
console.log(result.entries);

console.log('\nROOTs');
console.log(result.roots);

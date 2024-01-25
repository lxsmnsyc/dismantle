import { compile } from 'dismantle';

const code = `
import { server$ } from 'my-example';

const foo = 'foo';
const bar = 'bar';

function log(prefix, suffix) {
  console.log(prefix, suffix);
}

const logPrefix = server$((prefix) => {
  if (prefix === 'foo') {
    log(prefix, foo);
  } else {
    log(prefix, bar);
  }
});
`;

const result = await compile(code, '/path/to/example.ts', {
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

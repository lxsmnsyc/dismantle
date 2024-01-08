import { compile } from 'directive-splitter';

const code = `
const foo = 'foo';
const bar = 'bar';

async function log(prefix) {
  'use server';
  if (prefix === 'foo') {
    'use server';
    console.log(prefix, foo);
  } else {
    'use server';
    console.log(prefix, bar);
  }
}
`;

const result = await compile(code, 'example.ts', {
  mode: 'server',
  env: 'development',
  directives: [
    {
      value: 'use server',
      import: {
        kind: 'named',
        name: '$$server',
        source: 'use-server-directive',
      },
    },
  ],
});

console.log('ENTRY');
console.log(result.code);

console.log('\nVIRTUALS');
for (const [name, content] of result.files) {
  console.log('FILE', name);
  console.log(content);
}

console.log('\nENTRIES');
console.log(result.entries);

console.log('\nROOTs');
console.log(result.roots);

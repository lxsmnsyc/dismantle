import { compile } from 'directive-splitter';

const code = `
const foo = 'foo';
const bar = 'bar';
const message = foo + bar;

async function log(prefix) {
  'use server';
  console.log(prefix, message);
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
  getVirtualFileName(parsed, count) {
    return `./${parsed.base}?use-server=${count}${parsed.ext}`;
  },
});

console.log('ENTRY');
console.log(result.code);

console.log('VIRTUALS');
for (const [name, content] of result.files) {
  console.log(name);
  console.log(content);
}

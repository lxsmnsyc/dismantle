import fs from 'node:fs/promises';
import { compile } from 'use-server-directive/compiler';

console.log(
  await compile('input.ts', await fs.readFile('./input.js', 'utf-8'), {
    directive: 'use server',
    mode: 'server',
  }),
);

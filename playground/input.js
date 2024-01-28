// async function foo() {
//   let count = 0;

//   async function increment() {
//     'use server';

//     console.log('Current count:', count++);
//   }

//   await increment();
// }

import { server$ } from 'my-example';

const log = server$(message => {
  console.log('Server:', message);
});

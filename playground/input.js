async function foo() {
  let count = 0;

  async function increment() {
    'use server';

    console.log('Current count:', count++);
  }

  await increment();
}

async function foo() {
  const prefix = 'Message: ';

  async function postMessage(message) {
    'use server';
    await addMessage(prefix + message);
  }
}

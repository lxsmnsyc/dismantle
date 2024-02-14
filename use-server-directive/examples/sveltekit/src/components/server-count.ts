const prefix = 'Server Count';

export async function serverCount(value: number) {
  'use server';

  console.log('Received', value);
  const immediate = `${prefix}: ${value}`;
  return {
    immediate,
    delayed: new Promise(res => {
      setTimeout(res, 1000, immediate);
    }),
  };
}

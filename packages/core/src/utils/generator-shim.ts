import _generator from '@babel/generator';

type GeneratorShim = typeof _generator;

// https://github.com/babel/babel/issues/15269
const generator: GeneratorShim =
  typeof _generator !== 'function'
    ? (_generator as unknown as { default: GeneratorShim }).default
    : _generator;

export default generator;

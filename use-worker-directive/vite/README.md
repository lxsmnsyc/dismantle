# vite-plugin-use-worker-directive

> Vite plugin for [`use-worker-directive`](https://github.com/lxsmnsyc/dismantle/tree/main/use-worker-directive/core)

[![NPM](https://img.shields.io/npm/v/vite-plugin-use-worker-directive.svg)](https://www.npmjs.com/package/vite-plugin-use-worker-directive) [![JavaScript Style Guide](https://badgen.net/badge/code%20style/airbnb/ff5a5f?icon=airbnb)](https://github.com/airbnb/javascript)

## Install

```bash
npm install use-worker-directive
npm install --D vite-plugin-use-worker-directive
```

```bash
yarn add use-worker-directive
yarn add -D vite-plugin-use-worker-directive
```

```bash
pnpm add use-worker-directive
pnpm add -D vite-plugin-use-worker-directive
```

## Usage

```js
import useWorkerDirectivePlugin from 'vite-plugin-use-worker-directive';

useWorkerDirectivePlugin({
  filter: {
    include: 'src/**/*.{ts,js,tsx,jsx}',
    exclude: 'node_modules/**/*.{ts,js,tsx,jsx}',
  },
})
```

## Sponsors

![Sponsors](https://github.com/lxsmnsyc/sponsors/blob/main/sponsors.svg?raw=true)

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)

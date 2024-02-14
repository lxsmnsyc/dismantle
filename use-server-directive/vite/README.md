# vite-plugin-use-server-directive

> Vite plugin for [`use-server-directive`](https://github.com/lxsmnsyc/use-server-directive)

[![NPM](https://img.shields.io/npm/v/vite-plugin-use-server-directive.svg)](https://www.npmjs.com/package/vite-plugin-use-server-directive) [![JavaScript Style Guide](https://badgen.net/badge/code%20style/airbnb/ff5a5f?icon=airbnb)](https://github.com/airbnb/javascript)

## Install

```bash
npm install use-server-directive
npm install --D vite-plugin-use-server-directive
```

```bash
yarn add use-server-directive
yarn add -D vite-plugin-use-server-directive
```

```bash
pnpm add use-server-directive
pnpm add -D vite-plugin-use-server-directive
```

## Usage

```js
import useServerDirective from 'vite-plugin-use-server-directive';

useServerDirective({
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

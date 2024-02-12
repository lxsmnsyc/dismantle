# unplugin-use-server-directive

> [Unplugin](https://github.com/unjs/unplugin) for [`use-server-directive`](https://github.com/lxsmnsyc/use-server-directive)

[![NPM](https://img.shields.io/npm/v/unplugin-use-server-directive.svg)](https://www.npmjs.com/package/unplugin-use-server-directive) [![JavaScript Style Guide](https://badgen.net/badge/code%20style/airbnb/ff5a5f?icon=airbnb)](https://github.com/airbnb/javascript)

## Install

```bash
npm install use-server-directive
npm install --D unplugin-use-server-directive
```

```bash
yarn add use-server-directive
yarn add -D unplugin-use-server-directive
```

```bash
pnpm add use-server-directive
pnpm add -D unplugin-use-server-directive
```

## Usage

Please check out [`unplugin`](https://github.com/unjs/unplugin) to know more about how to use the plugins with `unplugin-use-server-directive` in your target bundler.

```js
import useServerDirective from 'unplugin-use-server-directive';

// Example: Rollup
useServerDirective.rollup({
  mode: 'server', // or 'client'
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

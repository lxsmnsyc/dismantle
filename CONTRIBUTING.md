# Contributing to dismantle

## Setup

Pull requests go against `main`.

1. Fork the repository and clone it.
2. Create a branch.

   ```bash
   git checkout -b MY_BRANCH_NAME
   ```

3. Enable pnpm through Corepack. The version comes from `packageManager` in `package.json`.

   ```bash
   corepack enable
   ```

4. Install dependencies.

   ```bash
   pnpm install
   ```

## Commands

Run these from the repository root.

- `pnpm build` builds every published package.
- `pnpm test` runs the tests. Run `pnpm build` first, because packages load `dismantle` from its build output.
- `pnpm type-check` type-checks everything with TypeScript 7. It also needs a build.
- `pnpm lint` runs [oxlint](https://oxc.rs/docs/guide/usage/linter) with type information. `pnpm lint:fix` applies fixes.
- `pnpm fmt` formats with [oxfmt](https://oxc.rs/docs/guide/usage/formatter). `pnpm fmt:check` only checks.

## Repository layout

| Directory | Package |
| --- | --- |
| `packages/core` | `dismantle`, the compiler and runtime. |
| `use-server-directive/core` | `use-server-directive`. |
| `use-server-directive/vite` | `vite-plugin-use-server-directive`. |
| `use-worker-directive/core` | `use-worker-directive`. |
| `use-worker-directive/vite` | `vite-plugin-use-worker-directive`. |
| `playground` | A script that prints compiler output for `playground/input.js`. Run it with `pnpm --filter playground start`. |
| `*/examples` | Demo apps. They are not built, linted or type-checked by CI. |

Packages are built with [tsdown](https://tsdown.dev/). Each one writes ESM, CJS and type declarations to `dist`. To add an entry, add it to `entry` in its `tsdown.config.ts`. The build updates `exports` in `package.json`. Add the entry to `typesVersions` by hand.

## Tests

- `packages/core/tests` compiles code for both sides, runs the output, and checks the results. Prefer these over checking generated code.
- `use-*-directive/core/tests` check the options each compiler passes to `dismantle`.

## Releases

Releases use [changesets](https://github.com/changesets/changesets). The published packages are versioned together.

1. Add a changeset for any change that affects a published package.

   ```bash
   pnpm cs:add
   ```

2. Merge the pull request into `main`.
3. The release workflow opens a "Version Packages" pull request.
4. Merging that pull request publishes to npm and creates the GitHub releases.

## Style

Formatting is decided by `pnpm fmt`. Lint rules come from [`@lxsmnsyc/oxlint-config`](https://www.npmjs.com/package/@lxsmnsyc/oxlint-config). Each exception in `oxlint.config.ts` has a comment explaining it.

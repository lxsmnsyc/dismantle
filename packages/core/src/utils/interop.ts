/**
 * Babel packages are CJS. Depending on the bundler, the default import is either
 * the export itself or a namespace object that holds it in `default`.
 * See https://github.com/babel/babel/issues/15269
 */
export function interopDefault<T>(value: T): T {
  if (typeof value === 'object' && value !== null && 'default' in value) {
    // The namespace object wraps the same export, so its `default` has the same type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return value.default as T;
  }
  return value;
}

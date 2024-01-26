import { describe, it, expect } from 'vitest';
import * as compiler from '../../src';
import { ID, CLIENT, SERVER } from './example';

describe('ArrowFunctionExpression', () => {
  describe('client', () => {
    it('should transform valid server functions', async () => {
      const code = `
      import { server$ } from 'my-example';
      const example = server$(() => 'foo bar');
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      import { server$ } from 'my-example';
      const outer = () => {
        const value = 'foo bar';
        const example = server$(() => value);
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      import { server$ } from 'my-example';
      const value = 'foo bar';
      const outer = () => {
        const example = server$(() => value);
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
  });
  describe('server', () => {
    it('should transform valid server functions', async () => {
      const code = `
      import { server$ } from 'my-example';
      const example = server$(() => 'foo bar');
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      import { server$ } from 'my-example';
      const outer = () => {
        const value = 'foo bar';
        const example = server$(() => value);
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      import { server$ } from 'my-example';
      const value = 'foo bar';
      const outer = () => {
        const example = server$(() => value);
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
  });
});

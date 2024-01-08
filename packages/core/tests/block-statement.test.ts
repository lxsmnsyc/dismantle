import { describe, it, expect } from 'vitest';
import * as compiler from '../src';
import { ID, CLIENT, SERVER } from './example';

describe('BlockStatement', () => {
  describe('client', () => {
    it('should transform valid server block statements', async () => {
      const code = `
      {
        'use server';
        await doStuff();
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should skip server block statements in non-async functions', async () => {
      const code = `
      const example = () => {
        {
          'use server';
          doStuff();
        }
      };
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      async function foo() {
        const value = 'foo bar';
        {
          'use server';
          await doStuff(value);
        }
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      {
        'use server';
        await doStuff(value);
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
  });
  describe('server', () => {
    it('should transform valid server block statements', async () => {
      const code = `
      {
        'use server';
        await doStuff();
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should skip server block statements in non-async functions', async () => {
      const code = `
      const example = () => {
        {
          'use server';
          doStuff();
        }
      };
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      async function foo() {
        const value = 'foo bar';
        {
          'use server';
          await doStuff(value);
        }
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      {
        'use server';
        await doStuff(value);
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
  });
});

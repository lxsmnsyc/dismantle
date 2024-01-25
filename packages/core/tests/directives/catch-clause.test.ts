import { describe, it, expect } from 'vitest';
import * as compiler from '../../src';
import { ID, CLIENT, SERVER } from './example';

describe('CatchClause', () => {
  describe('client', () => {
    it('should transform valid server try statements', async () => {
      const code = `
      try {
        doStuff();
      } catch (err) {
        'use server';
        await report(err);
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should skip server try statements in non-async functions', async () => {
      const code = `
      const example = () => {
        try {
          doStuff();
        } catch (err) {
          'use server';
          report(err);
        }
      };
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      async function foo() {
        const value = 'foo bar';
        try {
          doStuff();
        } catch (err) {
          'use server';
          await report(value, err);
        }
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      try {
        doStuff();
      } catch (err) {
        'use server';
        await report(value, err);
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
  });
  describe('server', () => {
    it('should transform valid server try statements', async () => {
      const code = `
      try {
        doStuff();
      } catch (err) {
        'use server';
        await report(err);
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should skip server try statements in non-async functions', async () => {
      const code = `
      const example = () => {
        try {
          doStuff();
        } catch (err) {
          'use server';
          report(err);
        }
      };
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      async function foo() {
        const value = 'foo bar';
        try {
          doStuff();
        } catch (err) {
          'use server';
          await report(err);
        }
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      try {
        doStuff();
      } catch (err) {
        'use server';
        await report(err);
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
  });
});

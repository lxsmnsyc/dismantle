import { describe, expect, it } from 'vitest';
import * as compiler from '../compiler';
import { CLIENT, ID, SERVER } from './example';

describe('ForOfStatement', () => {
  describe('client', () => {
    it('should transform valid server for-of statements', async () => {
      const code = `
      for (const item of items) {
        'use server';
        await doStuff();
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should skip server for-of statements in non-async functions', async () => {
      const code = `
      const example = () => {
        for (const item of items) {
          'use server';
          doStuff();
        }
      };
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      async function foo() {
        const value = 'foo bar';
        for (const item of items) {
          'use server';
          await doStuff(value);
        }
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      for (const item of items) {
        'use server';
        await doStuff(value);
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should transform break statements', async () => {
      const code = `
      for (const item of items) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should transform continue statements', async () => {
      const code = `
      for (const item of items) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should transform labeled break statements', async () => {
      const code = `
      foo: for (const item of items) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break foo;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should transform labeled continue statements', async () => {
      const code = `
      foo: for (const item of items) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue foo;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
  });
  describe('server', () => {
    it('should transform valid server for-of statements', async () => {
      const code = `
      for (const item of items) {
        'use server';
        await doStuff();
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should skip server for-of statements in non-async functions', async () => {
      const code = `
      const example = () => {
        for (const item of items) {
          'use server';
          doStuff();
        }
      };
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      async function foo() {
        const value = 'foo bar';
        for (const item of items) {
          'use server';
          await doStuff(value);
        }
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      for (const item of items) {
        'use server';
        await doStuff(value);
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should transform break statements', async () => {
      const code = `
      for (const item of items) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should transform continue statements', async () => {
      const code = `
      for (const item of items) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should transform labeled break statements', async () => {
      const code = `
      foo: for (const item of items) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break foo;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should transform labeled continue statements', async () => {
      const code = `
      foo: for (const item of items) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue foo;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
  });
});

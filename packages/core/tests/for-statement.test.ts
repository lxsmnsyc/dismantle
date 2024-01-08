import { describe, it, expect } from 'vitest';
import * as compiler from '../src';
import { ID, CLIENT, SERVER } from './example';

describe('ForStatement', () => {
  describe('client', () => {
    it('should transform valid server for statements', async () => {
      const code = `
      for (let i = 0; i < 10; i++) {
        'use server';
        await doStuff();
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should skip server for statements in non-async functions', async () => {
      const code = `
      const example = () => {
        for (let i = 0; i < 10; i++) {
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
        for (let i = 0; i < 10; i++) {
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
      for (let i = 0; i < 10; i++) {
        'use server';
        await doStuff(value);
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform break statements', async () => {
      const code = `
      for (let i = 0; i < 10; i++) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform continue statements', async () => {
      const code = `
      for (let i = 0; i < 10; i++) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform labeled break statements', async () => {
      const code = `
      foo: for (let i = 0; i < 10; i++) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break foo;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform labeled continue statements', async () => {
      const code = `
      foo: for (let i = 0; i < 10; i++) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue foo;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
  });
  describe('server', () => {
    it('should transform valid server for statements', async () => {
      const code = `
      for (let i = 0; i < 10; i++) {
        'use server';
        await doStuff();
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should skip server for statements in non-async functions', async () => {
      const code = `
      const example = () => {
        for (let i = 0; i < 10; i++) {
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
        for (let i = 0; i < 10; i++) {
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
      for (let i = 0; i < 10; i++) {
        'use server';
        await doStuff(value);
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform break statements', async () => {
      const code = `
      for (let i = 0; i < 10; i++) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform continue statements', async () => {
      const code = `
      for (let i = 0; i < 10; i++) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform labeled break statements', async () => {
      const code = `
      foo: for (let i = 0; i < 10; i++) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break foo;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform labeled continue statements', async () => {
      const code = `
      foo: for (let i = 0; i < 10; i++) {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue foo;
        }
        await doMoreStuff();
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
  });
});

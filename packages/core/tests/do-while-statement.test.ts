import { describe, it, expect } from 'vitest';
import * as compiler from '../src';
import { ID, CLIENT, SERVER } from './example';

describe('DoWhileStatement', () => {
  describe('client', () => {
    it('should transform valid server do-while statements', async () => {
      const code = `
      do {
        'use server';
        await doStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should skip server do-while statements in non-async functions', async () => {
      const code = `
      const example = () => {
        do {
          'use server';
          doStuff();
        } while (cond())
      };
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      async function foo() {
        const value = 'foo bar';
        do {
          'use server';
          await doStuff(value);
        } while (cond())
      }
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      do {
        'use server';
        await doStuff(value);
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform break statements', async () => {
      const code = `
      do {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break;
        }
        await doMoreStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform continue statements', async () => {
      const code = `
      do {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue;
        }
        await doMoreStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform labeled break statements', async () => {
      const code = `
      foo: do {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break foo;
        }
        await doMoreStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
    it('should transform labeled continue statements', async () => {
      const code = `
      foo: do {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue foo;
        }
        await doMoreStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, CLIENT)).toMatchSnapshot();
    });
  });
  describe('server', () => {
    it('should transform valid server do-while statements', async () => {
      const code = `
      do {
        'use server';
        await doStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should skip server do-while statements in non-async functions', async () => {
      const code = `
      const example = () => {
        do {
          'use server';
          doStuff();
        } while (cond())
      };
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      async function foo() {
        const value = 'foo bar';
        do {
          'use server';
          await doStuff(value);
        } while (cond())
      }
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      do {
        'use server';
        await doStuff(value);
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform break statements', async () => {
      const code = `
      do {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break;
        }
        await doMoreStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform continue statements', async () => {
      const code = `
      do {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue;
        }
        await doMoreStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform labeled break statements', async () => {
      const code = `
      foo: do {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          break foo;
        }
        await doMoreStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
    it('should transform labeled continue statements', async () => {
      const code = `
      foo: do {
        'use server';
        if (cond()) {
          await doStuff(value);
        } else {
          continue foo;
        }
        await doMoreStuff();
      } while (cond())
      `;
      expect(await compiler.compile(code, ID, SERVER)).toMatchSnapshot();
    });
  });
});

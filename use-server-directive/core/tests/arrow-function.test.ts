import { describe, expect, it } from 'vitest';
import * as compiler from '../compiler';
import { CLIENT, ID, SERVER } from './example';

describe('ArrowFunctionExpression', () => {
  describe('client', () => {
    it('should transform valid server functions', async () => {
      const code = `
      const example = async () => {
        'use server';
        return 'foo bar';
      };
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should skip non-async server functions', async () => {
      const code = `
      const example = () => {
        'use server';
        return 'foo bar';
      };
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      const outer = () => {
        const value = 'foo bar';
        const example = async () => {
          'use server';
          return value;
        };
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      const outer = () => {
        const example = async () => {
          'use server';
          return value;
        };
      }
      `;
      expect(await compiler.compile(ID, code, CLIENT)).toMatchSnapshot();
    });
  });
  describe('server', () => {
    it('should transform valid server functions', async () => {
      const code = `
      const example = async () => {
        'use server';
        return 'foo bar';
      };
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should skip non-async server functions', async () => {
      const code = `
      const example = () => {
        'use server';
        return 'foo bar';
      };
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should transform valid server functions with scope', async () => {
      const code = `
      const outer = () => {
        const value = 'foo bar';
        const example = async () => {
          'use server';
          return value;
        };
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
    it('should skip top-level values for scope', async () => {
      const code = `
      const value = 'foo bar';
      const outer = () => {
        const example = async () => {
          'use server';
          return value;
        };
      }
      `;
      expect(await compiler.compile(ID, code, SERVER)).toMatchSnapshot();
    });
  });
});

// test/stderror-symbol.test.ts
import { stderr } from '../src';
import { StdError } from '../src/StdError';

describe('StdError Symbol property isolation', () => {
    it('maxDepth Symbol does not appear in Object.keys()', () => {
        const err = new StdError('Test', { maxDepth: 10 });
        const keys = Object.keys(err);

        expect(keys).not.toContain('_maxDepth');
        expect(keys).not.toContain('maxDepth');
        // Symbol properties don't appear in Object.keys()
    });

    it('maxDepth Symbol does not appear in for...in loop', () => {
        const err = new StdError('Test', { maxDepth: 10 });
        const keys: string[] = [];

        for (const key in err) {
            keys.push(key);
        }

        expect(keys).not.toContain('_maxDepth');
        expect(keys).not.toContain('maxDepth');
    });

    it('maxDepth Symbol does not appear in JSON.stringify()', () => {
        const err = new StdError('Test', { maxDepth: 10 });
        const json = JSON.stringify(err);

        expect(json).not.toContain('_maxDepth');
        expect(json).not.toContain('maxDepth');
    });

    it('maxDepth Symbol does not appear in toString() output', () => {
        const err = new StdError('Test', { maxDepth: 10 });
        const str = err.toString();

        expect(str).not.toContain('_maxDepth');
        // Should not leak internal Symbol property
    });

    it('maxDepth Symbol does not appear in console output format', () => {
        const err = stderr(
            {
                message: 'Test error',
                code: 'TEST',
                cause: new Error('Cause'),
            },
            { maxDepth: 10 }
        );

        const str = err.toString();
        const json = JSON.stringify(err);

        // Neither toString nor JSON should show _maxDepth
        expect(str).not.toContain('_maxDepth');
        expect(json).not.toContain('_maxDepth');

        // But other properties should be present
        expect(str).toContain('Test error');
        expect(str).toContain('code:');
        expect(json).toContain('TEST');
    });

    it('Symbol property isolation prevents collision with real-world errors', () => {
        // User error has _maxDepth property (unlikely but possible)
        const userError = {
            message: 'User error',
            _maxDepth: 'user data',
            maxDepth: 'more user data',
        };

        const err = stderr(userError, { maxDepth: 10 });

        // User's properties should be preserved
        expect(err._maxDepth).toBe('user data');
        expect(err.maxDepth).toBe('more user data');

        // And should appear in output
        const str = err.toString();
        expect(str).toContain("_maxDepth: 'user data'");
        expect(str).toContain("maxDepth: 'more user data'");
    });

    it('Symbol property is accessible via getOwnPropertySymbols (by design)', () => {
        const err = new StdError('Test', { maxDepth: 10 });
        const symbols = Object.getOwnPropertySymbols(err);

        // Symbol properties ARE discoverable via getOwnPropertySymbols
        // This is expected and fine - they won't appear in normal enumeration
        expect(symbols.length).toBeGreaterThan(0);
    });

    it('Real-world fetch error does not show _maxDepth', () => {
        // Simulate the fetch error that revealed this issue
        const fetchError = new Error('fetch failed');
        fetchError.cause = {
            errno: -3008,
            code: 'ENOTFOUND',
            syscall: 'getaddrinfo',
            hostname: 'invalid-host.com',
        };

        const normalized = stderr(fetchError);
        const str = normalized.toString();

        // Should NOT contain _maxDepth
        expect(str).not.toContain('_maxDepth:');

        // Should contain actual error properties
        expect(str).toContain('fetch failed');
        expect(str).toContain('ENOTFOUND');
        expect(str).toContain('invalid-host.com');
    });
});

// test/review-round5.test.ts
// Fifth pre-3.0.0 review: a new fuzz property (toString() and toJSON() keep the same values) on main after #11.
// One regression test per proven finding. Each started as an it.fails proof of the bug.
import { describe, expect, it } from 'vitest';
import { StdError } from '../src';

const noStack = (e: StdError) => {
    e.stack = undefined;
    return e;
};

describe('V1: toString() hides a primitive cause or errors value at the depth limit, which toJSON() keeps', () => {
    // Primitives are always shown (they do not recurse), but formatCause() and formatErrors() check the depth
    // before looking at the value, so the whole slot becomes the depth marker.
    it('a primitive cause', () => {
        const e = noStack(new StdError('m', { maxDepth: 1, cause: 'why' }));
        expect(e.toJSON().cause).toBe('why');
        expect(e.toString()).toBe("Error: m\n  [cause]: 'why'");
    });

    it('a primitive errors value', () => {
        const e = noStack(new StdError('m', { maxDepth: 1, errors: 'oops' }));
        expect(e.toJSON().errors).toBe('oops');
        expect(e.toString()).toBe("Error: m\n  [errors]: 'oops'");
    });

    it('a primitive in an errors list', () => {
        const e = noStack(new StdError('m', { maxDepth: 1, errors: [new Error('a'), 'b'] }));
        expect(e.toJSON().errors).toEqual(['[Max depth of 1 reached]', 'b']);
        expect(e.toString()).toBe(['Error: m', '  [errors]: [', '    [0]: [Max depth of 1 reached]', "    [1]: 'b'", '  ]'].join('\n'));
    });
});

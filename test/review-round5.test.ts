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

describe('V2: toJSON() serializes a single error in the errors slot one level higher than a list item or toString()', () => {
    // serializeErrors() passes the parent's depth on: right for a list or a map (their items go one level down),
    // but a single error is itself the item. stderr() wraps it in a list, so its items are one level down too.
    it('a single error at the depth limit is cut, as in toString() and in a list', () => {
        const single = noStack(new StdError('m', { maxDepth: 1, errors: new Error('one') }));
        expect(single.toString()).toBe('Error: m\n  [errors]: [Max depth of 1 reached]');
        expect(new StdError('m', { maxDepth: 1, errors: [new Error('one')] }).toJSON().errors).toEqual(['[Max depth of 1 reached]']);
        expect(single.toJSON().errors).toBe('[Max depth of 1 reached]');
    });

    it('a Set of errors is a list of errors, as in toString() and stderr()', () => {
        const e = noStack(new StdError('m', { errors: new Set([{ message: 'only' }]) }));
        expect(e.toString()).toContain('[0]: Error: only');
        expect(e.toJSON().errors).toEqual([{ name: 'Error', message: 'only' }]);
    });
});

describe('V2 follow-up: a Map of errors keeps its depth', () => {
    it('cuts Map values at the same depth as toString()', () => {
        const e = noStack(new StdError('m', { maxDepth: 2, errors: new Map([['f', { a: { b: 1 } }]]) }));
        expect(e.toString()).toContain('f: { a: [Max depth of 2 reached] }');
        expect(e.toJSON().errors).toEqual([['f', { a: '[Max depth of 2 reached]' }]]);
    });
});

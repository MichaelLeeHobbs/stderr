// test/review-round4.test.ts
// Fourth pre-3.0.0 review (mutation testing of the round 3 fixes, docs examples, packed tarball, long fuzz runs).
// One regression test per proven finding (S1-S2). Each started as an it.fails proof of the bug.
import { describe, expect, it } from 'vitest';
import { stderr, StdError } from '../src';

const noStack = (e: StdError) => {
    e.stack = undefined;
    return e;
};

describe('S1: toJSON() lets an array property of a StdError built directly go two levels past toString() and stderr()', () => {
    // ADR-002: "Same depth counting for toString() and toJSON()". serializeError() walks the items of a top-level
    // array property at the error's own depth, where toString(), stderr() and a nested array put them two levels deeper.
    const data = { list: [{ a: { b: 1 } }], obj: { a: { b: 1 } } };

    it('toString() and stderr() stop the array items at maxDepth (for comparison)', () => {
        const e = noStack(new StdError('m', { maxDepth: 2, ...data }));
        expect(e.toString()).toContain('list: [[Max depth of 2 reached]]');
        expect(stderr({ name: 'E', message: 'm', ...data }, { maxDepth: 2 }).list).toEqual(['[Max depth of 2 reached]']);
    });

    it('toJSON() stops them at the same depth', () => {
        expect(new StdError('m', { maxDepth: 2, ...data }).toJSON().list).toEqual(['[Max depth of 2 reached]']);
    });
});

describe('S2: toString() cuts a non-error value in the errors slot one level earlier than toJSON()', () => {
    // formatErrors() formats a value that is not an error at depth + 1, but serializeErrors() at the item's own depth
    it('in an errors list', () => {
        const e = noStack(new StdError('m', { maxDepth: 2, errors: [{ a: { b: 1 } }] }));
        expect(e.toJSON().errors).toEqual([{ a: '[Max depth of 2 reached]' }]);
        expect(e.toString()).toContain('[0]: { a: [Max depth of 2 reached] }');
    });

    it('in an errors map', () => {
        const e = noStack(new StdError('m', { maxDepth: 2, errors: { f: { a: { b: 1 } } } }));
        expect(e.toJSON().errors).toEqual({ f: { a: '[Max depth of 2 reached]' } });
        expect(e.toString()).toContain('f: { a: [Max depth of 2 reached] }');
    });
});

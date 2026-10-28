// test/review-round6.test.ts
// Sixth pre-3.0.0 review: the consistency fuzz property with small maxProperties/maxArrayLength, on main after #12.
// One regression test per proven finding. Each started as an it.fails proof of the bug.
import { describe, expect, it } from 'vitest';
import { StdError } from '../src';

const noStack = (e: StdError) => {
    e.stack = undefined;
    return e;
};

describe('W1: toString() shows inline arrays and objects past maxArrayLength and maxProperties', () => {
    // README: "Both respect the instance limits". formatValue() shows up to MAX_INLINE_ITEMS (3) items inline
    // whatever the limits; the constructor only cuts top-level metadata, so a cause, an errors value, a nested
    // value or a property added later is shown past the limit (toJSON() cuts it).
    it('an array cause over maxArrayLength', () => {
        const e = noStack(new StdError('m', { maxArrayLength: 1, cause: ['a', 'b'] }));
        expect(e.toJSON().cause).toEqual(['a']);
        expect(e.toString()).toBe('Error: m\n  [cause]: [Array(2)]');
    });

    it('a nested object over maxProperties', () => {
        const e = noStack(new StdError('m', { maxProperties: 1 }));
        e.meta = { a: 1, b: 2 };
        expect(e.toJSON().meta).toEqual({ a: 1, _truncated: 'Property count (2) exceeds limit (1), showing first 1' });
        expect(e.toString()).toBe('Error: m\n  meta: {Object with 2 keys}');
    });
});

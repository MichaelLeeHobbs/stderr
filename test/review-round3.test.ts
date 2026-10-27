// test/review-round3.test.ts
// Third independent pre-3.0.0 review (mutation testing, docs audit, packed tarball, long fuzz runs).
// Each describe proves one finding; the it.fails cases fail today and must pass once the finding is fixed.
import { describe, expect, it } from 'vitest';
import { stderr, StdError, tryCatch } from '../src';

/** toString() without the stack lines */
const text = (e: StdError) =>
    e
        .toString()
        .split('\n')
        .filter(l => !/^\s+at /.test(l))
        .join('\n');

describe('R1: toString() drops the message of an Error kept in metadata or in a non-array errors slot', () => {
    // formatValue() lists Object.keys(): message is not enumerable on an Error, and StdError makes `name` an own
    // enumerable property, so a nested error prints as `{ name: 'Error' }` (stderr) or `{}` (native Error). toJSON() keeps it.
    it.fails('stderr(): an Error in a metadata property keeps its message', () => {
        const e = stderr({ name: 'E', message: 'outer', original: new Error('boom') });
        expect(text(e)).toContain('boom');
    });

    it.fails('stderr(): an Error inside a metadata array keeps its message', () => {
        const e = stderr({ name: 'E', message: 'outer', list: [new Error('boom')] });
        expect(text(e)).toContain('boom');
    });

    it.fails('new StdError(): a native Error in a property keeps its message', () => {
        expect(text(new StdError('outer', { original: new Error('boom') }))).toContain('boom');
    });

    it.fails('new StdError(): a single Error in errors keeps its message', () => {
        expect(text(new StdError('outer', { errors: new Error('boom') }))).toContain('boom');
    });

    it.fails('new StdError(): a Map of errors keeps its entries', () => {
        expect(text(new StdError('outer', { errors: new Map([['email', new Error('boom')]]) }))).toContain('boom');
    });

    it('toJSON() keeps the message (for comparison)', () => {
        const e = stderr({ name: 'E', message: 'outer', original: new Error('boom') });
        expect(JSON.stringify(e)).toContain('boom');
    });
});

describe('R2: stderr() replaces a primitive inside an array with the depth marker, but keeps it inside an object', () => {
    // normalizeProperty() returns primitives before the depth check (the #16 rule: primitives do not recurse),
    // but array items go through normalizeUnknown(), which checks depth first.
    it.fails('keeps a number in an array at the same depth as a number in an object', () => {
        const e = stderr({ name: 'E', message: 'm', obj: { x: 1 }, arr: [1] }, { maxDepth: 2 });
        expect(e.obj).toEqual({ x: 1 });
        expect(e.arr).toEqual([1]);
    });
});

describe('R3: toJSON()/toString() leave items out without a _truncated marker', () => {
    // README: "Both respect the instance limits ... and mark what they leave out with `_truncated`."
    // (A cut `errors` array in toJSON() is G3, fixed in PR #9.)
    it.fails('toJSON(): an array property added after construction is marked', () => {
        const e = new StdError('m', { maxArrayLength: 2 });
        e.list = [1, 2, 3, 4];
        const json = e.toJSON();
        expect(json.list).toHaveLength(2);
        expect(Object.keys(json).some(k => k.startsWith('_truncated'))).toBe(true);
    });

    it.fails('toString(): an errors map over maxProperties is marked (toJSON() marks it)', () => {
        const e = new StdError('m', { errors: { a: 'x', b: 'y', c: 'z' }, maxProperties: 1 });
        expect(JSON.stringify(e.toJSON().errors)).toContain('_truncated');
        expect(text(e)).toContain('_truncated');
    });

    it.fails('stderr(): an array inside an array over maxArrayLength is marked', () => {
        const e = stderr({ name: 'E', message: 'm', matrix: [[1, 2, 3, 4, 5]] }, { maxArrayLength: 3 });
        expect(e.matrix).toEqual([[1, 2, 3]]);
        expect(JSON.stringify(e)).toContain('_truncated');
    });
});

describe('R4: tryCatch is typed Promise<Result> but returns a plain Result when a Promise-returning function throws synchronously', () => {
    // e.g. tryCatch(() => fetch(new URL(input))) with a bad URL: `new URL` throws before fetch() returns a Promise.
    // `await` still works, but .then()/.catch()/.finally() (used in docs/BestPractices.md) throw a TypeError.
    const fetchLike = (input: string): Promise<number> => {
        if (!input) throw new TypeError('Invalid URL');
        return Promise.resolve(1);
    };

    it.fails('the declared Promise has a then() method', () => {
        const r = tryCatch(() => fetchLike(''));
        expect(() => r.then(x => x)).not.toThrow();
    });
});

describe('R5: a Date or RegExp thrown at the root loses its value, unlike the same value as a cause', () => {
    it('as a cause it keeps its value (for comparison)', () => {
        expect((stderr(new Error('x', { cause: new Date(0) })).cause as StdError).message).toBe('1970-01-01T00:00:00.000Z');
        expect((stderr(new Error('x', { cause: /abc/ })).cause as StdError).message).toBe('/abc/');
    });

    it.fails('at the root a Date keeps its value', () => {
        expect(stderr(new Date(0)).message).toBe('1970-01-01T00:00:00.000Z');
    });

    it.fails('at the root a RegExp keeps its value', () => {
        expect(stderr(/abc/).message).toBe('/abc/');
    });
});

describe('R6: a boxed string thrown at the root becomes an empty error with one property per character', () => {
    it.fails('keeps the text as the message', () => {
        const e = stderr(new String('oops'));
        expect(e.message).toBe('oops');
        expect(e['0']).toBeUndefined();
    });
});

describe('R7: a map of errors with two symbol keys of the same description keeps only one (B9 fixed this for properties)', () => {
    it.fails('keeps both entries', () => {
        const e = stderr({ message: 'm', errors: { [Symbol('field')]: 'a', [Symbol('field')]: 'b' } });
        expect(Object.keys(e.errors as object)).toHaveLength(2);
    });
});

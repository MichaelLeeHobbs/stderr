// test/review-round3.test.ts
// Third independent pre-3.0.0 review (mutation testing, docs audit, packed tarball, long fuzz runs).
// One regression test per proven finding (R1-R7). Each started as an it.fails proof of the bug.
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
    it('stderr(): an Error in a metadata property keeps its message', () => {
        const e = stderr({ name: 'E', message: 'outer', original: new Error('boom') });
        expect(text(e)).toContain('boom');
    });

    it('stderr(): an Error inside a metadata array keeps its message', () => {
        const e = stderr({ name: 'E', message: 'outer', list: [new Error('boom')] });
        expect(text(e)).toContain('boom');
    });

    it('new StdError(): a native Error in a property keeps its message', () => {
        expect(text(new StdError('outer', { original: new Error('boom') }))).toContain('boom');
    });

    it('new StdError(): a single Error in errors keeps its message', () => {
        expect(text(new StdError('outer', { errors: new Error('boom') }))).toContain('boom');
    });

    it('new StdError(): a Map of errors keeps its entries', () => {
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
    it('keeps a number in an array at the same depth as a number in an object', () => {
        const e = stderr({ name: 'E', message: 'm', obj: { x: 1 }, arr: [1] }, { maxDepth: 2 });
        expect(e.obj).toEqual({ x: 1 });
        expect(e.arr).toEqual([1]);
    });
});

describe('R3: toJSON()/toString() leave items out without a _truncated marker', () => {
    // README: "Both respect the instance limits ... and mark what they leave out with `_truncated`."
    // (A cut `errors` array in toJSON() is G3, fixed in PR #9.)
    it('toJSON(): an array property added after construction is marked', () => {
        const e = new StdError('m', { maxArrayLength: 2 });
        e.list = [1, 2, 3, 4];
        const json = e.toJSON();
        expect(json.list).toHaveLength(2);
        expect(Object.keys(json).some(k => k.startsWith('_truncated'))).toBe(true);
    });

    it('toString(): an errors map over maxProperties is marked (toJSON() marks it)', () => {
        const e = new StdError('m', { errors: { a: 'x', b: 'y', c: 'z' }, maxProperties: 1 });
        expect(JSON.stringify(e.toJSON().errors)).toContain('_truncated');
        expect(text(e)).toContain('_truncated');
    });

    it('a Map or Set over maxArrayLength on a StdError built directly is marked once', () => {
        const e = new StdError('m', {
            maxArrayLength: 2,
            m: new Map([
                [1, 1],
                [2, 2],
                [3, 3],
            ]),
        });
        e.s = new Set([1, 2, 3]);
        const json = e.toJSON();
        expect(json._truncated_m).toContain('Map size (3)');
        expect(json._truncated_s).toContain('Set size (3)');
        expect(json._truncated_m_2).toBeUndefined();
    });

    it('a nested plain object marks its own cut array', () => {
        const json = new StdError('m', { maxArrayLength: 2 });
        json.meta = { list: [1, 2, 3] };
        expect(json.toJSON().meta).toEqual({ list: [1, 2], _truncated_list: 'Array length (3) exceeds limit (2), showing first 2' });
    });

    it('toString(): an errors array over maxArrayLength is marked', () => {
        expect(text(new StdError('m', { errors: [1, 2, 3], maxArrayLength: 2 }))).toContain("_truncated: 'Array length (3)");
    });

    // Documented limitation (README): an array directly inside an array has no key to hang a marker on
    it('stderr(): an array inside an array is cut without a marker', () => {
        const e = stderr({ name: 'E', message: 'm', matrix: [[1, 2, 3, 4, 5]] }, { maxArrayLength: 3 });
        expect(e.matrix).toEqual([[1, 2, 3]]);
    });
});

describe('R4: tryCatch is typed Promise<Result> but returns a plain Result when a Promise-returning function throws synchronously', () => {
    // e.g. tryCatch(() => fetch(new URL(input))) with a bad URL: `new URL` throws before fetch() returns a Promise.
    // `await` still works, but .then()/.catch()/.finally() (used in docs/BestPractices.md) throw a TypeError.
    const fetchLike = (input: string): Promise<number> => {
        if (!input) throw new TypeError('Invalid URL');
        return Promise.resolve(1);
    };

    // No runtime check can tell such a function from a sync one, so this is documented (README, BestPractices):
    // always `await` the result of tryCatch instead of chaining .then().
    it('await gives the failed Result either way', async () => {
        const r = await tryCatch(() => fetchLike(''));
        expect(r.ok).toBe(false);
        expect(r.error?.message).toBe('Invalid URL');
    });
});

describe('R5: a Date or RegExp thrown at the root loses its value, unlike the same value as a cause', () => {
    it('as a cause it keeps its value (for comparison)', () => {
        expect((stderr(new Error('x', { cause: new Date(0) })).cause as StdError).message).toBe('1970-01-01T00:00:00.000Z');
        expect((stderr(new Error('x', { cause: /abc/ })).cause as StdError).message).toBe('/abc/');
    });

    it('at the root a Date keeps its value', () => {
        expect(stderr(new Date(0)).message).toBe('1970-01-01T00:00:00.000Z');
    });

    it('at the root a RegExp keeps its value', () => {
        expect(stderr(/abc/).message).toBe('/abc/');
    });
});

describe('R6: a boxed string thrown at the root becomes an empty error with one property per character', () => {
    it('keeps the text as the message', () => {
        const e = stderr(new String('oops'));
        expect(e.message).toBe('oops');
        expect(e['0']).toBeUndefined();
    });

    it('unboxes every wrapper type, at the root, as a cause and in metadata', () => {
        expect(stderr(Object(7)).message).toBe('7');
        expect(stderr(Object(false)).message).toBe('false');
        expect(stderr(Object(5n)).message).toBe('5');
        expect(stderr(Object(Symbol('s'))).message).toBe('Symbol(s)');
        expect((stderr(new Error('x', { cause: new String('why') })).cause as StdError).message).toBe('why');
        const meta = { s: new String('v'), n: Object(1), sym: Object(Symbol('q')) };
        expect(stderr({ message: 'm', name: 'E', meta }).meta).toEqual({ s: 'v', n: 1, sym: 'Symbol(q)' });
    });

    it('does not unbox a lookalike', () => {
        const fake = Object.create(String.prototype) as object;
        expect(stderr(fake).message).toBe('');
    });
});

describe('R7: a map of errors with two symbol keys of the same description keeps only one (B9 fixed this for properties)', () => {
    it('keeps both entries', () => {
        const e = stderr({ message: 'm', errors: { [Symbol('field')]: 'a', [Symbol('field')]: 'b' } });
        expect(Object.keys(e.errors as object)).toHaveLength(2);
    });
});

describe('R3 follow-up: markers added by toJSON() stay within maxProperties + 1 (found by the hostile fuzz suite)', () => {
    const markerCount = (o: object) => Object.keys(o).filter(k => k === '_truncated' || k.startsWith('_truncated_')).length;

    it('does not mark the value of a carried marker as a cut collection', () => {
        const errors = { name: 0n, cause: 'x', _truncated: new Set([1, 2, 3]) };
        const json = new StdError('x', { maxDepth: 1, maxProperties: 1, maxArrayLength: 2, errors }).toJSON();
        expect(markerCount(json.errors as object)).toBeLessThanOrEqual(2);
    });

    it('drops cut markers beyond the allowance', () => {
        const e = new StdError('x', { maxProperties: 1, maxArrayLength: 1 });
        Object.assign(e, { _truncated: 'carried', a: [1, 2], b: [1, 2], errors: [1, 2] });
        expect(markerCount(e.toJSON())).toBeLessThanOrEqual(2);
    });
});

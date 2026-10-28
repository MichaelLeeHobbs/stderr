// test/mutation-gaps.test.ts
// Behavior that mutation testing (Stryker) showed no test pinned down: each test fails if the matching
// condition, limit or call in src is changed. Grouped by the walk they cover.
import { describe, expect, it } from 'vitest';
import { stderr, StdError, tryCatch } from '../src';

const lines = (e: StdError) => e.toString().split('\n');
const withoutStack = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, val) => (k === 'stack' ? undefined : val)));

describe('toString()', () => {
    it('shows up to three stack lines for the root and none for a nested error', () => {
        const cause = new Error('inner');
        cause.stack = 'Error: inner\n    at innerFrame (inner.ts:1:1)';
        const e = new StdError('outer', { cause });
        e.stack = 'Error: outer\n    at a (a.ts:1:1)\n    at b (b.ts:2:2)\n    at c (c.ts:3:3)\n    at d (d.ts:4:4)';
        expect(lines(e)).toEqual(['Error: outer', '  at a (a.ts:1:1)', '  at b (b.ts:2:2)', '  at c (c.ts:3:3)', '  [cause]: Error: inner']);
    });

    it('prints no [cause] or [errors] line when there is none', () => {
        const text = stderr(new Error('x')).toString();
        expect(text).not.toContain('[cause]');
        expect(text).not.toContain('[errors]');
    });

    it('prints an error shared by two properties in full both times (not [Circular])', () => {
        const shared = new Error('shared');
        const e = new StdError('m', { a: shared, b: shared });
        const text = e.toString();
        expect(text.match(/Error: shared/g)).toHaveLength(2);
        expect(text).not.toContain('[Circular]');
    });

    it('prints an error shared by cause and errors in full both times', () => {
        const shared = new StdError('shared');
        shared.stack = undefined;
        const e = new StdError('m', { cause: shared, errors: [shared] });
        e.stack = undefined;
        expect(e.toString().match(/Error: shared/g)).toHaveLength(2);
    });

    it('shows an object of exactly MAX_INLINE_ITEMS (3) keys inline and summarizes four', () => {
        const e = new StdError('m', { three: { a: 1, b: 2, c: 3 }, four: { a: 1, b: 2, c: 3, d: 4 } });
        const text = e.toString();
        expect(text).toContain('three: { a: 1, b: 2, c: 3 }');
        expect(text).toContain('four: {Object with 4 keys}');
    });

    it('marks an errors map of exactly maxProperties entries as complete', () => {
        const e = new StdError('m', { errors: new Map([['a', 'x']]), maxProperties: 1 });
        expect(e.toString()).not.toContain('_truncated');
    });
});

describe('toJSON() of a StdError built directly', () => {
    it('counts nesting through plain objects towards maxDepth', () => {
        const json = new StdError('m', { maxDepth: 3, a: { b: { c: { d: 1 } } } }).toJSON();
        expect(json.a).toEqual({ b: { c: '[Max depth of 3 reached]' } });
    });

    it('counts nesting through Map entries towards maxDepth', () => {
        const json = new StdError('m', { maxDepth: 3, m: new Map([[{ k: { deep: 1 } }, 'v']]) }).toJSON();
        expect(json.m).toEqual([[{ k: '[Max depth of 3 reached]' }, 'v']]);
    });

    it('serializes a Set value as metadata, not as an error', () => {
        const json = new StdError('m', { s: new Set([{ name: 'bob' }]) }).toJSON();
        expect(json.s).toEqual([{ name: 'bob' }]);
    });

    it('keeps { name } objects in metadata arrays and objects as data, not errors', () => {
        const json = new StdError('m', { list: [{ name: 'bob' }], obj: { inner: { name: 'bob' } } }).toJSON();
        expect(json.list).toEqual([{ name: 'bob' }]);
        expect(json.obj).toEqual({ inner: { name: 'bob' } });
    });

    it('serializes an error shared by two properties in full both times', () => {
        const shared = new Error('shared');
        const json = new StdError('m', { a: shared, b: shared }).toJSON() as Record<string, { message: string }>;
        expect(json.a.message).toBe('shared');
        expect(json.b.message).toBe('shared');
    });

    it('serializes an object shared by two properties in full both times', () => {
        const shared = { id: 1 };
        const json = new StdError('m', { a: shared, b: { inner: shared } }).toJSON();
        expect(json.a).toEqual({ id: 1 });
        expect(json.b).toEqual({ inner: { id: 1 } });
    });

    it('serializes a Map shared by two properties in full both times', () => {
        const shared = new Map([['k', 1]]);
        const json = new StdError('m', { a: shared, b: shared }).toJSON();
        expect(json.a).toEqual([['k', 1]]);
        expect(json.b).toEqual([['k', 1]]);
    });

    it('adds no _truncated marker for an errors array of exactly maxArrayLength', () => {
        const json = new StdError('m', { errors: [1, 2], maxArrayLength: 2 }).toJSON();
        expect(Object.keys(json).filter(k => k.startsWith('_truncated'))).toEqual([]);
    });

    it('adds no _truncated marker for a short errors array or an errors map', () => {
        expect(Object.keys(new StdError('m', { errors: [1] }).toJSON())).toEqual(['name', 'message', 'stack', 'errors']);
        expect(Object.keys(new StdError('m', { errors: { a: 'x', b: 'y' }, maxArrayLength: 1 }).toJSON())).not.toContain('_truncated');
    });
});

describe('stderr() normalization', () => {
    it('has no cause when the input has none', () => {
        const e = stderr(new Error('x'));
        expect(e.cause).toBeUndefined();
        expect('cause' in e).toBe(false);
        expect('errors' in e).toBe(false);
    });

    it('applies maxDepth to the normalized metadata itself, not only to toJSON()', () => {
        const e = stderr({ message: 'm', name: 'E', a: { b: { c: 1 } }, arr: [[1]] }, { maxDepth: 2 });
        expect(e.a).toEqual({ b: '[Max depth of 2 reached]' });
        expect(e.arr).toEqual(['[Max depth of 2 reached]']);
    });

    it('applies maxDepth to an object message', () => {
        const e = stderr({ name: 'E', message: { text: 'hi' } }, { maxDepth: 1 });
        expect(e.message).toBe('[Max depth of 1 reached]');
    });

    it('cuts Map and Set metadata to maxArrayLength', () => {
        const e = stderr(
            {
                message: 'm',
                name: 'E',
                m: new Map([
                    [1, 1],
                    [2, 2],
                    [3, 3],
                ]),
                s: new Set([1, 2, 3]),
            },
            { maxArrayLength: 2 }
        );
        expect((e.m as Map<unknown, unknown>).size).toBe(2);
        expect((e.s as Set<unknown>).size).toBe(2);
    });

    it('cuts a Map of errors to maxProperties', () => {
        const errors = new Map([
            ['a', 'x'],
            ['b', 'y'],
            ['c', 'z'],
        ]);
        const e = stderr({ message: 'm', errors }, { maxProperties: 2 });
        expect(Object.keys(e.errors as object)).toEqual(['a', 'b', '_truncated']);
    });

    it('adds no marker at exactly the limit', () => {
        const markers = (o: object) => Object.keys(o).filter(k => k.startsWith('_truncated'));
        const opts = { maxArrayLength: 2, maxProperties: 2 };
        expect(markers(stderr({ message: 'm', errors: [1, 2] }, opts))).toEqual([]);
        expect(
            markers(
                stderr(
                    {
                        message: 'm',
                        errors: new Map([
                            ['a', 1],
                            ['b', 2],
                        ]),
                    },
                    opts
                ).errors as object
            )
        ).toEqual([]);
        expect(markers(stderr({ message: 'm', name: 'E', list: [1, 2], s: new Set([1, 2]) }, opts))).toEqual([]);
        expect(markers(new StdError('m', { ...opts, list: [1, 2], s: new Set([1, 2]) }))).toEqual([]);
    });

    it('drops functions and stringifies symbol keys inside nested metadata', () => {
        const meta = { fn: () => 1, [Symbol('s')]: 1, kept: 2 };
        expect(stderr({ message: 'm', name: 'E', meta }).meta).toEqual({ 'Symbol(s)': 1, kept: 2 });
    });

    it('carries up to maxProperties truncation markers and drops the rest', () => {
        // Two markers with limit 2 are kept as they are; a third marker is over the allowance
        const two = stderr({ message: 'm', name: 'E', a: 1, _truncated: 'x', _truncated_y: 'y' }, { maxProperties: 2 });
        expect(Object.keys(two).filter(k => k.startsWith('_truncated'))).toEqual(['_truncated', '_truncated_y']);
        const three = stderr({ message: 'm', name: 'E', a: 1, _truncated: 'x', _truncated_y: 'y', _truncated_z: 'z' }, { maxProperties: 2 });
        expect(three._truncated_z).toBeUndefined();
        expect(String(three._truncated_2)).toContain('Property count (4)');
    });

    it('is the same on a JSON round trip of its output', () => {
        const e = stderr({ message: 'm', name: 'E', cause: { message: 'c', name: 'C' }, errors: [{ message: 'e', name: 'X' }], data: [1, { a: 2 }] });
        const once = withoutStack(e);
        expect(withoutStack(stderr(once))).toEqual(once);
    });
});

describe('tryCatch', () => {
    it('keeps the original stack of a thrown Error', () => {
        const thrown = new Error('x');
        const r = tryCatch(() => {
            throw thrown;
        });
        expect(r.error?.stack).toBe(thrown.stack);
    });

    it('keeps the original stack of a rejected Error', async () => {
        const thrown = new Error('x');
        const r = await tryCatch(Promise.reject(thrown));
        expect(r.error?.stack).toBe(thrown.stack);
    });
});

describe('StdError static defaults', () => {
    it('reads back what was set', () => {
        const before = [StdError.defaultMaxDepth, StdError.defaultMaxProperties, StdError.defaultMaxArrayLength];
        try {
            StdError.defaultMaxDepth = 5;
            StdError.defaultMaxProperties = 6;
            StdError.defaultMaxArrayLength = 7;
            expect([StdError.defaultMaxDepth, StdError.defaultMaxProperties, StdError.defaultMaxArrayLength]).toEqual([5, 6, 7]);
            expect(new StdError('m', { list: [1, 2, 3, 4, 5, 6, 7, 8] }).list).toHaveLength(7);
        } finally {
            [StdError.defaultMaxDepth, StdError.defaultMaxProperties, StdError.defaultMaxArrayLength] = before;
        }
    });

    it('starts at the documented defaults', () => {
        expect([StdError.defaultMaxDepth, StdError.defaultMaxProperties, StdError.defaultMaxArrayLength]).toEqual([8, 1000, 10000]);
        expect([stderr.maxDepth, stderr.maxProperties, stderr.maxArrayLength]).toEqual([8, 1000, 10000]);
    });

    it('rejects a fractional limit with TypeError and an out-of-range one with RangeError', () => {
        expect(() => stderr('x', { maxDepth: 2.5 })).toThrow(TypeError);
        expect(() => stderr('x', { maxDepth: 1001 })).toThrow(RangeError);
        expect(() => stderr('x', { maxDepth: 0 })).toThrow(RangeError);
        expect(() => stderr('x', { maxDepth: 1000 })).not.toThrow();
        expect(() => stderr('x', { maxDepth: 1 })).not.toThrow();
    });
});

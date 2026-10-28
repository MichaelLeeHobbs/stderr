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

// Round 4: survivors of the run on the round 3 fixes
const noStack = (e: StdError) => {
    e.stack = undefined;
    return e;
};
const markerKeys = (o: object) => Object.keys(o).filter(k => k === '_truncated' || k.startsWith('_truncated_'));

describe('toString() layout', () => {
    it('prints an errors list, an errors map and a nested list with exact indentation', () => {
        const list = noStack(new StdError('m', { errors: [new Error('a'), 'b', 'c'], maxArrayLength: 2 }));
        expect(list.toString()).toBe(
            [
                'Error: m',
                '  [errors]: [',
                '    [0]: Error: a',
                "    [1]: 'b'",
                "    _truncated: 'Array length (3) exceeds limit (2), showing first 2'",
                '  ]',
            ].join('\n')
        );
        const map = noStack(new StdError('m', { errors: { f: new Error('bad'), g: 'x' } }));
        expect(map.toString()).toBe(['Error: m', '  [errors]: {', '    f: Error: bad', "    g: 'x'", '  }'].join('\n'));
        const nested = noStack(new StdError('m', { cause: noStack(new StdError('c', { errors: [new Error('a')] })) }));
        expect(nested.toString()).toBe(['Error: m', '  [cause]: Error: c', '    [errors]: [', '      [0]: Error: a', '    ]'].join('\n'));
    });

    it('prints a Map of errors with exact layout, a marker over maxProperties and {} when empty', () => {
        const map = noStack(
            new StdError('m', {
                errors: new Map<string, unknown>([
                    ['a', 'x'],
                    ['b', 'y'],
                    ['c', 'z'],
                ]),
                maxProperties: 1,
            })
        );
        expect(map.toString()).toBe(
            ['Error: m', '  [errors]: {', "    a: 'x'", "    _truncated: 'Property count (3) exceeds limit (1), showing first 1'", '  }'].join('\n')
        );
        expect(noStack(new StdError('m', { errors: new Map() })).toString()).toBe('Error: m\n  [errors]: {}');
    });

    it('adds no marker line to a short errors list or map', () => {
        expect(noStack(new StdError('m', { errors: ['a'] })).toString()).not.toContain('_truncated');
        expect(noStack(new StdError('m', { errors: { a: 'x' } })).toString()).not.toContain('_truncated');
    });

    it('prints a string in the errors slot quoted, and a Date or RegExp by value', () => {
        expect(noStack(new StdError('m', { errors: 'oops' })).toString()).toBe("Error: m\n  [errors]: 'oops'");
        expect(noStack(new StdError('m', { errors: new Date(0) })).toString()).toBe('Error: m\n  [errors]: 1970-01-01T00:00:00.000Z');
    });

    it('prints a RegExp property, and a function inside a metadata array by its tag', () => {
        const e = noStack(new StdError('m', { r: /a/, list: [() => 1] }));
        expect(e.toString()).toBe('Error: m\n  r: /a/\n  list: [[object Function]]');
    });

    it('prints an object or array shared by two properties in full both times', () => {
        const obj = { a: 1 };
        const arr = [1];
        expect(noStack(new StdError('m', { x: obj, y: obj, p: arr, q: arr })).toString()).toBe('Error: m\n  x: { a: 1 }\n  y: { a: 1 }\n  p: [1]\n  q: [1]');
    });

    it('counts array items towards maxDepth', () => {
        expect(noStack(new StdError('m', { maxDepth: 3, list: [[{ a: 1 }]] })).toString()).toBe('Error: m\n  list: [[[Max depth of 3 reached]]]');
    });

    it('falls back to the name Error and an empty message', () => {
        expect(lines(new StdError())[0]).toBe('Error');
        const e = noStack(new StdError('m'));
        e.name = '';
        (e as { message: unknown }).message = null;
        expect(e.toString()).toBe('Error');
        expect(e.toJSON()).toEqual({ name: 'Error', message: '' });
    });

    it('prints no [cause] or [errors] line, and toJSON() has no such key, when they are null', () => {
        const e = noStack(new StdError('m'));
        e.cause = null;
        e.errors = null;
        expect(e.toString()).toBe('Error: m');
        expect(Object.keys(e.toJSON())).toEqual(['name', 'message']);
    });

    it('labels a Map of errors by a key object as its class or its message', () => {
        class Field {}
        const inherited = Object.create({ message: 'inherited' }) as object;
        const text = noStack(
            new StdError('m', {
                errors: new Map<unknown, unknown>([
                    [new Field(), 'x'],
                    [inherited, 'y'],
                    [{ message: 'own' }, 'z'],
                ]),
            })
        ).toString();
        expect(text).toContain("[object Field]: 'x'");
        expect(text).toContain("[object Object]: 'y'");
        expect(text).toContain("own: 'z'");
    });
});

describe('StdError constructor', () => {
    it('is bounded by StdError.defaultMaxProperties and defaultMaxArrayLength when no limit is given', () => {
        const before = [StdError.defaultMaxProperties, StdError.defaultMaxArrayLength];
        try {
            StdError.defaultMaxProperties = 2;
            StdError.defaultMaxArrayLength = 2;
            const e = new StdError('m', { a: 1, b: 2, c: 3 });
            expect(Object.keys(e)).toEqual(['name', 'a', 'b', '_truncated']);
            expect(new StdError('m', { list: [1, 2, 3] }).list).toEqual([1, 2]);
        } finally {
            [StdError.defaultMaxProperties, StdError.defaultMaxArrayLength] = before;
        }
    });

    it('does not copy the options it reads (message, name, limits) as properties', () => {
        const e = new StdError('m', { message: 'x', name: 'N', maxDepth: 3, maxProperties: 5, maxArrayLength: 5, ok: 1 });
        expect(Object.keys(e)).toEqual(['name', 'ok']);
        expect(e.message).toBe('m');
    });

    it('keeps a symbol value as a symbol, and an object whose length getter throws', () => {
        const sym = Symbol('v');
        const weird = {
            get length(): number {
                throw new Error('no');
            },
        };
        const e = new StdError('m', { sym, weird });
        expect(e.sym).toBe(sym);
        expect(e.weird).toBe(weird);
    });

    it('marks an over-limit array once and does not take { size } for a Set', () => {
        const e = new StdError('m', { maxArrayLength: 2, list: [1, 2, 3], sized: { size: 5 } });
        expect(markerKeys(e)).toEqual(['_truncated_list']);
    });
});

describe('toJSON() of a StdError built directly (round 4)', () => {
    it('serializes a map of errors and an errors list leniently', () => {
        expect(new StdError('m', { errors: { a: { message: 'only' } } }).toJSON().errors).toEqual({ a: { name: 'Error', message: 'only' } });
        expect(new StdError('m', { errors: [{ message: 'only' }] }).toJSON().errors).toEqual([{ name: 'Error', message: 'only' }]);
    });

    it('serializes a Date, RegExp, Map or Set in the errors slot by value, not as a map', () => {
        const errorsOf = (errors: unknown) => new StdError('m', { errors }).toJSON().errors;
        expect(errorsOf(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
        expect(errorsOf(/a/)).toBe('/a/');
        expect(errorsOf(new Map([['k', 1]]))).toEqual([['k', 1]]);
        expect(errorsOf(new Set([1]))).toEqual([1]);
    });

    it('serializes an array shared by two properties in full both times', () => {
        const shared = [1];
        const json = new StdError('m', { x: shared, y: { z: shared } }).toJSON();
        expect(json.x).toEqual([1]);
        expect(json.y).toEqual({ z: [1] });
    });

    it('turns a Date past maxDepth into the marker, and a function in an array into null', () => {
        const e = new StdError('m', { maxDepth: 2 });
        e.d = { x: new Date(0) };
        expect(e.toJSON().d).toEqual({ x: '[Max depth of 2 reached]' });
        const f = new StdError('m');
        f.list = [() => 1];
        expect(JSON.parse(JSON.stringify(f)).list).toEqual([null]);
    });

    it('marks a circular Map and a circular object', () => {
        const m = new Map<string, unknown>();
        m.set('self', m);
        const o: Record<string, unknown> = { a: 1 };
        o.self = o;
        const e = new StdError('m');
        Object.assign(e, { m, o });
        expect(e.toJSON().m).toEqual([['self', '[Circular]']]);
        expect(e.toJSON().o).toEqual({ a: 1, self: '[Circular]' });
    });

    it('cuts Map entries added after construction to maxArrayLength', () => {
        const e = new StdError('m', { maxArrayLength: 2 });
        e.m = new Map([
            [1, 1],
            [2, 2],
            [3, 3],
        ]);
        expect(e.toJSON().m).toEqual([
            [1, 1],
            [2, 2],
        ]);
    });

    it('keeps error-shaped Map keys and values as data, and counts Map and Set items towards maxDepth', () => {
        expect(new StdError('m', { m: new Map([[{ message: 'k' }, { message: 'v' }]]) }).toJSON().m).toEqual([[{ message: 'k' }, { message: 'v' }]]);
        const json = new StdError('m', { maxDepth: 2, m: new Map([[{ k: 1 }, { a: 1 }]]), s: new Set([{ a: 1 }]) }).toJSON();
        expect(json.m).toEqual([['[Max depth of 2 reached]', '[Max depth of 2 reached]']]);
        expect(json.s).toEqual(['[Max depth of 2 reached]']);
    });

    it('serializes an object whose property descriptors cannot be read as {}', () => {
        const e = new StdError('m');
        e.p = new Proxy(
            { a: 1 },
            {
                getOwnPropertyDescriptor() {
                    throw new Error('no');
                },
            }
        );
        expect(e.toJSON().p).toEqual({});
    });

    it('counts only marker keys against the marker allowance', () => {
        const e = new StdError('m', { maxProperties: 3, maxArrayLength: 1 });
        Object.assign(e, { a: [1, 2], b: [1, 2], c: [1, 2] });
        expect(markerKeys(e.toJSON())).toEqual(['_truncated_a', '_truncated_b', '_truncated_c']);
    });

    it('does not mark the Set value of a carried _truncated key', () => {
        const e = new StdError('m', { maxArrayLength: 2 });
        e._truncated = new Set([1, 2, 3]);
        expect(markerKeys(e.toJSON())).toEqual(['_truncated']);
    });
});

describe('stderr() normalization (round 4)', () => {
    it('counts an array cause towards maxDepth', () => {
        const e = stderr({ message: 'm', cause: [{ message: 'a', cause: { message: 'b' } }] }, { maxDepth: 3 });
        const agg = e.cause as StdError;
        expect(agg.name).toBe('AggregateError');
        expect(((agg.errors as StdError[])[0].cause as StdError).message).toBe('[Max depth of 3 reached]');
    });

    it('keeps a non-enumerable field of a map of errors', () => {
        const errors = {};
        Object.defineProperty(errors, 'email', { value: 'invalid', enumerable: false });
        expect(Object.keys(stderr({ message: 'm', errors }).errors as object)).toEqual(['email']);
    });

    it('has no cause when it is null, and drops a non-string stack of a cause', () => {
        expect('cause' in stderr({ message: 'm', cause: null })).toBe(false);
        expect((stderr({ message: 'm', cause: { message: 'c', stack: 42 } }).cause as StdError).stack).toBeUndefined();
    });

    it('names an error without a name Error', () => {
        expect(stderr({ message: 'm' }).name).toBe('Error');
    });

    it('makes a function in a metadata array its tag and drops a key called prototype', () => {
        const e = stderr({ message: 'm', name: 'E', list: [() => 1], meta: { prototype: 1, a: 2 } });
        expect(e.list).toEqual(['[object Function]']);
        expect(e.meta).toEqual({ a: 2 });
    });

    it('normalizes an Error without a message in metadata as an error', () => {
        expect(stderr({ message: 'm', name: 'E', inner: new Error() }).inner).toBeInstanceOf(StdError);
    });

    it('treats an object with only a stack, errors or cause as an error in the cause slot', () => {
        for (const cause of [{ stack: 'S' }, { errors: [] }, { cause: 'x' }]) {
            expect(stderr({ message: 'm', cause }).cause).toBeInstanceOf(StdError);
        }
    });

    it('keeps carried markers over the data limit, and counts data keys in the message', () => {
        const e = stderr({ message: 'm', name: 'E', a: 1, b: 2, _truncated_x: 'y' }, { maxProperties: 1 });
        expect(e._truncated_x).toBe('y');
        expect(e.a).toBe(1);
        expect(e._truncated).toBe('Property count (2) exceeds limit (1), showing first 1');
    });

    it('exposes stderr.maxDepth and friends as enumerable, non-configurable accessors', () => {
        for (const name of ['maxDepth', 'maxProperties', 'maxArrayLength']) {
            const desc = Object.getOwnPropertyDescriptor(stderr, name)!;
            expect(desc.enumerable).toBe(true);
            expect(desc.configurable).toBe(false);
        }
    });

    it('names the limit and the bad value in its errors', () => {
        expect(() => stderr('x', { maxDepth: 2.5 })).toThrow('maxDepth must be an integer, got: 2.5');
        expect(() => stderr('x', { maxDepth: '2' as unknown as number })).toThrow('maxDepth must be an integer, got: string');
        expect(() => stderr('x', { maxDepth: 1001 })).toThrow('maxDepth must be between 1 and 1000, got: 1001');
    });
});

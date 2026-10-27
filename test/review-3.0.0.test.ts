// test/review-3.0.0.test.ts
//
// Pre-3.0.0 review (2026-10-27). Each test asserts the CORRECT behaviour and fails on main (6f9247e).
// IDs match the findings report. Type-level (B2) and packaging (B3) proofs are in the report.
import { describe, expect, it } from 'vitest';
import { stderr } from '../src/stderr';
import { StdError } from '../src/StdError';

const noStack = (e: StdError): unknown => JSON.parse(JSON.stringify(e, (k, v) => (k === 'stack' ? undefined : v)));

describe('pre-3.0.0 review', () => {
    describe('B1 a non-array `errors` value is mistaken for a single error and overwrites name/message', () => {
        it('keeps the message when errors is a single Error', () => {
            const e = stderr({ name: 'ValidationError', message: 'Validation failed', errors: new Error('email invalid') });
            expect(e.message).toBe('Validation failed'); // got 'AggregateError'
        });

        it('keeps a validation map that has a field called "name" as a map', () => {
            const e = stderr({ name: 'ValidationError', message: 'Validation failed', errors: { name: 'required', email: 'invalid' } });
            expect(e.message).toBe('Validation failed'); // got 'AggregateError'
            expect(Array.isArray(e.errors)).toBe(false); // got [StdError name='required' email='invalid']
        });
    });

    describe('B4 toJSON()/toString() ignore maxProperties on the error own properties', () => {
        it('bounds properties added after construction', () => {
            const e = new StdError('x', { maxProperties: 2 });
            for (let i = 0; i < 10; i++) e[`p${i}`] = i;
            expect(Object.keys(e.toJSON()).filter(k => k.startsWith('p')).length).toBeLessThanOrEqual(2); // got 10
        });

        it('bounds properties of a native Error used as cause', () => {
            const cause = new Error('c') as Error & Record<string, unknown>;
            for (let i = 0; i < 10; i++) cause[`p${i}`] = i;
            const json = new StdError('x', { maxProperties: 2, cause }).toJSON() as { cause: Record<string, unknown> };
            expect(Object.keys(json.cause).filter(k => k.startsWith('p')).length).toBeLessThanOrEqual(2); // got 10
        });
    });

    describe('B5 StdError accepts limits that stderr() rejects', () => {
        it('rejects maxDepth: 0 (toJSON otherwise drops the whole error)', () => {
            // JSON.stringify(new StdError('real message', { maxDepth: 0 })) === '{"name":"Error","message":"[Max depth of 0 reached]"}'
            expect(() => new StdError('real message', { maxDepth: 0 })).toThrow(RangeError);
        });

        it('rejects maxDepth: NaN (toJSON otherwise has no depth bound and overflows the stack)', () => {
            expect(() => new StdError('x', { maxDepth: NaN })).toThrow(TypeError);
        });

        it('rejects an invalid StdError.defaultMaxDepth', () => {
            const prev = StdError.defaultMaxDepth;
            try {
                expect(() => {
                    StdError.defaultMaxDepth = -1;
                }).toThrow(RangeError);
            } finally {
                StdError.defaultMaxDepth = prev;
            }
        });
    });

    describe('B6 an error with no stack gets a stack that points into stderr-lib', () => {
        it('does not invent a stack for a plain-object cause', () => {
            const e = stderr({ message: 'x', cause: { message: 'y' } });
            expect(String((e.cause as StdError).stack)).not.toMatch(/normalizeObjectToError/);
        });
    });

    describe('B7 array, Date, Map and falsy values in cause/errors are mangled or dropped', () => {
        it('does not turn an array cause into an error with a `length` property', () => {
            const e = stderr({ message: 'x', cause: ['a', 'b'] });
            expect(noStack(e)).not.toHaveProperty('cause.length'); // got { 0:'a', 1:'b', name:'Error', message:'', length:2 }
        });

        it('keeps a Date cause', () => {
            const e = stderr({ message: 'x', cause: new Date(0) });
            expect(JSON.stringify(e)).toContain('1970-01-01'); // got cause { name:'Error', message:'' }
        });

        it('keeps the entries of a Map of errors', () => {
            const e = stderr({ message: 'x', errors: new Map([['email', new Error('invalid')]]) });
            expect(JSON.stringify(e)).toContain('invalid'); // got errors: {}
        });

        it('keeps a falsy errors value the way it keeps a falsy cause', () => {
            expect(stderr({ message: 'x', cause: 0 }).cause).toBeDefined();
            expect(stderr({ message: 'x', errors: 0 }).errors).toBeDefined(); // got undefined
        });
    });

    describe('B8 toJSON() can return values JSON.stringify cannot serialize', () => {
        it('serializes a cause whose stack is a circular object', () => {
            const circ: Record<string, unknown> = {};
            circ.self = circ;
            expect(() => JSON.stringify(new StdError('x', { cause: { message: 'm', stack: circ } }))).not.toThrow();
        });

        it('serializes a cause whose message is a bigint', () => {
            expect(() => JSON.stringify(new StdError('x', { cause: { name: 'E', message: 10n } }))).not.toThrow();
        });
    });

    describe('B9 smaller normalization inconsistencies', () => {
        it('keeps both of two symbol keys with the same description', () => {
            const e = stderr({ message: 'x', [Symbol('id')]: 1, [Symbol('id')]: 2 });
            expect(Object.values(e.toJSON())).toContain(1); // only 2 survives, under 'Symbol(id)'
        });

        it('is idempotent when a truncation marker was added (ADR-007 corollary)', () => {
            const input: Record<string, unknown> = { name: 'E', message: 'm' };
            for (let i = 0; i < 5; i++) input[`p${i}`] = i;
            const once = stderr(input, { maxProperties: 2 });
            // _truncated changes from "Property count (5) ..." to "Property count (3) ..."
            expect(noStack(stderr(once, { maxProperties: 2 }))).toEqual(noStack(once));
        });
    });
});

describe('pre-3.0.0 review: edge cases of the fixes', () => {
    it('B1 still defaults name and message to AggregateError when the input has neither', () => {
        const e = stderr({ errors: new Error('inner') });
        expect(e.name).toBe('AggregateError');
        expect(e.message).toBe('AggregateError');
    });

    it('B1 treats a real Error with name and message in errors as a single error', () => {
        const e = stderr({ message: 'outer', errors: { name: 'TypeError', message: 'bad' } });
        expect((e.errors as StdError[])[0].message).toBe('bad');
    });

    it('B4 adds a _truncated line to toString()', () => {
        const e = new StdError('x', { maxProperties: 1 });
        e.a = 1;
        e.b = 2;
        expect(e.toString()).toContain("_truncated: 'Property count (2) exceeds limit (1), showing first 1'");
        expect(e.toString()).not.toContain('b: 2');
    });

    it('B4 bounds string and symbol keys of a plain object together', () => {
        const e = new StdError('x', { maxProperties: 2, obj: { a: 1, [Symbol('s')]: 2, c: 3 } });
        expect(e.toJSON().obj).toEqual({ a: 1, c: 3, _truncated: 'Property count (3) exceeds limit (2), showing first 2' });
    });

    it('B5 validates all StdError limits and defaults', () => {
        expect(() => new StdError('x', { maxProperties: 0 })).toThrow(RangeError);
        expect(() => new StdError('x', { maxArrayLength: 1.5 })).toThrow(TypeError);
        const prev = [StdError.defaultMaxProperties, StdError.defaultMaxArrayLength];
        try {
            expect(() => {
                StdError.defaultMaxProperties = 0;
            }).toThrow(RangeError);
            expect(() => {
                StdError.defaultMaxArrayLength = NaN;
            }).toThrow(TypeError);
            StdError.defaultMaxProperties = 5;
            StdError.defaultMaxArrayLength = 6;
            expect([StdError.defaultMaxProperties, StdError.defaultMaxArrayLength]).toEqual([5, 6]);
        } finally {
            [StdError.defaultMaxProperties, StdError.defaultMaxArrayLength] = prev;
        }
    });

    it('B6 gives a root without a stack the stack of the stderr() caller', () => {
        const fromString = stderr('oops');
        const fromObject = stderr({ message: 'oops' });
        for (const e of [fromString, fromObject]) {
            expect(e.stack).toMatch(/review-3\.0\.0\.test\.ts/);
            expect(e.stack).not.toMatch(/primitiveToError|normalizeObjectToError/);
        }
    });

    it('B6 keeps the original stack of a cause', () => {
        const inner = new Error('inner');
        expect((stderr({ message: 'x', cause: inner }).cause as StdError).stack).toBe(inner.stack);
    });

    it('B7 turns an array cause into an AggregateError', () => {
        const cause = stderr({ message: 'x', cause: ['a', new Error('b')] }).cause as StdError;
        expect(cause.name).toBe('AggregateError');
        expect((cause.errors as StdError[]).map(e => e.message)).toEqual(['a', 'b']);
    });

    it('B7 shows an invalid Date cause as Invalid Date', () => {
        expect((stderr({ message: 'x', cause: new Date(NaN) }).cause as StdError).message).toBe('Invalid Date');
    });

    it('B7 bounds a Map of errors by maxProperties and keeps colliding keys apart', () => {
        const errors = new Map<unknown, unknown>([
            [{}, 'first'],
            [{}, 'second'],
            ['c', 'third'],
        ]);
        const e = stderr({ message: 'x', errors }, { maxProperties: 2 });
        const map = e.errors as Record<string, StdError | string>;
        expect((map['[object Object]'] as StdError).message).toBe('first');
        expect((map['[object Object]_2'] as StdError).message).toBe('second');
        expect(map._truncated).toBe('Property count (3) exceeds limit (2), showing first 2');
    });

    it('B7 bounds a Set of errors by maxArrayLength', () => {
        const e = stderr({ message: 'x', errors: new Set(['a', 'b', 'c']) }, { maxArrayLength: 2 });
        expect(e.errors).toHaveLength(2);
        expect(e._truncated).toBe('Array length (3) exceeds limit (2), showing first 2');
    });

    it('B8 serializes a non-string name and drops a non-string stack', () => {
        const json = new StdError('x', { cause: { name: 42, message: 'm', stack: 7 } }).toJSON() as { cause: Record<string, unknown> };
        expect(json.cause.name).toBe('42');
        expect(json.cause).not.toHaveProperty('stack');
    });

    it('B9 is idempotent for a truncated errors map', () => {
        const errors: Record<string, string> = { a: '1', b: '2', c: '3' };
        const once = stderr({ message: 'x', errors }, { maxProperties: 2 });
        expect(noStack(stderr(once, { maxProperties: 2 }))).toEqual(noStack(once));
    });

    it('B9 does not let truncation markers bypass maxProperties', () => {
        const input: Record<string, unknown> = { message: 'x' };
        for (let i = 0; i < 10; i++) input[`_truncated_${i}`] = 'fake';
        const e = stderr(input, { maxProperties: 2 });
        expect(Object.keys(e).filter(k => k.startsWith('_truncated_')).length).toBeLessThanOrEqual(3);
        expect(e._truncated).toBe('Property count (10) exceeds limit (2), showing first 2');
    });
});

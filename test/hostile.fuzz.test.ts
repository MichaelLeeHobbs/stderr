// test/hostile.fuzz.test.ts
// Property-based tests: random hostile values (see hostile-arbitraries.ts) thrown at stderr(), toJSON(), toString() and tryCatch.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { stderr, StdError, tryCatch } from '../src';
import { build, descArb } from './hostile-arbitraries';

const RUNS = 400;
const PENDING = Symbol('pending');

const limitsArb = fc.record({
    maxDepth: fc.integer({ min: 1, max: 6 }),
    maxProperties: fc.integer({ min: 1, max: 8 }),
    maxArrayLength: fc.integer({ min: 2, max: 8 }),
});

const isMarker = (k: string) => k === '_truncated' || k.startsWith('_truncated_');
const ERROR_FIELDS = new Set(['name', 'message', 'stack', 'cause', 'errors']);

/** Throws if `v` is not plain JSON data: only null, strings, numbers, booleans, plain objects and arrays, no cycles. */
function assertPlainJson(v: unknown, path = '$', ancestors = new Set<object>()): void {
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return;
    if (typeof v !== 'object') throw new Error(`${path}: ${typeof v} is not JSON data`);
    if (ancestors.has(v)) throw new Error(`${path}: cycle`);
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== Array.prototype) throw new Error(`${path}: not a plain object or array`);
    ancestors.add(v);
    for (const key of Reflect.ownKeys(v)) {
        if (typeof key === 'symbol') throw new Error(`${path}: symbol key ${key.toString()}`);
        if (Array.isArray(v) && key === 'length') continue;
        const desc = Object.getOwnPropertyDescriptor(v, key)!;
        if (!('value' in desc)) throw new Error(`${path}.${key}: accessor property`);
        // undefined is dropped by JSON.stringify in objects and becomes null in arrays: allowed, as JSON.stringify does
        if (desc.value === undefined) continue;
        assertPlainJson(desc.value, `${path}.${key}`, ancestors);
    }
    ancestors.delete(v);
}

/** Checks the maxProperties/maxArrayLength limits on every object and array of a toJSON() result. */
function assertBounded(v: unknown, limits: { maxProperties: number; maxArrayLength: number }, path = '$'): void {
    if (typeof v !== 'object' || v === null) return;
    if (Array.isArray(v)) {
        expect(v.length, `${path} length`).toBeLessThanOrEqual(limits.maxArrayLength);
        v.forEach((item, i) => assertBounded(item, limits, `${path}[${i}]`));
        return;
    }
    const keys = Object.keys(v);
    const data = keys.filter(k => !isMarker(k) && !ERROR_FIELDS.has(k));
    expect(data.length, `${path} property count`).toBeLessThanOrEqual(limits.maxProperties);
    expect(keys.filter(isMarker).length, `${path} marker count`).toBeLessThanOrEqual(limits.maxProperties + 1);
    for (const k of keys) assertBounded((v as Record<string, unknown>)[k], limits, `${path}.${k}`);
}

const depthOf = (v: unknown): number => (typeof v !== 'object' || v === null ? 0 : 1 + Math.max(0, ...Object.values(v).map(depthOf)));

const withoutStacks = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, val) => (k === 'stack' ? undefined : val)));

describe('hostile values: stderr()', () => {
    it('never throws and always returns a StdError with string name and message', () => {
        fc.assert(
            fc.property(descArb, desc => {
                const e = stderr(build(desc));
                expect(e).toBeInstanceOf(StdError);
                expect(typeof e.name).toBe('string');
                expect(e.name.length).toBeGreaterThan(0);
                expect(typeof e.message).toBe('string');
                expect(e.stack === undefined || typeof e.stack === 'string').toBe(true);
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('never throws with random limits', () => {
        fc.assert(
            fc.property(descArb, limitsArb, (desc, limits) => {
                expect(stderr(build(desc), limits)).toBeInstanceOf(StdError);
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });
});

describe('hostile values: toJSON() and toString() of stderr() output', () => {
    it('toJSON() never throws and returns plain JSON data that JSON.stringify accepts', () => {
        fc.assert(
            fc.property(descArb, desc => {
                const json = stderr(build(desc)).toJSON();
                assertPlainJson(json);
                expect(() => JSON.stringify(json)).not.toThrow();
                expect(typeof json.name).toBe('string');
                expect(typeof json.message).toBe('string');
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('JSON.stringify(stderr(x)) never throws', () => {
        fc.assert(
            fc.property(descArb, desc => {
                expect(typeof JSON.stringify(stderr(build(desc)))).toBe('string');
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('toString() never throws and returns a string', () => {
        fc.assert(
            fc.property(descArb, desc => {
                expect(typeof stderr(build(desc)).toString()).toBe('string');
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('toJSON() respects maxProperties and maxArrayLength on every object and array', () => {
        fc.assert(
            fc.property(descArb, limitsArb, (desc, limits) => {
                assertBounded(stderr(build(desc), limits).toJSON(), limits);
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('toJSON() output depth is bounded by maxDepth', () => {
        fc.assert(
            fc.property(descArb, limitsArb, (desc, limits) => {
                // Each depth level can add an object and the array holding it, plus a Map entry pair
                expect(depthOf(stderr(build(desc), limits).toJSON())).toBeLessThanOrEqual(3 * limits.maxDepth + 3);
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('stays bounded for nesting far beyond maxDepth', () => {
        fc.assert(
            fc.property(fc.constantFrom('obj', 'arr', 'cause', 'errors'), fc.integer({ min: 100, max: 5000 }), (kind, n) => {
                const v = build({ t: 'deep', kind: kind as 'obj', n });
                const json = stderr(kind === 'obj' || kind === 'arr' ? { message: 'm', v } : v).toJSON();
                expect(depthOf(json)).toBeLessThanOrEqual(3 * 8 + 3);
            }),
            { numRuns: 20 }
        );
    });
});

describe('hostile values: re-normalization', () => {
    it('stderr(stderr(x)) serializes like stderr(x), apart from stacks', () => {
        fc.assert(
            fc.property(descArb, desc => {
                const once = stderr(build(desc));
                expect(withoutStacks(stderr(once).toJSON())).toEqual(withoutStacks(once.toJSON()));
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });
});

describe('hostile values: tryCatch', () => {
    const assertResult = (r: unknown) => {
        expect(r).toBeTypeOf('object');
        const res = r as { ok: boolean; value: unknown; error: unknown };
        expect(Object.keys(res).sort()).toEqual(['error', 'ok', 'value']);
        if (res.ok) expect(res.error).toBeNull();
        else {
            expect(res.value).toBeNull();
            expect(res.error).toBeInstanceOf(StdError);
        }
    };

    it('returns a failed Result for any thrown value', () => {
        fc.assert(
            fc.property(descArb, desc => {
                const thrown = build(desc);
                const r = tryCatch((): never => {
                    throw thrown;
                });
                assertResult(r);
                expect(r.ok).toBe(false);
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('resolves (never rejects) to a failed Result for any rejection reason', async () => {
        await fc.assert(
            fc.asyncProperty(descArb, async desc => {
                const reason = build(desc);
                const r1 = await tryCatch(async () => {
                    throw reason;
                });
                assertResult(r1);
                expect(r1.ok).toBe(false);
                const r2 = await tryCatch(Promise.reject(reason));
                assertResult(r2);
                expect(r2.ok).toBe(false);
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('returns a Result (sync or async) for any returned value, and never throws', async () => {
        await fc.assert(
            fc.asyncProperty(descArb, async desc => {
                const value = build(desc);
                let r: unknown;
                expect(() => {
                    r = tryCatch(() => value);
                }).not.toThrow();
                // A thenable that never calls back (e.g. `then` is an unrelated function) never settles, like `await` would
                const settled = r instanceof Promise ? await Promise.race([r, new Promise(res => setTimeout(res, 20, PENDING))]) : r;
                if (settled !== PENDING) assertResult(settled);
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('returns a failed Result with a StdError when mapError throws anything', () => {
        fc.assert(
            fc.property(descArb, descArb, (thrownDesc, mapThrownDesc) => {
                const thrown = build(thrownDesc);
                const mapThrown = build(mapThrownDesc);
                const r = tryCatch(
                    (): never => {
                        throw thrown;
                    },
                    (): never => {
                        throw mapThrown;
                    }
                );
                assertResult(r);
                expect(r.ok).toBe(false);
                expect(typeof JSON.stringify(r.error)).toBe('string');
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });
});

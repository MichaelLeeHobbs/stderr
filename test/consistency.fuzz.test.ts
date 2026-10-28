// test/consistency.fuzz.test.ts
// Property-based tests: toString() and toJSON() apply the limits the same way, so they keep the same values.
// Every leaf is a unique word; small objects and arrays (up to 3 items) are shown inline by toString(), so
// any word in one output and not the other means the two counted depth differently (V1, V2, S1, S2).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { stderr, StdError } from '../src';

const RUNS = 300;

let next = 0;
const leaf = fc.constant(null).map(() => `w${next++}x`);
const keyArb = fc.stringMatching(/^[a-z]{2,5}$/).filter(k => !['name', 'message', 'stack', 'cause', 'errors', 'constructor', 'prototype'].includes(k));

/** Toggles Map and Set, which toString() summarizes as `Map(n)` / `Set(n)` */
const dataArb = (withCollections: boolean) =>
    fc.letrec<{ data: unknown }>(tie => ({
        data: fc.oneof(
            { depthSize: 'small' },
            leaf,
            fc.array(tie('data'), { maxLength: 3 }),
            fc.dictionary(keyArb, tie('data'), { maxKeys: 3 }),
            fc.tuple(leaf, fc.option(tie('data'), { nil: undefined })).map(([m, c]) => new Error(m, c === undefined ? undefined : { cause: c })),
            fc.tuple(leaf, tie('data')).map(([m, x]) => ({ name: 'Plain', message: m, x })),
            ...(withCollections
                ? [
                      fc.array(fc.tuple(keyArb, tie('data')), { maxLength: 3 }).map(entries => new Map(entries)),
                      fc.array(tie('data'), { maxLength: 3 }).map(items => new Set(items)),
                  ]
                : [])
        ),
    })).data;

const words = (text: string) => new Set(text.match(/w\d+x/g) ?? []);
const withoutStacks = (v: unknown) => JSON.stringify(v, (k, val: unknown) => (k === 'stack' ? undefined : val));
const inputArb = (withCollections: boolean) =>
    fc.record({
        meta: fc.dictionary(keyArb, dataArb(withCollections), { maxKeys: 3 }),
        cause: fc.option(dataArb(withCollections), { nil: undefined }),
        errors: fc.option(dataArb(withCollections), { nil: undefined }),
        maxDepth: fc.integer({ min: 1, max: 5 }),
    });

describe('toString() and toJSON() keep the same values', () => {
    it('for a StdError built directly', () => {
        fc.assert(
            fc.property(inputArb(false), ({ meta, cause, errors, maxDepth }) => {
                const e = new StdError('m', { ...meta, cause, errors, maxDepth });
                e.stack = undefined;
                expect([...words(e.toString())].sort()).toEqual([...words(JSON.stringify(e))].sort());
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('for stderr() output', () => {
        fc.assert(
            fc.property(inputArb(false), ({ meta, cause, errors, maxDepth }) => {
                const e = stderr({ name: 'E', message: 'm', ...meta, cause, errors }, { maxDepth });
                e.stack = undefined;
                expect([...words(e.toString())].sort()).toEqual([...words(withoutStacks(e))].sort());
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });

    it('stderr() keeps no more than toJSON() of the same StdError', () => {
        fc.assert(
            fc.property(inputArb(true), ({ meta, maxDepth }) => {
                const e = new StdError('m', { ...meta, maxDepth });
                const kept = words(JSON.stringify(e));
                for (const word of words(withoutStacks(stderr(e, { maxDepth })))) expect(kept.has(word), word).toBe(true);
            }),
            { numRuns: RUNS, endOnFailure: true }
        );
    });
});

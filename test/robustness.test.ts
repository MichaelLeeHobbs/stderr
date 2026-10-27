// test/robustness.test.ts
//
// Edge cases for the fixes behind the 2026-10-27 review findings (see review-findings.test.ts):
// hostile inputs, built-in objects, shared references and per-instance limits.
import { describe, expect, it } from 'vitest';
import { stderr } from '../src/stderr';
import { StdError } from '../src/StdError';
import { tryCatch } from '../src/tryCatch';
import { isArray, isErrorInstance, isErrorLike, isErrorShaped, isInstanceOf } from '../src/types';
import { addMarker, safeGet, VisitTracker } from '../src/utils';
import { MAX_REPEATED_REFERENCES } from '../src/constants';

const revokedProxy = (): object => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    return proxy;
};

describe('type guards on a revoked Proxy', () => {
    it('return false instead of throwing', () => {
        const proxy = revokedProxy();
        expect(isArray(proxy)).toBe(false);
        expect(isErrorInstance(proxy)).toBe(false);
        expect(isInstanceOf(proxy, Date)).toBe(false);
        expect(isErrorShaped(proxy)).toBe(false);
        expect(isErrorLike(proxy)).toBe(false);
    });

    it('isErrorLike rejects primitives and accepts { message, stack }', () => {
        expect(isErrorLike('x')).toBe(false);
        expect(isErrorLike({ message: 'm', stack: 's' })).toBe(true);
        expect(isErrorLike({ message: 'm' })).toBe(false);
        expect(isErrorShaped('x')).toBe(false);
    });
});

describe('utils', () => {
    it('safeGet returns undefined for a throwing getter', () => {
        const source = {};
        Object.defineProperty(source, 'x', {
            get() {
                throw new Error('boom');
            },
        });
        expect(safeGet(source, 'x')).toBeUndefined();
    });

    it('addMarker picks the next free suffix', () => {
        const target: Record<string, unknown> = { _truncated: 'a', _truncated_2: 'b' };
        addMarker(target, '_truncated', 'marker');
        expect(target).toEqual({ _truncated: 'a', _truncated_2: 'b', _truncated_3: 'marker' });
    });

    it('VisitTracker reports [Repeated reference] once the budget is spent', () => {
        const tracker = new VisitTracker();
        const shared = {};
        tracker.enter(shared);
        tracker.leave(shared);
        for (let i = 0; i < MAX_REPEATED_REFERENCES; i++) {
            expect(tracker.enter(shared)).toBeNull();
            tracker.leave(shared);
        }
        expect(tracker.enter(shared)).toBe('[Repeated reference]');
    });
});

describe('stderr() robustness', () => {
    it('normalizes revoked proxies nested in metadata, cause and errors', () => {
        const e = stderr({ message: 'm', meta: revokedProxy(), cause: revokedProxy(), errors: { a: revokedProxy() } });
        expect(e.message).toBe('m');
        expect(e.meta).toEqual({});
    });

    it('skips unreadable entries in an errors map', () => {
        const errors = { ok: new Error('fine') };
        Object.defineProperty(errors, 'bad', {
            enumerable: true,
            get() {
                throw new Error('boom');
            },
        });
        const e = stderr({ message: 'm', errors });
        expect((e.errors as Record<string, StdError>).ok.message).toBe('fine');
    });

    it('falls back to a placeholder when a built-in cannot be read', () => {
        class BrokenMap extends Map {
            entries(): never {
                throw new Error('broken entries');
            }
        }
        const e = stderr({ message: 'm', data: new BrokenMap() });
        expect(e).toBeInstanceOf(StdError);
        expect(e.message).toBe('Unknown error (could not normalize value: broken entries)');
    });

    it('keeps Date, RegExp, Map and Set metadata', () => {
        const e = stderr({
            message: 'm',
            at: new Date(0),
            pattern: /a+/g,
            map: new Map<unknown, unknown>([['k', { v: 1 }]]),
            set: new Set([1, 'two']),
        });
        expect(e.at).toEqual(new Date(0));
        expect(e.pattern).toBe('/a+/g');

        const json = e.toJSON();
        expect(json.at).toBe('1970-01-01T00:00:00.000Z');
        expect(json.map).toEqual([['k', { v: 1 }]]);
        expect(json.set).toEqual([1, 'two']);

        const str = e.toString();
        expect(str).toContain('at: 1970-01-01T00:00:00.000Z');
        expect(str).toContain("pattern: '/a+/g'");
        expect(str).toContain('map: Map(1)');
        expect(str).toContain('set: Set(2)');
    });

    it('bounds a crafted DAG instead of expanding it exponentially', () => {
        let node: Record<string, unknown> = { leaf: true };
        for (let i = 0; i < 6; i++) {
            const children: Record<string, unknown> = {};
            for (let c = 0; c < 20; c++) children[`c${c}`] = node;
            node = children;
        }
        const e = stderr({ message: 'm', node }, { maxDepth: 10 });
        expect(JSON.stringify(e)).toContain('[Repeated reference]');
    });

    it('treats { message, name } metadata as a nested error, but plain { message } as data', () => {
        const e = stderr({ message: 'm', rehydrated: { name: 'DbError', message: 'lost' }, note: { message: 'just text' } });
        expect(e.rehydrated).toBeInstanceOf(StdError);
        expect(e.note).toEqual({ message: 'just text' });
    });

    it('normalizes a plain-object cause into a StdError', () => {
        const e = stderr({ message: 'm', cause: { code: 'E_X' } });
        expect(e.cause).toBeInstanceOf(StdError);
        expect((e.cause as StdError).code).toBe('E_X');
    });

    it('ignores a non-string stack', () => {
        const e = stderr({ message: 'm', stack: 42 });
        expect(typeof e.stack).toBe('string');
    });
});

describe('StdError toString()/toJSON() robustness', () => {
    it('formats a root at depth limit 0', () => {
        const e = new StdError('x', { maxDepth: 0 });
        expect(e.toString()).toBe('[Max depth of 0 reached]');
    });

    it('marks an error that lists itself in errors as [Circular]', () => {
        const e = new StdError('x');
        e.errors = [e];
        expect(e.toString()).toContain('[0]: [Circular]');
        expect(JSON.stringify(e)).toContain('[Circular]');
    });

    it('marks a self-referencing metadata array as [Circular] in toString()', () => {
        const a: unknown[] = [];
        a.push(a);
        expect(new StdError('x', { a }).toString()).toContain('a: [[Circular]]');
    });

    it('stops at the depth limit for errors and nested objects', () => {
        const e = new StdError('x', { maxDepth: 1, errors: [new Error('e')], obj: { deep: { deeper: 1 } }, map: new Map() });
        const str = e.toString();
        expect(str).toContain('[errors]: [Max depth of 1 reached]');
        expect(str).toContain('obj: [Max depth of 1 reached]');
        expect(JSON.stringify(e)).toContain('[Max depth of 1 reached]');
    });

    it('formats primitive causes and non-error errors entries', () => {
        const e = new StdError('x', { cause: 'just a string', errors: { field: 'bad value', nested: new Error('inner') } });
        const str = e.toString();
        expect(str).toContain("[cause]: 'just a string'");
        expect(str).toContain("field: 'bad value'");
        expect(str).toContain('nested: Error: inner');
    });

    it('uses defaults when name and message getters throw', () => {
        const cause = {};
        Object.defineProperty(cause, 'name', {
            enumerable: true,
            get() {
                throw new Error('boom');
            },
        });
        const e = new StdError('x', { cause });
        expect(e.toString()).toContain('[cause]: Error');
        expect((e.toJSON().cause as { name: string }).name).toBe('Error');
    });

    it('serializes invalid dates, bigints, symbols and symbol keys', () => {
        const visible = Symbol('visible');
        const hidden = Symbol('hidden');
        const obj: Record<string | symbol, unknown> = { [visible]: 1 };
        Object.defineProperty(obj, hidden, { value: 2, enumerable: false });
        const e = new StdError('x', { when: new Date(NaN), big: BigInt(5), sym: Symbol('s'), obj, [Symbol('own')]: 'own', re: /x/ });

        const json = e.toJSON();
        expect(json.when).toBe('Invalid Date');
        expect(json.big).toBe('5');
        expect(json.sym).toBe('Symbol(s)');
        expect(json.obj).toEqual({ 'Symbol(visible)': 1 });
        expect(json['Symbol(own)']).toBe('own');
        expect(json.re).toBe('/x/');
        expect(e.toString()).toContain('when: Invalid Date');
    });

    it('honors per-instance maxProperties and maxArrayLength in toJSON()', () => {
        const e = new StdError('x', { maxProperties: 2, maxArrayLength: 2 });
        e.obj = { a: 1, b: 2, c: 3 };
        e.arr = [1, 2, 3];
        e.set = new Set([1, 2, 3]);
        e.errors = [new Error('1'), new Error('2'), new Error('3')];

        const json = e.toJSON();
        expect(json.obj).toEqual({ a: 1, b: 2 });
        expect(json.arr).toEqual([1, 2]);
        expect(json.set).toEqual([1, 2]);
        expect(json.errors).toHaveLength(2);
    });

    it('treats a plain { message } cause as an error in toJSON()', () => {
        const e = new StdError('x', { cause: { message: 'plain' } });
        expect(e.toJSON().cause).toMatchObject({ name: 'Error', message: 'plain' });
    });
});

describe('tryCatch robustness', () => {
    it('maps errors from a rejecting thenable', async () => {
        const thenable = {
            then(_resolve: unknown, reject: (e: unknown) => void) {
                reject(new Error('nope'));
            },
        };
        const result = (await (tryCatch(() => thenable) as unknown)) as { ok: boolean; error: StdError };
        expect(result.ok).toBe(false);
        expect(result.error.message).toBe('nope');
    });

    it('wraps a throwing mapError, keeping the original error as cause', () => {
        const result = tryCatch(
            () => {
                throw new Error('original');
            },
            () => {
                throw new Error('mapError failed');
            }
        );
        expect(result.ok).toBe(false);
        const error = result.error as unknown as StdError;
        expect(error.message).toBe('mapError threw while mapping an error');
        expect((error.cause as StdError).message).toBe('original');
        expect((error.mapErrorFailure as StdError).message).toBe('mapError failed');
    });

    it('still applies a working mapError', () => {
        const result = tryCatch(
            () => {
                throw new Error('original');
            },
            e => e.message.toUpperCase()
        );
        expect(result.error).toBe('ORIGINAL');
    });
});

describe('stderr global limits', () => {
    const limits = stderr as unknown as { maxDepth: number; maxProperties: number; maxArrayLength: number };

    it.each(['maxDepth', 'maxProperties', 'maxArrayLength'] as const)('%s can be read, set and validated', key => {
        const original = limits[key];
        try {
            limits[key] = 3;
            expect(limits[key]).toBe(3);
            expect(() => {
                limits[key] = 0;
            }).toThrow(RangeError);
        } finally {
            limits[key] = original;
        }
    });
});

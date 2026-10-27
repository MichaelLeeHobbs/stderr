// test/review-final.test.ts
// Final pre-3.0.0 review: one regression test per proven finding (F1-F7). Each started as an it.fails proof of the bug.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stderr, StdError, tryCatch } from '../src';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('F1: a StdError whose name and message lead back to it hangs stderr() and toString()', () => {
    // unknownToString() turns an object name/message into text with String(), which calls StdError.prototype.toString(),
    // which starts a NEW walk (new cycle tracker) and calls unknownToString() again. Each level makes two such calls
    // (name and message), so after the stack overflows (caught by unknownToString) the work is exponential: it never ends.
    // The tests cap toString() re-entry with a spy so they finish; without the cap they hang.
    const capToString = () => {
        const original = StdError.prototype.toString;
        let calls = 0;
        vi.spyOn(StdError.prototype, 'toString').mockImplementation(function (this: StdError) {
            if (++calls > 200) throw new Error('re-entered toString() more than 200 times');
            return original.call(this);
        });
        return () => calls;
    };

    // V8 formats `stack` lazily, and vitest's prepareStackTrace hook calls toString() to build its first line.
    // Reading it first keeps that environment-only call out of the counts.
    const withStack = (e: StdError) => {
        void e.stack;
        return e;
    };

    const selfReferencing = () => {
        const e = withStack(new StdError('x'));
        Object.assign(e, { name: e, message: e });
        return e;
    };

    it('stderr() does not re-enter toString() without bound', () => {
        const calls = capToString();
        stderr(selfReferencing());
        expect(calls()).toBeLessThan(10);
    });

    it('toString() does not re-enter itself without bound', () => {
        const calls = capToString();
        selfReferencing().toString();
        expect(calls()).toBeLessThan(10);
    });

    it('toJSON() does not call toString() without bound', () => {
        const calls = capToString();
        selfReferencing().toJSON();
        expect(calls()).toBeLessThan(10);
    });

    it('one self-referencing message does not recurse until the stack overflows', () => {
        // Linear, so it finishes, but only after a stack overflow (about 200ms) that unknownToString() swallows
        const e = withStack(new StdError('x'));
        Object.assign(e, { message: e });
        const calls = capToString();
        e.toString();
        expect(calls()).toBeLessThan(10);
    });
});

describe('F2: toJSON() turns an errors map with a `name` or `message` field into an error', () => {
    // B1 made stderr() keep { name: 'required', email: 'invalid' } as a map (isErrorLike, not isErrorShaped).
    // toJSON() still serializes `errors` with the lenient isErrorShaped check, so the same map becomes an error there:
    // its `name` entry is flattened into the error name and gets a made-up `message: ''`.
    it('keeps a `name` field of an errors map as a nested error', () => {
        const e = stderr({ message: 'Validation failed', errors: { name: 'required', email: 'invalid' } });
        expect(e.errors).toHaveProperty('name.message', 'required'); // stderr() is right
        const errors = e.toJSON().errors as Record<string, unknown>;
        expect(errors.name).toMatchObject({ name: 'Error', message: 'required' });
        expect(errors).not.toHaveProperty('message');
    });

    it('keeps a `message` field of an errors map as a nested error', () => {
        const e = stderr({ message: 'Validation failed', errors: { message: 'too short', password: 'weak' } });
        const errors = e.toJSON().errors as Record<string, unknown>;
        expect(errors.message).toMatchObject({ name: 'Error', message: 'too short' });
        expect(errors).not.toHaveProperty('name');
    });

    it('a JSON round trip keeps the map', () => {
        const e = stderr({ message: 'Validation failed', errors: { name: 'required', email: 'invalid' } });
        const again = stderr(JSON.parse(JSON.stringify(e)));
        expect(Object.keys(again.errors as object).sort()).toEqual(['email', 'name']);
    });
});

describe('F3: a Map of errors with a `__proto__` key replaces the prototype of the errors map', () => {
    // The Map branch (new in PR #6) writes normObj[key] with plain assignment and no key filter.
    // `normObj['__proto__'] = StdError` sets the prototype instead of a property: the entry is lost and the map
    // becomes `instanceof Error`, so toJSON() serializes the whole map as that error.
    const make = () =>
        stderr({
            message: 'm',
            errors: new Map<string, unknown>([
                ['__proto__', 'bad'],
                ['ok', 'fine'],
            ]),
        });

    it('the errors map stays a plain object', () => {
        expect(Object.getPrototypeOf(make().errors)).toBe(Object.prototype);
    });

    it('toJSON() keeps the map entries', () => {
        expect(make().toJSON().errors).toEqual({ ok: { name: 'Error', message: 'fine' } });
    });
});

describe('F4: toJSON() and toString() throw on built-ins they cannot read (StdError built directly)', () => {
    // isInstanceOf(value, Date/Map/Set) is true for a Proxy of a Date or for Object.create(Date.prototype), but the
    // methods called next (getTime, size) throw on them. A Proxy whose getOwnPropertyDescriptor trap throws breaks
    // the enumerability check in getCustomKeys. stderr() already guards these (it gives a placeholder), but
    // toJSON()/toString() of an error built with `new StdError(msg, { ...metadata })` throw, so JSON.stringify(err) throws.
    // Present before PR #6 too.
    const throwingDescriptor = new Proxy(
        { a: 1 },
        {
            getOwnPropertyDescriptor: () => {
                throw new Error('trap');
            },
        }
    );
    const cases: [string, () => unknown][] = [
        ['Proxy of a Date', () => new Proxy(new Date(0), {})],
        ['Object.create(Date.prototype)', () => Object.create(Date.prototype)],
        ['Proxy of a Map', () => new Proxy(new Map(), {})],
        ['Object.create(Set.prototype)', () => Object.create(Set.prototype)],
        ['Proxy with a throwing getOwnPropertyDescriptor trap', () => throwingDescriptor],
    ];

    for (const [label, value] of cases) {
        it(`JSON.stringify() does not throw for ${label}`, () => {
            const e = new StdError('x', { data: value() });
            expect(() => JSON.stringify(e)).not.toThrow();
        });
    }

    it('toString() does not throw for a Proxy of a Map', () => {
        const e = new StdError('x', { data: new Proxy(new Map(), {}) });
        expect(() => e.toString()).not.toThrow();
    });
});

describe('F5: Map and Set metadata are truncated without a marker', () => {
    // An array over maxArrayLength gets `_truncated_<key>`; a Map or Set (newly kept as Map/Set by PR #6) loses
    // entries silently, in stderr() and in toJSON().
    it('arrays are marked (for comparison)', () => {
        const e = stderr({ message: 'm', list: [1, 2, 3] }, { maxArrayLength: 2 });
        expect(e._truncated_list).toBe('Array length (3) exceeds limit (2), showing first 2');
    });

    it('a Map over maxArrayLength is marked', () => {
        const e = stderr(
            {
                message: 'm',
                data: new Map([
                    [1, 1],
                    [2, 2],
                    [3, 3],
                ]),
            },
            { maxArrayLength: 2 }
        );
        expect(Object.keys(e).some(k => k.startsWith('_truncated'))).toBe(true);
    });

    it('a Set over maxArrayLength is marked', () => {
        const e = stderr({ message: 'm', data: new Set([1, 2, 3]) }, { maxArrayLength: 2 });
        expect(Object.keys(e).some(k => k.startsWith('_truncated'))).toBe(true);
    });
});

describe('F6: errors normalized by tryCatch get a stack that starts inside the library', () => {
    // B6: a value without a stack gets the stack of the code that called stderr(). Through tryCatch that caller is
    // tryCatch's own `fail`, so the first frames are tryCatch internals (dist/index.js for users).
    it('the first frame of a thrown string is not in tryCatch', () => {
        const r = tryCatch((): never => {
            throw 'plain string';
        });
        const firstFrame = (r.error as StdError).stack?.split('\n')[1] ?? '';
        expect(firstFrame).not.toMatch(/tryCatch/);
    });
});

describe('F7: freeKey() gives up after 100 tries and overwrites', () => {
    // freeKey returns `${key}_100` even when it is taken, so the 101st colliding key overwrites it.
    // Reachable with more than 100 symbol keys that share a description (B9 aimed to keep all of them).
    it('keeps 103 distinct symbols with the same description', () => {
        const input: Record<string | symbol, unknown> = { message: 'm' };
        for (let i = 0; i < 103; i++) input[Symbol('id')] = i;
        const e = stderr(input);
        expect(Object.keys(e).filter(k => k.startsWith('Symbol(id)'))).toHaveLength(103);
    });
});

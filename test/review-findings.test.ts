// test/review-findings.test.ts
//
// Regression tests for the findings from the 2026-10-27 code review.
// Each test asserts the CORRECT behaviour, so it fails until the finding is fixed.
// Numbers match the review document.
import { stderr } from '../src/stderr';
import { StdError } from '../src/StdError';
import { tryCatch } from '../src/tryCatch';
import { MAX_ARRAY_LENGTH } from '../src/constants';

describe('review findings', () => {
    describe('#1 toJSON() does not detect cycles through arrays', () => {
        it('should mark a self-referencing array as [Circular]', () => {
            const a: unknown[] = [];
            a.push(a, a);
            const json = new StdError('x', { a }).toJSON();

            // Today each level is expanded until maxDepth (2^8 leaves for a 2-wide array;
            // a 10-wide array exhausts the heap).
            expect(json.a).toEqual(['[Circular]', '[Circular]']);
        });
    });

    describe('#2 stderr()/tryCatch() throw on hostile inputs', () => {
        it('should normalize a revoked Proxy without throwing', () => {
            const { proxy, revoke } = Proxy.revocable({}, {});
            revoke();
            expect(() => stderr(proxy)).not.toThrow();
        });

        it('should return a failure Result when a revoked Proxy is thrown', () => {
            const { proxy, revoke } = Proxy.revocable({}, {});
            revoke();
            expect(() =>
                tryCatch(() => {
                    throw proxy;
                })
            ).not.toThrow();
        });

        it('should normalize an object whose message getter throws', () => {
            const input = {};
            Object.defineProperty(input, 'message', {
                get() {
                    throw new Error('boom');
                },
            });
            expect(() => stderr(input)).not.toThrow();
        });

        it('should normalize an object whose property getter throws a RangeError', () => {
            const input = { message: 'm' };
            Object.defineProperty(input, 'x', {
                enumerable: true,
                get() {
                    throw new RangeError('boom');
                },
            });
            expect(() => stderr(input)).not.toThrow();
        });
    });

    describe('#3 nested errors lose their original stack', () => {
        it('should preserve the stack of a nested cause', () => {
            const inner = new Error('inner');
            const result = stderr(new Error('outer', { cause: inner }));

            expect((result.cause as StdError).stack).toBe(inner.stack);
        });

        it('should preserve the stacks of AggregateError members', () => {
            const member = new Error('member');
            const result = stderr(new AggregateError([member], 'agg'));

            expect((result.errors as StdError[])[0].stack).toBe(member.stack);
        });
    });

    describe('#4 tryCatch misreports thenables', () => {
        it('should await a thenable whose then() returns undefined', async () => {
            const thenable = {
                then(resolve: (v: number) => void) {
                    resolve(1);
                },
            };
            const result = tryCatch(() => thenable) as unknown;

            // Today this is a synchronous failure: "Cannot read properties of undefined (reading 'catch')"
            expect(result).toBeInstanceOf(Promise);
            await expect(result).resolves.toEqual({ ok: true, value: 1, error: null });
        });
    });

    describe('#5 shared (non-circular) references are reported as [Circular]', () => {
        it('should serialize an object referenced twice in full both times', () => {
            const shared = { a: 1 };
            const result = stderr({ message: 'm', x: shared, y: shared });

            expect(result.x).toEqual({ a: 1 });
            expect(result.y).toEqual({ a: 1 });
        });
    });

    describe('#6 nested metadata with a name key becomes an Error', () => {
        it('should keep { name, id } metadata as a plain object', () => {
            const result = stderr({ message: 'm', user: { name: 'bob', id: 1 } });

            expect(result.user).not.toBeInstanceOf(Error);
            expect(result.toJSON().user).toEqual({ name: 'bob', id: 1 });
        });
    });

    describe('#7 falsy cause is dropped', () => {
        it.each([0, '', false])('should keep cause %p', cause => {
            const result = stderr({ message: 'm', cause });

            expect('cause' in result).toBe(true);
        });
    });

    describe('#8 array/property limits are not enforced on directly constructed StdErrors', () => {
        it('should truncate an array that the constructor marks as truncated', () => {
            const e = new StdError('x', { arr: new Array(20).fill(1), maxArrayLength: 5 });

            expect(e._truncated_arr).toBeDefined();
            expect(e.arr).toHaveLength(5);
        });

        it('should bound array length in toJSON()', () => {
            const e = new StdError('x');
            e.big = new Array(MAX_ARRAY_LENGTH * 2).fill(1);

            expect((e.toJSON().big as unknown[]).length).toBeLessThanOrEqual(MAX_ARRAY_LENGTH);
        });
    });

    describe('#9 toJSON() output can make JSON.stringify throw', () => {
        it('should serialize a BigInt property', () => {
            const result = stderr({ message: 'm', n: BigInt(10) });

            expect(() => JSON.stringify(result)).not.toThrow();
        });
    });

    describe('#10 built-in objects collapse to {}', () => {
        it('should not serialize a Date as {}', () => {
            const json = stderr({ message: 'm', at: new Date(0) }).toJSON();

            expect(json.at).not.toEqual({});
        });

        it('should not serialize a Map as {}', () => {
            const json = stderr({ message: 'm', m: new Map([['k', 'v']]) }).toJSON();

            expect(json.m).not.toEqual({});
        });
    });

    describe('#11 _truncated collides with user data', () => {
        it('should keep both the user _truncated value and the truncation marker', () => {
            const result = stderr({ message: 'm', _truncated: 'mine', errors: [1, 2, 3, 4, 5].map(i => new Error(`e${i}`)) }, { maxArrayLength: 2 });
            const json = JSON.stringify(result);

            expect(json).toContain('mine');
            expect(json).toContain('Array length (5) exceeds limit (2)');
        });
    });

    describe('#12 a throwing mapError escapes tryCatch', () => {
        const badMap = (): never => {
            throw new Error('mapError failed');
        };

        it('should not throw synchronously (sync fn)', () => {
            expect(() =>
                tryCatch(() => {
                    throw new Error('original');
                }, badMap)
            ).not.toThrow();
        });

        it('should not reject (async fn)', async () => {
            await expect(
                tryCatch(async () => {
                    throw new Error('original');
                }, badMap)
            ).resolves.toMatchObject({ ok: false });
        });
    });

    // #13 (stack header ignores custom name) was WITHDRAWN: V8 formats `stack` lazily,
    // so the header already reflects the name set in the constructor. This test passes today.
    describe('#13 stack header uses custom name (withdrawn finding, passes)', () => {
        it('should start the stack with the custom name', () => {
            const e = new StdError('x', { name: 'DbError' });

            expect(e.stack?.split('\n')[0]).toBe('DbError: x');
        });
    });

    describe('#14 toString() double-indents nested causes', () => {
        it('should print the cause line with a single indent', () => {
            const output = stderr(new Error('a', { cause: new Error('b') })).toString();

            expect(output).toContain('\n  [cause]: Error: b');
        });
    });

    describe('#15 user properties named like StdError internals are dropped', () => {
        it.each(['formatError', 'serializeValue', 'getMaxDepth'])('should keep a user property named %s', key => {
            const e = new StdError('x', { [key]: 'value' });

            expect(e.toJSON()[key]).toBe('value');
        });
    });

    describe('#16 formatValue checks depth before primitives (open TODO at StdError.ts:296)', () => {
        it('should print a primitive custom property at the depth limit', () => {
            const e = new StdError('x', { code: 'E_FAIL', maxDepth: 1 });

            expect(e.toString()).toContain("code: 'E_FAIL'");
        });
    });
});

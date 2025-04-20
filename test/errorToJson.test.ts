import {ErrorJson, errorToJson} from '../src/errorToJson';
import {DynamicError} from '../src/types';

describe('errorToJson', () => {
    it('serializes a basic Error', () => {
        const err = new Error('oops') as DynamicError;
        const json = errorToJson(err);
        expect(json).toMatchObject({name: 'Error', message: 'oops'});
        expect(typeof json.stack).toBe('string');
    });

    it('handles primitive cause', () => {
        const err = new Error('fail') as DynamicError;
        err.cause = 123;
        const json = errorToJson(err);
        expect(json.cause).toBe('123');
    });

    it('handles undefined message', () => {
        const err = new Error() as DynamicError;
        err.name = undefined;
        const json = errorToJson(err);
        expect(json.name).toBe('Error');
        expect(json.message).toBe('');
    });

    it('handles nested Error cause', () => {
        const cause = new Error('root') as DynamicError;
        const err = new Error('fail') as DynamicError;
        err.cause = cause;
        const json = errorToJson(err);
        expect((json.cause as ErrorJson).message).toBe('root');
    });

    it('handles nested Error cause that is not an instance of Error or primitive', () => {
        const cause = Symbol('root');
        const err = new Error('fail') as DynamicError;
        err.cause = {cause};
        const json = errorToJson(err);
        // this is not great, I think we could do better
        expect(json.cause).toStrictEqual({});

        const cause2 = [new Error('root'), Symbol('root'), []];
        const err2 = new Error('fail') as DynamicError;
        err2.cause = {cause: cause2};
        const json2 = errorToJson(err2);
        // this is not great, but difficult to deal with
        expect(json2.cause).toStrictEqual({cause: [{}, null, []]});
    });

    it('handles nested Error cause that cannot be serialized', () => {
        const cause = {message: 'circular'} as DynamicError;
        const err = new Error('fail') as DynamicError;
        err.cause = cause;
        cause.cause = {cause};
        const json = errorToJson(err);
        expect(json.cause).toBe('[object Object]');
    });

    it('detects circular cause', () => {
        const err = new Error('self') as DynamicError;
        err.cause = err;
        const json = errorToJson(err);
        expect((json.cause as ErrorJson).message).toBe('[Circular]');
    });

    it('detects circular cause and handles missing Name', () => {
        const err = new Error('self') as DynamicError;
        err.name = undefined;
        err.cause = err;
        const json = errorToJson(err);
        expect((json.cause as ErrorJson).message).toBe('[Circular]');
        expect((json.cause as ErrorJson).name).toBe('Error');
    });

    it('respects maxDepth option', () => {
        const deep1 = new Error('1') as DynamicError;
        const deep2 = new Error('2') as DynamicError;
        deep1.cause = deep2;
        deep2.cause = new Error('3') as DynamicError;
        const json = errorToJson(deep1, {maxDepth: 1});
        const cause = json.cause as ErrorJson;
        expect(cause.message).toBe('[Max depth reached]');
    });

    it('respects maxDepth option and handles missing Name', () => {
        const deep1 = new Error('1') as DynamicError;
        deep1.name = '1';
        const deep2 = new Error('2') as DynamicError;
        deep2.name = undefined;
        deep1.cause = deep2;
        const deep3 = new Error('3') as DynamicError;
        deep2.cause = deep3;
        deep3.name = '3';

        const json = errorToJson(deep1, {maxDepth: 1});
        const cause = json.cause as ErrorJson;
        expect(cause.message).toBe('[Max depth reached]');
        expect(cause.name).toBe('Error');
    });

    it('handles AggregateError', () => {
        // @ts-expect-error AggregateError may not be a supported property depending on the environment
        const err = new AggregateError([new Error('fail')], 'fail') as DynamicError;
        const json = errorToJson(err);
        expect(json.name).toBe('AggregateError');
        expect(json.message).toBe('fail');
        expect(json.errors?.length).toBe(1);
        // @ts-expect-error index signature
        expect((json.errors[0] as ErrorJson).message).toBe('fail');
    });

    it('handles Error with non AggregateError errors property', () => {
        const err = new Error('fail') as DynamicError;
        err.errors = [new Error('error1'), 'error2'];
        const json = errorToJson(err);
        expect(json.name).toBe('Error');
        expect(json.message).toBe('fail');
        expect(json.errors?.length).toBe(2);
        // @ts-expect-error index signature
        expect((json.errors[0] as ErrorJson).message).toBe('error1');
        // @ts-expect-error index signature
        expect((json.errors[1] as ErrorJson).message).toBe('error2');
    });

    it('handles Error with Errors object', () => {
        const err = new Error('fail') as DynamicError;
        err.errors = {
            error1: new Error('error1'),
            error2: {message: 'error2'},
        };
        const json = errorToJson(err);
        expect(json.name).toBe('Error');
        expect(json.message).toBe('fail');
        // @ts-expect-error index signature
        expect(json.errors?.error1.message).toBe('error1');
        // @ts-expect-error index signature
        expect(json.errors?.error2.message).toBe('[object Object]'); // TODO: fix this - should be 'error2'
    });

    it('handles Error with metadata properties', () => {
        const err = new Error('fail') as DynamicError;
        const symbol = Symbol('symbol');
        err.string = 'string';
        err.number = 123;
        err.boolean = true;
        err.symbol = symbol;
        err.data = {key: 'value'};
        err.circular = err;
        err.unserializable = {};
        // @ts-expect-error unknown type
        err.unserializable.circular = err.unserializable;
        const json = errorToJson(err);
        expect(json.name).toBe('Error');
        expect(json.message).toBe('fail');
        expect(json.string).toBe('string');
        expect(json.number).toBe(123);
        expect(json.boolean).toBe(true);
        expect(json.symbol).toBe(symbol); // TODO: maybe this should be a string?
        expect(json.data).toStrictEqual({key: 'value'});
        expect(json.circular).toBe('[Circular]');
        expect(json.unserializable).toBe('[object Object]');
    });
});

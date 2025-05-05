import {errorToJson} from '../src';
import {ErrorShape, isArray} from '../src/types';

describe('errorToJson', () => {
    it('serializes a basic Error', () => {
        const err = new Error('oops') as ErrorShape;
        err.code = 'E_OOPS';
        const json = errorToJson(err);
        expect(json.name).toBe('Error');
        expect(json.message).toBe('oops');
        expect(json.code).toBe('E_OOPS');
        expect(typeof json.stack).toBe('string');
    });

    it('handles primitive cause', () => {
        const err = new Error('fail') as ErrorShape;
        err.cause = 123;
        const json = errorToJson(err);
        expect(json.cause).toBe(123);
    });

    it('handles undefined message', () => {
        const err = new Error() as ErrorShape;
        err.name = undefined;
        const json = errorToJson(err);
        expect(json.name).toBe('Error');
        expect(json.message).toBe('Unknown Error');
    });

    it('handles nested Error cause', () => {
        const cause = new Error('root') as ErrorShape;
        const err = new Error('fail') as ErrorShape;
        err.cause = cause;
        const json = errorToJson(err);
        expect((json.cause as ErrorShape).message).toBe('root');
    });

    it('handles nested Error cause that is not an instance of Error or primitive', () => {
        const cause = Symbol('root');
        const err = new Error('fail') as ErrorShape;
        err.cause = {cause};
        const json = errorToJson(err);
        // @ts-expect-error index signature
        expect(json.cause?.cause.toString()).toMatch('Symbol(root)');

        const cause2 = [new Error('root'), Symbol('root'), []];
        const err2 = new Error('fail') as ErrorShape;
        err2.cause = {cause: cause2};
        const json2 = errorToJson(err2);
        // @ts-expect-error index signature
        expect(json2.cause.cause?.[0].message).toStrictEqual('root');
    });

    it('handles nested Error cause that cannot be serialized', () => {
        const cause = {message: 'circular'} as ErrorShape;
        const err = new Error('fail') as ErrorShape;
        err.cause = cause;
        cause.cause = {cause};
        const json = errorToJson(err);
        // @ts-expect-error index signature
        expect(json.cause.cause.cause).toBe('[Circular]');
    });

    it('detects circular cause', () => {
        const err = new Error('self') as ErrorShape;
        err.cause = err;
        const json = errorToJson(err);
        expect(json.cause).toBe('[Circular]');
    });

    it('detects circular cause and handles missing Name', () => {
        const err = new Error('self') as ErrorShape;
        err.name = undefined;
        err.cause = err;
        const json = errorToJson(err);
        expect(json.cause).toBe('[Circular]');
    });

    it('respects maxDepth option', () => {
        const deep1 = new Error('1') as ErrorShape;
        const deep2 = new Error('2') as ErrorShape;
        deep1.cause = deep2;
        deep2.cause = new Error('3') as ErrorShape;
        const json = errorToJson(deep1, {maxDepth: 1});
        const cause = json.cause as ErrorShape;
        expect(cause.message).toBeUndefined(); // Max depth reached
    });

    it('respects maxDepth option and handles missing Name', () => {
        const deep1 = new Error('1') as ErrorShape;
        deep1.name = '1';
        const deep2 = new Error('2') as ErrorShape;
        deep2.name = undefined;
        deep1.cause = deep2;
        const deep3 = new Error('3') as ErrorShape;
        deep2.cause = deep3;
        deep3.name = '3';

        const json = errorToJson(deep1, {maxDepth: 1});
        expect(json.cause).toBe('[Max depth of 1 reached]');
    });

    it('handles AggregateError', () => {
        // @ts-expect-error AggregateError may not be a supported property depending on the environment
        const err = new AggregateError([new Error('fail')], 'fail') as ErrorShape;
        const json = errorToJson(err);
        expect(json.name).toBe('AggregateError');
        expect(json.message).toBe('fail');
        expect(isArray(json.errors) && json.errors?.length).toBe(1);
        // @ts-expect-error index signature
        expect((json.errors[0] as ErrorJson).message).toBe('fail');
    });

    it('handles Error with non AggregateError errors property', () => {
        const err = new Error('fail') as ErrorShape;
        err.errors = [new Error('error1'), 'error2'];
        const json = errorToJson(err);
        expect(json.name).toBe('Error');
        expect(json.message).toBe('fail');
        expect(isArray(json.errors) && json.errors?.length).toBe(2);
        // @ts-expect-error index signature
        expect((json.errors[0] as ErrorJson).message).toBe('error1');
        // @ts-expect-error index signature
        expect(json.errors[1]).toBe('error2');
    });

    it('handles Error with Errors object', () => {
        const err = new Error('fail') as ErrorShape;
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
        expect(json.errors?.error2.message).toBe('error2');
    });

    it('handles Error with metadata properties', () => {
        const err = new Error('fail') as ErrorShape;
        err.string = 'string';
        err.number = 123;
        err.boolean = true;
        err.data = {key: 'value'};
        err.err = new Error('to err is human') as ErrorShape;
        err.errs = [new Error('error1'), 'error2', err]; // last creates a circular reference
        err.circular = err;
        err.unserializable = {};
        // @ts-expect-error unknown type
        err.unserializable.circular = err.unserializable;
        err.anObject = {key: 'value'};
        err.anObjectWithSeen = {seen: err.anObject};
        err.fakeCircular = err.anObject;
        err.function = () => 'function';
        const json = errorToJson(err);
        expect(json.name).toBe('Error');
        expect(json.message).toBe('fail');
        expect(json.string).toBe('string');
        expect(json.number).toBe(123);
        expect(json.boolean).toBe(true);
        // @ts-expect-error index signature
        expect(json.data.key).toBe('value');
        expect((json.err as ErrorShape).message).toBe('to err is human');
        // @ts-expect-error index signature
        expect(json.errs[2]).toBe('[Circular]');
        expect(json.circular).toBe('[Circular]');
        // @ts-expect-error index signature
        expect(json.unserializable.circular).toBe('[Circular]');
        expect(json.function).toBe("() => 'function'");
    });

    it('handles Error with metadata symbol properties', () => {
        const err = new Error('fail') as ErrorShape;
        const keySymbol = Symbol('keySymbol');
        const keySymbolValue = Symbol('keySymbolValue');
        err[keySymbol] = keySymbolValue;
        const json = errorToJson(err);
        expect(json['Symbol(keySymbol)']).toBe(keySymbolValue.toString());
    });
});

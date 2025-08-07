// src/libs.ts
import {isErrorLike, isFunction, isSymbol} from './types';

export function supportsErrorOptions(): boolean {
    try {
        // @ts-expect-error cause may not be a supported property depending on the environment
        const e = new Error('', {cause: new Error('x')});
        // @ts-expect-error cause may not be a supported property depending on the environment
        return isErrorLike(e.cause);
    } /* node:coverage ignore next 2 */ catch {
        return false;
    }
}

export function supportsAggregateError(): boolean {
    try {
        // @ts-expect-error AggregateError may not be a supported property depending on the environment
        return isFunction(AggregateError);
    } /* node:coverage ignore next 2 */ catch {
        return false;
    }
}

interface ExtractMetaDataOptions {
    includeNonEnumerable?: boolean;
}

export function extractMetaData(obj: object, opts: ExtractMetaDataOptions = {}): (string | symbol)[] {
    return Reflect.ownKeys(obj).filter(key => {
        // enumerable filtering
        const desc = Object.getOwnPropertyDescriptor(obj, key as string | symbol);
        // noinspection RedundantIfStatementJS
        if (desc && !desc.enumerable && !opts.includeNonEnumerable) {
            return false;
        }
        return true;
    });
}

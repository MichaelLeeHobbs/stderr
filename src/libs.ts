// src/libs.ts
import { isErrorShaped, isFunction } from './types';

export function supportsErrorOptions(): boolean {
    try {
        const e = new Error('', { cause: new Error('x') });
        return isErrorShaped((e as Error).cause);
    } /* node:coverage ignore next 2 */ catch {
        return false;
    }
}

export function supportsAggregateError(): boolean {
    try {
        return isFunction((globalThis as { AggregateError?: unknown }).AggregateError);
    } /* node:coverage ignore next 2 */ catch {
        return false;
    }
}

interface ExtractMetaDataOptions {
    includeNonEnumerable?: boolean;
}

export function extractMetaData(obj: object, opts: ExtractMetaDataOptions = {}): (string | symbol)[] {
    if (!opts.includeNonEnumerable) {
        const stringKeys = Object.keys(obj);
        const symbolKeys = Object.getOwnPropertySymbols(obj).filter(s => {
            const d = Object.getOwnPropertyDescriptor(obj, s);
            return d?.enumerable === true;
        });
        return [...stringKeys, ...symbolKeys];
    }
    return Reflect.ownKeys(obj);
}

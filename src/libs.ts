import {isSymbol} from "./types";

export function supportsErrorOptions(): boolean {
    try {
        // @ts-expect-error cause may not be a supported property depending on the environment
        const e = new Error('', {cause: new Error('x')});
        // @ts-expect-error cause may not be a supported property depending on the environment
        return e.cause instanceof Error;
    } /* node:coverage ignore next 2 */ catch {
        return false;
    }
}

export function supportsAggregateError(): boolean {
    try {
        // @ts-expect-error AggregateError may not be a supported property depending on the environment
        return typeof AggregateError === 'function';
    } /* node:coverage ignore next 2 */ catch {
        return false;
    }
}

interface ExtractMetaDataOptions {
    includeSymbols?: boolean;
    includeNonEnumerable?: boolean;
}

export function extractMetaData(obj: object, opts: ExtractMetaDataOptions = {}): (string | symbol)[] {
    return Reflect.ownKeys(obj).filter(key => {
        if (key === 'name' || key === 'message' || key === 'cause' || key === 'errors') {
            return false;
        }
        // symbol filtering
        if (isSymbol(key) && !opts.includeSymbols) {
            return false;
        }
        // enumerable filtering
        const desc = Object.getOwnPropertyDescriptor(obj, key as string | symbol);
        // noinspection RedundantIfStatementJS
        if (desc && !desc.enumerable && !opts.includeNonEnumerable) {
            return false;
        }
        return true;
    });
}

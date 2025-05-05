// src/errorToJson.ts
import {unknownToJson} from './serializer';
import {ErrorShape} from './types';

const DEFAULT_MAX_DEPTH = 8;

export interface ErrorToJsonOptions {
    /** How deep to recurse (default: 8) */
    maxDepth?: number;
}

export function errorToJson(err: ErrorShape, options: ErrorToJsonOptions = {}): ErrorShape {
    // @ts-expect-error testing
    return unknownToJson(err, options.maxDepth ?? DEFAULT_MAX_DEPTH);
}

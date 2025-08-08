// src/errorToJson.ts
import { unknownToJson } from './serializer';
import { ErrorShape } from './types';

const DEFAULT_MAX_DEPTH = 8;

export interface ErrorToJsonOptions {
    /** How deep to recurse (default: 8) */
    maxDepth?: number;
}

/**
 * Convert an Error-like object into a JSON-safe structure.
 * Returns a plain object graph containing only JSON-safe values.
 */
export function errorToJson(err: ErrorShape, options: ErrorToJsonOptions = {}): ErrorShape {
    return unknownToJson(err, options.maxDepth ?? DEFAULT_MAX_DEPTH) as ErrorShape;
}

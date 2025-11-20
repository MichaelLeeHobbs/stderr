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

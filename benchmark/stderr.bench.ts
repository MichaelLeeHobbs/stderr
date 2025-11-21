// benchmark/stderr.bench.ts
import Benchmark from 'benchmark';
import { stderr } from '../src';

const suite = new Benchmark.Suite();

// Test data
const primitiveError = 'Simple error message';
const nativeError = new Error('Native error with stack');
const simpleObject = { message: 'Simple object error', code: 'ERR_001' };

const deepObject = {
    message: 'Deep error',
    cause: {
        message: 'Level 1 cause',
        cause: {
            message: 'Level 2 cause',
            cause: {
                message: 'Level 3 cause',
            },
        },
    },
};

const errorWithMetadata = {
    message: 'Error with metadata',
    code: 'ERR_500',
    statusCode: 500,
    details: 'Internal server error',
    timestamp: Date.now(),
    requestId: 'abc-123-def-456',
    userId: 12345,
    endpoint: '/api/users',
};

const largeArray = Array.from({ length: 100 }, (_, i) => ({
    message: `Error ${i}`,
    index: i,
}));

const aggregateError = {
    name: 'AggregateError',
    message: 'Multiple errors occurred',
    errors: [new Error('First error'), new Error('Second error'), new Error('Third error')],
};

// Benchmarks
suite
    .add('stderr(string primitive)', () => {
        stderr(primitiveError);
    })
    .add('stderr(number primitive)', () => {
        stderr(404);
    })
    .add('stderr(null)', () => {
        stderr(null);
    })
    .add('stderr(undefined)', () => {
        stderr(undefined);
    })
    .add('stderr(Error instance)', () => {
        stderr(nativeError);
    })
    .add('stderr(simple object)', () => {
        stderr(simpleObject);
    })
    .add('stderr(deep nested object)', () => {
        stderr(deepObject);
    })
    .add('stderr(error with metadata)', () => {
        stderr(errorWithMetadata);
    })
    .add('stderr(large array)', () => {
        stderr(largeArray);
    })
    .add('stderr(AggregateError)', () => {
        stderr(aggregateError);
    })
    .add('stderr(deep object, maxDepth=3)', () => {
        stderr(deepObject, { maxDepth: 3 });
    })
    .add('stderr(deep object, maxDepth=10)', () => {
        stderr(deepObject, { maxDepth: 10 });
    })
    .on('cycle', (event: Benchmark.Event) => {
        console.log(String(event.target));
    })
    .on('complete', function (this: Benchmark.Suite) {
        console.log('\n=== Fastest Operations ===');
        const fastest = this.filter('fastest');
        fastest.forEach((benchmark: Benchmark.Suite) => {
            console.log(`✓ ${benchmark.name}`);
        });

        console.log('\n=== Slowest Operations ===');
        const slowest = this.filter('slowest');
        slowest.forEach((benchmark: Benchmark.Suite) => {
            console.log(`✗ ${benchmark.name}`);
        });
    })
    .run({ async: false });

// benchmark/stderror-methods.bench.ts
import Benchmark from 'benchmark';
import { stderr } from '../src';

const suite = new Benchmark.Suite();

// Create different types of errors for testing
const simpleError = stderr('Simple error');
const deepError = stderr({
    message: 'Deep error',
    cause: {
        message: 'Cause 1',
        cause: {
            message: 'Cause 2',
            cause: { message: 'Cause 3' },
        },
    },
});

const errorWithMetadata = stderr({
    message: 'Error with lots of metadata',
    code: 'ERR_500',
    statusCode: 500,
    details: 'Detailed error information',
    timestamp: Date.now(),
    requestId: 'abc-123',
    userId: 12345,
    metadata: {
        nested: {
            deeply: {
                value: 'test',
            },
        },
    },
});

const aggregateError = stderr({
    name: 'AggregateError',
    message: 'Multiple errors',
    errors: [stderr('Error 1'), stderr('Error 2'), stderr('Error 3')],
});

// Benchmarks for StdError methods
suite
    .add('StdError.toString() - simple', () => {
        simpleError.toString();
    })
    .add('StdError.toString() - deep', () => {
        deepError.toString();
    })
    .add('StdError.toString() - with metadata', () => {
        errorWithMetadata.toString();
    })
    .add('StdError.toString() - aggregate', () => {
        aggregateError.toString();
    })
    .add('StdError.toJSON() - simple', () => {
        simpleError.toJSON();
    })
    .add('StdError.toJSON() - deep', () => {
        deepError.toJSON();
    })
    .add('StdError.toJSON() - with metadata', () => {
        errorWithMetadata.toJSON();
    })
    .add('StdError.toJSON() - aggregate', () => {
        aggregateError.toJSON();
    })
    .add('JSON.stringify(StdError) - simple', () => {
        JSON.stringify(simpleError);
    })
    .add('JSON.stringify(StdError) - deep', () => {
        JSON.stringify(deepError);
    })
    .add('JSON.stringify(StdError) - with metadata', () => {
        JSON.stringify(errorWithMetadata);
    })
    .add('JSON.stringify(StdError) - aggregate', () => {
        JSON.stringify(aggregateError);
    })
    .on('cycle', (event: Benchmark.Event) => {
        console.log(String(event.target));
    })
    .on('complete', function (this: Benchmark.Suite) {
        console.log('\n=== Performance Summary ===');
        console.log('Fastest:', this.filter('fastest').map('name'));
        console.log('Slowest:', this.filter('slowest').map('name'));
    })
    .run({ async: false });

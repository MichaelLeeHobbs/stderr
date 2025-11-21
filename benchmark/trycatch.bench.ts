// benchmark/trycatch.bench.ts
import Benchmark from 'benchmark';
import { tryCatch } from '../src';

const suite = new Benchmark.Suite();

// Test functions
const successFunc = () => 42;
const successAsyncFunc = async () => 42;
const errorFunc = () => {
    throw new Error('Test error');
};
const errorAsyncFunc = async () => {
    throw new Error('Test error');
};

// Benchmarks
suite
    .add('tryCatch(sync success)', () => {
        tryCatch(successFunc);
    })
    .add('tryCatch(sync error)', () => {
        tryCatch(errorFunc);
    })
    .add('tryCatch(sync with mapError)', () => {
        tryCatch(errorFunc, err => ({ code: err.name, msg: err.message }));
    })
    .add('tryCatch(async success)', async () => {
        await tryCatch(successAsyncFunc);
    })
    .add('tryCatch(async error)', async () => {
        await tryCatch(errorAsyncFunc);
    })
    .add('tryCatch(async with mapError)', async () => {
        await tryCatch(errorAsyncFunc, err => ({ code: err.name, msg: err.message }));
    })
    .add('tryCatch(Promise.resolve)', async () => {
        await tryCatch(() => Promise.resolve(42));
    })
    .add('tryCatch(Promise.reject)', async () => {
        await tryCatch(() => Promise.reject('error'));
    })
    // Comparison: traditional try-catch
    .add('traditional try-catch (sync)', () => {
        try {
            return successFunc();
        } catch {
            return null;
        }
    })
    .add('traditional try-catch (sync error)', () => {
        try {
            return errorFunc();
        } catch {
            return null;
        }
    })
    .on('cycle', (event: Benchmark.Event) => {
        console.log(String(event.target));
    })
    .on('complete', function (this: Benchmark.Suite) {
        console.log('\n=== Performance Analysis ===');
        console.log('Fastest:', this.filter('fastest').map('name'));
        console.log('Slowest:', this.filter('slowest').map('name'));

        // Calculate overhead
        // @ts-expect-error -- Benchmark types
        const traditionalSync = this.filter((b: Benchmark) => b.name === 'traditional try-catch (sync)')[0];
        // @ts-expect-error -- Benchmark types
        const tryCatchSync = this.filter((b: Benchmark) => b.name === 'tryCatch(sync success)')[0];

        if (traditionalSync && tryCatchSync) {
            const overhead = ((tryCatchSync.stats.mean / traditionalSync.stats.mean - 1) * 100).toFixed(2);
            console.log(`\ntryCatch overhead vs traditional: ${overhead}%`);
        }
    })
    .run({ async: true });

// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.test.ts'],
        testTimeout: 60_000,
        clearMocks: true,
        coverage: {
            enabled: true,
            // istanbul instead of v8: v8 coverage merged across test files was non-deterministic here,
            // reporting anywhere from ~79% to ~93% branch coverage for the same code on consecutive runs.
            provider: 'istanbul',
            reportsDirectory: 'coverage',
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.d.ts',
                'src/index.ts', // Index file just exports
            ],
            thresholds: {
                branches: 95,
                functions: 95,
                lines: 95,
                statements: 95,
            },
        },
    },
});

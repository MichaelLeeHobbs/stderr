// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testTimeout: 60_000,
    clearMocks: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    // babel (istanbul) instead of v8: v8 coverage merged across test files was non-deterministic here,
    // reporting anywhere from ~79% to ~93% branch coverage for the same code on consecutive runs.
    coverageProvider: 'babel',
    coverageThreshold: {
        global: {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95,
        },
    },
    testMatch: ['**/test/**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts', // Index file just exports
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.test.json',
            },
        ],
    },
};

export default config;

// ============================================================
// jest.config.ts
// ============================================================

import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                strict: true,
                esModuleInterop: true,
            },
        }],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
        '!src/config/swagger.ts',
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
    setupFilesAfterEnv: [],
    clearMocks: true,
    restoreMocks: true,
    verbose: true,
    testTimeout: 30000,
};

export default config;

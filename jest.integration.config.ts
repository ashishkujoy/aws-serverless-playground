/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
    globalSetup: '<rootDir>/tests/integration/setup/globalSetup.ts',
    globalTeardown: '<rootDir>/tests/integration/setup/globalTeardown.ts',
    testTimeout: 120000,
    maxWorkers: 1,
};

import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['**/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  moduleNameMapper: {
    '^@mediflow/database$': '<rootDir>/../../libs/database/src/index.ts',
    '^@mediflow/database/(.*)$': '<rootDir>/../../libs/database/src/$1',
    '^@mediflow/shared$': '<rootDir>/../../libs/shared/src/index.ts',
    '^@mediflow/shared/(.*)$': '<rootDir>/../../libs/shared/src/$1',
  },
};

export default config;

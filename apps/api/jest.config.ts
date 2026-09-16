import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['**/src/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/**/*.dto.ts',
  ],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@mediflow/database$': '<rootDir>/../../libs/database/src/index.ts',
    '^@mediflow/database/(.*)$': '<rootDir>/../../libs/database/src/$1',
    '^@mediflow/shared$': '<rootDir>/../../libs/shared/src/index.ts',
    '^@mediflow/shared/(.*)$': '<rootDir>/../../libs/shared/src/$1',
  },
};

export default config;

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', '/\\.tools/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: true,
    }],
  },
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', '/\\.tools/', '/test-setup/'],
  coverageThreshold: {
    global: {
      branches: 35,
      functions: 45,
      lines: 50,
      statements: 48,
    },
    './src/services/client_zapo.ts': {
      branches: 55,
      functions: 55,
      lines: 80,
      statements: 78,
    },
    './src/services/zapo/zapo_reconnect_policy.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^baileys$': '<rootDir>/test-setup/baileys.mock.ts',
    '^baileys/lib/Utils/logger$': '<rootDir>/test-setup/baileys-logger.mock.ts',
    '^@whiskeysockets/baileys$': '<rootDir>/test-setup/baileys.mock.ts',
    '^@whiskeysockets/baileys/lib/Utils/logger$': '<rootDir>/test-setup/baileys-logger.mock.ts',
    '^audio-decode$': '<rootDir>/test-setup/audio-decode.mock.ts',
  },
};

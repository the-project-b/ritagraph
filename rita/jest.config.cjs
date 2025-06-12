module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.(ts|js)',
    '**/*.(test|spec).(ts|js)'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs',
        target: 'es2020'
      }
    }],
    '^.+\\.js$': ['ts-jest', {
      useESM: false
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@langchain|langsmith)/)'
  ],
  collectCoverageFrom: [
    '**/*.(ts|js)',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
}; 
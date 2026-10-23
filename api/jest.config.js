/** Unit tests run without a database: rules are pure, controllers get a fake Prisma. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.rules.ts',
    'src/common/auth/**/*.ts',
    'src/common/validation/**/*.ts',
  ],
  globals: { 'ts-jest': { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true } },
};

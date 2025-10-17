/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  coverageDirectory: './coverage',
  collectCoverage: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters: ['default', ['jest-junit', { outputName: 'junit.xml' }]],
};

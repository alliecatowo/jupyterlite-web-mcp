/** Unit tests cover the pure modules only: no JupyterLab runtime is required. */
module.exports = {
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }]
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/limits.ts',
    'src/jupyter/errors.ts',
    'src/jupyter/revisions.ts',
    'src/jupyter/outputs.ts',
    'src/jupyter/paths.ts',
    'src/webmcp/results.ts',
    'src/webmcp/schemas.ts',
    'src/review/model.ts',
    'src/review/anchors.ts'
  ]
};

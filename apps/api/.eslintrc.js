module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    // Standard NestJS boilerplate relaxations — this codebase uses `any` in
    // a few DB/JSON-boundary spots (metadata columns, third-party payloads).
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Formatting (quote style, trailing commas, etc.) is intentionally NOT
    // enforced here — the codebase mixes single/double quotes across files
    // with no prior convention, so a Prettier lint rule would flag ~2000
    // pre-existing lines as "errors" on every file, regardless of which
    // style is picked. Run `pnpm prettier --write .` as a separate,
    // deliberate formatting pass if/when you want to normalize style.
  },
};

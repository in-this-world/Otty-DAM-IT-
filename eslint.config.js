// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // core/ is pure TS: zero Phaser imports (MASTER_PLAN §2.1)
      'no-restricted-imports': ['error', { paths: [{ name: 'phaser', message: 'src/core/ must stay Phaser-free.' }] }],
    },
  },
);

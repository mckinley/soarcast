import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  ...tseslint.configs.recommended,
  globalIgnores(['build/**', '.react-router/**', '.wrangler/**', 'node_modules/**']),
]);

export default eslintConfig;

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // test/staging-config.test.mjs runs with node --test (npm run test:staging)
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**', 'test/staging-config.test.mjs'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

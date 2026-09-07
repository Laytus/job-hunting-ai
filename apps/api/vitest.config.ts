import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['test/database/**', 'node_modules/**', 'dist/**'],
  },
});

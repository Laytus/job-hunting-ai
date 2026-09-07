import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/database/**/*.test.ts'],
    fileParallelism: false,
  },
});

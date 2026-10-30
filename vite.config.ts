import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // Three.js allein ist größer als das Standardlimit.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // Three.js allein ist größer als das Standardlimit.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Mehrspieler im Entwicklungsmodus: WebSocket an den Spielserver (npm run server) weiterreichen
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

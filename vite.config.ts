import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Kennung dieses Builds: Client und Server vergleichen sie (alte Seite im Cache → „Neue Version“). */
const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

/**
 * Nach dem Build: version.json für den Server schreiben und Text- und
 * Modelldateien vorab mit Brotli und gzip komprimieren (der Server liefert
 * dann die kleinste passende Fassung aus).
 */
function prepareDist(): Plugin {
  return {
    name: 'prepare-dist',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      writeFileSync(join(dist, 'version.json'), JSON.stringify({ build: BUILD_ID }));
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
      for (const file of walk(dist)) {
        if (!/\.(js|css|html|json|svg|glb)$/.test(file) || statSync(file).size < 1024) continue;
        const data = readFileSync(file);
        writeFileSync(`${file}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
        writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
      }
    },
  };
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [prepareDist()],
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
    // Simulations- und Netztests brauchen unter Last manchmal länger als 5 s
    testTimeout: 20000,
  },
});

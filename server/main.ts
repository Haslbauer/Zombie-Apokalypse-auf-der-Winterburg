/**
 * Spielserver: liefert das gebaute Spiel aus (dist/) und betreibt die
 * Mehrspieler-Räume über WebSocket (/ws). Start: npm run server
 * (vorher npm run build). Port über PORT, Standard 3000.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { Lobby } from './lobby';
import { TICK_MS } from './room';

const PORT = Number(process.env.PORT ?? 3000);
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const http = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (path === '/health') {
    res.end('ok');
    return;
  }
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(500).end('Das Spiel ist noch nicht gebaut: npm run build');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const lobby = new Lobby();
// Kompression spart bei den JSON-Schnappschüssen rund vier Fünftel der Daten.
const wss = new WebSocketServer({ server: http, path: '/ws', perMessageDeflate: { threshold: 512 } });
wss.on('connection', (ws: WebSocket) => {
  const client = lobby.connect((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  ws.on('message', (raw) => lobby.message(client, String(raw)));
  ws.on('close', () => lobby.disconnect(client));
});

// Feste Tick-Rate (20 pro Sekunde), Verzug wird aufgeholt
let next = performance.now();
function loop(): void {
  const now = performance.now();
  let steps = 0;
  while (now >= next && steps < 5) {
    lobby.tick();
    next += TICK_MS;
    steps++;
  }
  if (now - next > 1000) next = now; // nach langer Pause nicht nachrennen
  setTimeout(loop, Math.max(0, next - performance.now()));
}
loop();

http.listen(PORT, () => {
  console.log(`Zombie-Apokalypse-Server läuft auf http://localhost:${PORT}`);
});

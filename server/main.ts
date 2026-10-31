/**
 * Spielserver: liefert das gebaute Spiel aus (dist/) und betreibt die
 * Mehrspieler-Räume über WebSocket (/ws). Start: npm run server (vorher
 * npm run build), zum Teilen übers Internet: npm run share.
 *
 * Umgebungsvariablen:
 *   PORT       Port (Standard 3000)
 *   HOST       Adresse (Standard 0.0.0.0, also auch im WLAN erreichbar)
 *   MAX_ROOMS  Höchstzahl gleichzeitiger Räume (Standard 200)
 *   LAG_MS     Nur zum Testen: künstliche Verzögerung je Richtung in ms
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_CLIENT_MESSAGE, type ServerMessage } from '../src/net/protocol';
import { Lobby } from './lobby';
import { TICK_MS } from './room';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 200);
const LAG_MS = Number(process.env.LAG_MS ?? 0);
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
/** Herzschlag: so oft prüfen, ob die Verbindung noch lebt (ms); wer zweimal nicht antwortet, fliegt raus. */
const HEARTBEAT_MS = 5000;

const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

/** Kennung des gebauten Spiels (dist/version.json); der Client meldet „Neue Version“, wenn sie nicht passt. */
function buildId(): string | null {
  try {
    return JSON.parse(readFileSync(join(DIST, 'version.json'), 'utf8')).build ?? null;
  } catch {
    return null;
  }
}
const BUILD = buildId();

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
};

/**
 * Statische Dateien: vorkomprimiert (.br/.gz vom Build), Dateien mit Hash
 * (assets/) dauerhaft im Cache, index.html immer frisch; unbekannte Pfade
 * ohne Dateiendung zeigen die Startseite (Einladungslinks).
 */
function serveStatic(req: IncomingMessage, res: ServerResponse, path: string): void {
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) {
    res.writeHead(403, SECURITY_HEADERS).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(path)) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': TYPES['.txt'] }).end('Nicht gefunden');
      return;
    }
    file = join(DIST, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(503, { 'Content-Type': TYPES['.txt'] }).end('Das Spiel ist noch nicht gebaut: npm run build');
    return;
  }
  const accept = String(req.headers['accept-encoding'] ?? '');
  let sendFile = file;
  let encoding: string | null = null;
  if (/\bbr\b/.test(accept) && existsSync(`${file}.br`)) {
    sendFile = `${file}.br`;
    encoding = 'br';
  } else if (/\bgzip\b/.test(accept) && existsSync(`${file}.gz`)) {
    sendFile = `${file}.gz`;
    encoding = 'gzip';
  }
  const hashed = path.startsWith('/assets/');
  const headers: Record<string, string | number> = {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': statSync(sendFile).size,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    Vary: 'Accept-Encoding',
  };
  if (encoding) headers['Content-Encoding'] = encoding;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else createReadStream(sendFile).pipe(res);
}

const lobby = new Lobby({ maxRooms: MAX_ROOMS, log });

const http = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, SECURITY_HEADERS).end();
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400, SECURITY_HEADERS).end();
    return;
  }
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, build: BUILD, rooms: lobby.rooms.size, players: lobby.playerCount }));
    return;
  }
  serveStatic(req, res, path);
});

// Kompression spart bei den JSON-Schnappschüssen über 90 % der Daten.
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_CLIENT_MESSAGE, perMessageDeflate: { threshold: 256 } });
const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (ws: WebSocket) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  // LAG_MS (nur Test): beide Richtungen verzögern
  const later = (fn: () => void) => (LAG_MS > 0 ? setTimeout(fn, LAG_MS) : fn());
  const client = lobby.connect(
    (data) => later(() => ws.readyState === ws.OPEN && ws.send(data)),
    () => ws.bufferedAmount,
    () => ws.terminate(),
  );
  ws.send(JSON.stringify({ t: 'hello', build: BUILD } satisfies ServerMessage));
  ws.on('message', (raw, isBinary) => {
    if (!isBinary) later(() => lobby.message(client, String(raw)));
  });
  ws.on('close', () => lobby.disconnect(client));
  ws.on('error', () => ws.terminate());
});

// Herzschlag: tote Verbindungen (Rechner zugeklappt, WLAN weg) erkennen und aufräumen
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, HEARTBEAT_MS);

// Feste Tick-Rate (20 pro Sekunde), Verzug wird aufgeholt
let next = performance.now();
let loopTimer: NodeJS.Timeout;
function loop(): void {
  const now = performance.now();
  let steps = 0;
  while (now >= next && steps < 5) {
    lobby.tick();
    next += TICK_MS;
    steps++;
  }
  if (now - next > 1000) next = now; // nach langer Pause nicht nachrennen
  loopTimer = setTimeout(loop, Math.max(0, next - performance.now()));
}
loop();

http.listen(PORT, HOST, () => {
  log(`Zombie-Apokalypse-Server läuft auf http://localhost:${PORT} (Build ${BUILD ?? 'Entwicklung'}${LAG_MS ? `, Testverzögerung ${LAG_MS} ms` : ''})`);
});

/** Sauber herunterfahren (Neustart beim Anbieter, Strg+C): Spieler informieren, dann schließen. */
function shutdown(signal: string): void {
  log(`${signal}: Server fährt herunter`);
  clearInterval(heartbeat);
  clearTimeout(loopTimer);
  const bye = JSON.stringify({ t: 'bye', msg: 'Der Server startet neu. Gleich noch einmal versuchen.' } satisfies ServerMessage);
  for (const ws of wss.clients) {
    ws.send(bye);
    ws.close(1012, 'Neustart');
  }
  http.close();
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

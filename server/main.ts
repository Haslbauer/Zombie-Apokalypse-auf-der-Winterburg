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
 *   STATS_KEY  Spielzähler /stats nur mit ?key=… zeigen (ohne: für alle sichtbar)
 *   STATS_FILE Datei für den Spielzähler (Standard .data/stats.json)
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *              Spielzähler dauerhaft in Upstash Redis speichern (kostenlos, übersteht Neustarts)
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_CLIENT_MESSAGE, type ServerMessage } from '../src/net/protocol';
import { Lobby } from './lobby';
import { PLAY_EVENTS, PLAY_KINDS, Stats, statsPage, type PlayEvent, type PlayKind } from './stats';
import { TICK_MS } from './room';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 200);
const LAG_MS = Number(process.env.LAG_MS ?? 0);
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
/** Herzschlag: so oft prüfen, ob die Verbindung noch lebt (ms). */
const HEARTBEAT_MS = 5000;
/** Erst nach so vielen unbeantworteten Herzschlägen trennen (kurze Tunnel-Aussetzer überstehen). */
const HEARTBEAT_MISSES = 6;
/** Warnung im Log, wenn ein Tick länger dauert (ms). */
const SLOW_TICK_MS = 30;

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

const STATS_KEY = process.env.STATS_KEY ?? '';
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const stats = new Stats({
  file: process.env.STATS_FILE ?? resolve(fileURLToPath(new URL('../.data/stats.json', import.meta.url))),
  redis: redisUrl && redisToken ? { url: redisUrl, token: redisToken } : null,
  log,
});
const lobby = new Lobby({ maxRooms: MAX_ROOMS, log, onPlay: (kind, event) => stats.record(kind, event) });

/** Missbrauchsschutz für /api/played: höchstens 20 Meldungen je Adresse und Minute (nur im Speicher). */
const playedRate = new Map<string, number>();
setInterval(() => playedRate.clear(), 60_000).unref();
const MAX_BODY = 200;

/** Einzelspieler-Partien meldet der Browser: POST /api/played {kind, event}. */
function handlePlayed(req: IncomingMessage, res: ServerResponse): void {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const n = (playedRate.get(ip) ?? 0) + 1;
  playedRate.set(ip, n);
  if (n > 20) {
    res.writeHead(429, SECURITY_HEADERS).end();
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    body += chunk;
    if (body.length > MAX_BODY) req.destroy();
  });
  req.on('end', () => {
    try {
      const { kind, event } = JSON.parse(body) as { kind: PlayKind; event: PlayEvent };
      // Online-Partien zählt der Server selbst
      if (['solo', 'daily', 'zuschauen'].includes(kind) && PLAY_KINDS.includes(kind) && PLAY_EVENTS.includes(event)) stats.record(kind, event);
      res.writeHead(204, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' }).end();
    } catch {
      res.writeHead(400, SECURITY_HEADERS).end();
    }
  });
}

const http = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/played') {
    handlePlayed(req, res);
    return;
  }
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
  if (path === '/stats' || path === '/stats.json') {
    const key = new URL(req.url ?? '/', 'http://x').searchParams.get('key') ?? '';
    if (STATS_KEY && key !== STATS_KEY) {
      res.writeHead(403, { ...SECURITY_HEADERS, 'Content-Type': TYPES['.txt'] }).end('Schlüssel fehlt: /stats?key=…');
      return;
    }
    void stats.snapshot().then((data) => {
      const json = path.endsWith('.json');
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': json ? TYPES['.json'] : TYPES['.html'], 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      res.end(json ? JSON.stringify(data) : statsPage(data, stats.storage));
    });
    return;
  }
  serveStatic(req, res, path);
});

// Kompression spart bei den JSON-Schnappschüssen über 90 % der Daten.
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_CLIENT_MESSAGE, perMessageDeflate: { threshold: 256 } });
/** Unbeantwortete Herzschläge je Verbindung. */
const missed = new WeakMap<WebSocket, number>();

wss.on('connection', (ws: WebSocket) => {
  missed.set(ws, 0);
  ws.on('pong', () => missed.set(ws, 0));
  // Jede Nachricht zeigt ebenfalls, dass die Verbindung lebt
  ws.on('message', () => missed.set(ws, 0));
  // LAG_MS (nur Test): beide Richtungen verzögern
  const later = (fn: () => void) => (LAG_MS > 0 ? setTimeout(fn, LAG_MS) : fn());
  const client = lobby.connect(
    (data) => later(() => ws.readyState === ws.OPEN && ws.send(data)),
    () => ws.bufferedAmount,
    (reason) => {
      log(`Trenne Spieler: ${reason}`);
      ws.close(4000, reason.slice(0, 100));
    },
  );
  ws.send(JSON.stringify({ t: 'hello', build: BUILD } satisfies ServerMessage));
  ws.on('message', (raw, isBinary) => {
    if (!isBinary) later(() => lobby.message(client, String(raw)));
  });
  ws.on('close', (code, reason) => {
    if (code !== 1000 && code !== 1001) log(`Verbindung geschlossen (${code}${reason.length ? `: ${reason}` : ''})`);
    lobby.disconnect(client);
  });
  ws.on('error', (err) => {
    log(`Verbindungsfehler: ${err.message}`);
    ws.terminate();
  });
});

// Herzschlag: tote Verbindungen (Rechner zugeklappt, WLAN weg) erkennen und aufräumen
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const n = (missed.get(ws) ?? 0) + 1;
    if (n > HEARTBEAT_MISSES) {
      log(`Trenne Spieler: keine Antwort seit ${(HEARTBEAT_MISSES * HEARTBEAT_MS) / 1000} s`);
      ws.terminate();
      continue;
    }
    missed.set(ws, n);
    ws.ping();
  }
}, HEARTBEAT_MS);

// Feste Tick-Rate (20 pro Sekunde), Verzug wird aufgeholt
let next = performance.now();
let loopTimer: NodeJS.Timeout;
const slowTicks: number[] = [];
let lastSlowLog = 0;
function loop(): void {
  const now = performance.now();
  let steps = 0;
  while (now >= next && steps < 5) {
    const t0 = performance.now();
    lobby.tick();
    const took = performance.now() - t0;
    if (took > SLOW_TICK_MS) slowTicks.push(took);
    next += TICK_MS;
    steps++;
  }
  if (now - next > 1000) {
    log(`Server hinkt ${Math.round(now - next)} ms hinterher (Rechner ausgelastet?)`);
    next = now; // nach langer Pause nicht nachrennen
  }
  // Langsame Ticks höchstens alle 10 s melden
  if (slowTicks.length > 0 && now - lastSlowLog > 10_000) {
    log(`${slowTicks.length} langsame Ticks, längster ${Math.round(Math.max(...slowTicks))} ms`);
    slowTicks.length = 0;
    lastSlowLog = now;
  }
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
  stats.flush();
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

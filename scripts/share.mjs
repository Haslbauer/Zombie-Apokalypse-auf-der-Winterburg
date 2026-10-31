/**
 * Spiel vom eigenen Rechner aus mit Freunden teilen (kostenlos):
 *   1. baut das Spiel (überspringen mit --no-build)
 *   2. startet den Spielserver
 *   3. öffnet einen Cloudflare-Tunnel (ohne Konto) und zeigt den öffentlichen
 *      https-Link. Ohne cloudflared gibt es die Adressen fürs eigene WLAN.
 * Aufruf: npm run share   (Port mit PORT=…, Standard 3000; Ende mit Strg+C)
 */
import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3000);
const children = [];
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const line = (text = '') => console.log(text);
const box = (lines) => {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  line(`┌${'─'.repeat(width - 2)}┐`);
  for (const l of lines) line(`│ ${l.padEnd(width - 4)} │`);
  line(`└${'─'.repeat(width - 2)}┘`);
};

function stopAll() {
  for (const c of children) if (!c.killed) c.kill('SIGTERM');
}
process.on('SIGINT', () => {
  line('\nBeende Server und Tunnel …');
  stopAll();
  setTimeout(() => process.exit(0), 700);
});
process.on('SIGTERM', stopAll);

// 1. Bauen
if (!process.argv.includes('--no-build')) {
  line('Baue das Spiel …');
  const build = spawnSync(npx, ['vite', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) {
    line('Bauen fehlgeschlagen.');
    process.exit(1);
  }
}

// 2. Server
const server = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'inherit', 'inherit'],
});
children.push(server);
server.on('exit', (code) => {
  line(`Server beendet (${code ?? 'Signal'}).`);
  stopAll();
  process.exit(code ?? 0);
});

// Adressen im eigenen Netz
const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `http://${i.address}:${port}`);

// 3. Tunnel
const hasCloudflared = spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).status === 0;
if (!hasCloudflared) {
  line();
  box([
    'Spiel läuft. Im eigenen WLAN:',
    `  http://localhost:${port}`,
    ...lan.map((a) => `  ${a}`),
    '',
    'Für Freunde übers Internet fehlt cloudflared (kostenlos):',
    '  Windows:  winget install --id Cloudflare.cloudflared',
    '  macOS:    brew install cloudflared',
    '  Linux:    https://developers.cloudflare.com/cloudflare-one/',
    '            connections/connect-networks/downloads/',
    'Danach npm run share erneut starten.',
  ]);
} else {
  line('Öffne Cloudflare-Tunnel …');
  const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  let shown = false;
  const scan = (chunk) => {
    const url = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (url && !shown) {
      shown = true;
      line();
      box([
        'Spiel läuft! Diesen Link an die Freunde schicken:',
        `  ${url}`,
        '',
        'Im eigenen WLAN geht auch:',
        `  http://localhost:${port}`,
        ...lan.map((a) => `  ${a}`),
        '',
        'Der Link gilt, solange dieses Fenster offen ist (Strg+C beendet).',
      ]);
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);
  tunnel.on('exit', (code) => {
    if (!shown) line(`Der Tunnel konnte nicht geöffnet werden (cloudflared beendet mit ${code}). Im WLAN läuft das Spiel trotzdem.`);
  });
}

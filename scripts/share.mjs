/**
 * Spiel vom eigenen Rechner aus mit Freunden teilen (kostenlos):
 *   1. baut das Spiel (überspringen mit --no-build)
 *   2. startet den Spielserver
 *   3. öffnet einen Cloudflare-Tunnel (ohne Konto) und zeigt den öffentlichen
 *      https-Link. Ohne cloudflared gibt es die Adressen fürs eigene WLAN.
 * Aufruf: npm run share   (Port mit PORT=…, Standard 3000; Ende mit Strg+C)
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3000);
const children = [];
const windows = process.platform === 'win32';

/**
 * npm bzw. npx ausführen. Unter Windows sind das .cmd-Dateien, die Node seit
 * 18.20/20.12 nur noch über eine Shell startet (sonst Fehler EINVAL).
 */
function runNpm(tool, args) {
  const result = spawnSync(windows ? `${tool}.cmd` : tool, args, { cwd: root, stdio: 'inherit', shell: windows });
  if (result.error) line(`${tool} konnte nicht gestartet werden: ${result.error.message}`);
  return result.status === 0;
}

/** cloudflared im PATH oder an den üblichen Orten der Windows-Installation (winget) finden. */
function findCloudflared() {
  if (spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).status === 0) return 'cloudflared';
  if (!windows) return null;
  const candidates = [
    join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe'),
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
  ];
  return candidates.find((c) => existsSync(c) && spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0) ?? null;
}

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

// 0. Fehlende Pakete (z. B. nach git pull) selbst nachinstallieren
const needed = ['ws', 'tsx', 'vite', 'three'];
if (needed.some((p) => !existsSync(join(root, 'node_modules', p)))) {
  line('Installiere fehlende Pakete (npm install) …');
  if (!runNpm('npm', ['install'])) {
    line('npm install ist fehlgeschlagen. Bitte im Projektordner selbst „npm install“ ausführen und die Meldung prüfen.');
    process.exit(1);
  }
}

// 1. Bauen
if (!process.argv.includes('--no-build')) {
  line('Baue das Spiel …');
  if (!runNpm('npx', ['vite', 'build'])) {
    line('Bauen fehlgeschlagen (Meldung siehe oben). Tipp: einmal „npm install“ ausführen und erneut versuchen.');
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
const cloudflared = findCloudflared();
if (!cloudflared) {
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
    'Danach ein neues Terminal öffnen und npm run share erneut starten.',
  ]);
} else {
  line('Öffne Cloudflare-Tunnel …');
  const tunnel = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
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

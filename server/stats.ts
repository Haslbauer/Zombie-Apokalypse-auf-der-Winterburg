/**
 * Spielzähler: wie oft das Spiel gestartet und beendet wird. Es werden nur
 * Zahlen gespeichert, keine Namen, keine IP-Adressen, keine Cookies.
 *
 * Zählerstände (Feldname → Anzahl):
 *   start:<art>   Partie gestartet (art: solo, daily, zuschauen, koop, pvp)
 *   win:<art>     Partie gewonnen
 *   loss:<art>    Partie verloren
 *   end:pvp       PvP-Partie zu Ende
 *   day:<datum>   Starts an diesem Tag (JJJJ-MM-TT, UTC)
 *
 * Speicher:
 *   - Mit UPSTASH_REDIS_REST_URL und UPSTASH_REDIS_REST_TOKEN in einer
 *     kostenlosen Upstash-Redis-Datenbank (bleibt bei Neustarts erhalten).
 *   - Sonst in einer Datei (STATS_FILE, Standard .data/stats.json im Projekt-
 *     ordner). Beim kostenlosen Render-Tarif geht die Datei bei jedem Neustart
 *     und Einschlafen verloren; dafür ist Upstash gedacht.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type PlayKind = 'solo' | 'daily' | 'zuschauen' | 'koop' | 'pvp';
export type PlayEvent = 'start' | 'win' | 'loss' | 'end';
export const PLAY_KINDS: readonly PlayKind[] = ['solo', 'daily', 'zuschauen', 'koop', 'pvp'];
export const PLAY_EVENTS: readonly PlayEvent[] = ['start', 'win', 'loss', 'end'];

export type StatsData = Record<string, number>;

export interface StatsOptions {
  file?: string | null;
  redis?: { url: string; token: string } | null;
  now?: () => Date;
  /** Für Tests: fetch ersetzen. */
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

const HASH = 'winterburg:stats';

export class Stats {
  private data: StatsData = {};
  private readonly file: string | null;
  private readonly redis: { url: string; token: string } | null;
  private readonly now: () => Date;
  private readonly fetch: typeof fetch;
  private readonly log: (line: string) => void;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(options: StatsOptions = {}) {
    this.file = options.file ?? null;
    this.redis = options.redis ?? null;
    this.now = options.now ?? (() => new Date());
    this.fetch = options.fetch ?? fetch;
    this.log = options.log ?? (() => {});
    if (this.file && existsSync(this.file)) {
      try {
        this.data = JSON.parse(readFileSync(this.file, 'utf8'));
      } catch {
        this.data = {};
      }
    }
  }

  /** Speicherort für die Anzeige. */
  get storage(): 'upstash' | 'datei' | 'speicher' {
    return this.redis ? 'upstash' : this.file ? 'datei' : 'speicher';
  }

  /** Eine Partie zählen. Unbekannte Werte werden ignoriert. */
  record(kind: PlayKind, event: PlayEvent): void {
    if (!PLAY_KINDS.includes(kind) || !PLAY_EVENTS.includes(event)) return;
    const fields = [`${event}:${kind}`];
    if (event === 'start') fields.push(`day:${this.now().toISOString().slice(0, 10)}`);
    for (const f of fields) {
      this.data[f] = (this.data[f] ?? 0) + 1;
      if (this.redis) void this.command(['HINCRBY', HASH, f, 1]).catch((e) => this.log(`Zähler (Upstash): ${e.message}`));
    }
    if (this.file && !this.redis) this.scheduleSave();
  }

  /** Alle Zählerstände (bei Upstash frisch aus der Datenbank). */
  async snapshot(): Promise<StatsData> {
    if (!this.redis) return { ...this.data };
    try {
      const flat = (await this.command(['HGETALL', HASH])) as string[];
      const out: StatsData = {};
      for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]);
      return out;
    } catch (e) {
      this.log(`Zähler (Upstash): ${(e as Error).message}`);
      return { ...this.data };
    }
  }

  /** Datei sofort schreiben (beim Herunterfahren). */
  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.file || this.redis) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.data, null, 1));
    } catch (e) {
      this.log(`Zähler: Datei nicht geschrieben (${(e as Error).message})`);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 2000);
    this.saveTimer.unref?.();
  }

  private async command(cmd: (string | number)[]): Promise<unknown> {
    const res = await this.fetch(this.redis!.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.redis!.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json.result;
  }
}

/** Zusammenfassung für die Statistikseite. */
export function summarize(data: StatsData, days = 14, today = new Date()) {
  const n = (k: string) => data[k] ?? 0;
  const kinds = PLAY_KINDS.map((k) => ({ kind: k, start: n(`start:${k}`), win: n(`win:${k}`), loss: n(`loss:${k}`), end: n(`end:${k}`) }));
  const perDay: { day: string; starts: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    perDay.push({ day: d, starts: n(`day:${d}`) });
  }
  return { total: kinds.reduce((s, k) => s + k.start, 0), kinds, perDay };
}

const KIND_LABEL: Record<PlayKind, string> = {
  solo: 'Einzelspieler (mit Bots)',
  daily: 'Tägliche Herausforderung',
  zuschauen: 'Nur Bots (Zuschauen)',
  koop: 'Online Koop',
  pvp: 'Online PvP',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Einfache Statistikseite (HTML). */
export function statsPage(data: StatsData, storage: string, today = new Date()): string {
  const s = summarize(data, 14, today);
  const max = Math.max(1, ...s.perDay.map((d) => d.starts));
  const rows = s.kinds
    .map((k) => `<tr><td>${KIND_LABEL[k.kind]}</td><td>${k.start}</td><td>${k.kind === 'pvp' ? k.end : k.win}</td><td>${k.kind === 'pvp' ? '–' : k.loss}</td></tr>`)
    .join('');
  const bars = s.perDay
    .map((d) => `<div class="bar"><span>${esc(d.day.slice(5))}</span><i style="width:${(d.starts / max) * 100}%"></i><b>${d.starts}</b></div>`)
    .join('');
  const note = storage === 'upstash' ? 'gespeichert in Upstash Redis' : storage === 'datei' ? 'gespeichert in einer Datei auf dem Server (geht bei Render-Neustarts verloren)' : 'nur im Arbeitsspeicher';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spielzähler</title><style>
:root{color-scheme:dark;--bg:#14171c;--fg:#e8e6e1;--mut:#9aa0a8;--acc:#e6b34a;--line:#2a2f37}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;padding:24px 16px}
main{max-width:640px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}.big{font-size:44px;font-weight:700;color:var(--acc)}
.mut{color:var(--mut);font-size:13px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:6px 4px;border-bottom:1px solid var(--line);text-align:right}
td:first-child,th:first-child{text-align:left}th{color:var(--mut);font-weight:500;font-size:13px}
.bar{display:grid;grid-template-columns:48px 1fr 36px;gap:8px;align-items:center;font-size:13px;margin:3px 0}
.bar i{display:block;height:12px;background:var(--acc);border-radius:3px;min-width:1px}.bar b{text-align:right;font-weight:500}
</style></head><body><main>
<h1>Zombie-Apokalypse auf der Winterburg – Spielzähler</h1>
<div class="big">${s.total}</div><div class="mut">gestartete Partien insgesamt · ${note}</div>
<table><tr><th>Art</th><th>Gestartet</th><th>Gewonnen</th><th>Verloren</th></tr>${rows}</table>
<h2 style="font-size:16px">Starts der letzten 14 Tage</h2>${bars}
<p class="mut">Es werden nur Zahlen gezählt – keine Namen, keine IP-Adressen, keine Cookies. Partien, die abgebrochen werden, zählen als gestartet, aber weder gewonnen noch verloren.</p>
</main></body></html>`;
}

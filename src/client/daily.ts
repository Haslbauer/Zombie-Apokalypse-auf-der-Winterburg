import type { BotsDef, GameLevel, TeamRole, WaveEventKind } from '../sim/types';

/**
 * Tägliche Herausforderung: Für jeden Tag stehen Seed, Team (Tank, Schaden,
 * Support; man spielt den ersten), Schwierigkeit und ein Mutator fest. Ein
 * Mutator macht jede Welle zu einem Wellen-Ereignis (Nebelnacht, Blutmond
 * oder Regen). Die Bestenliste (höchste Welle, dann kürzeste Zeit) liegt im
 * Browser.
 */
export interface DailySetup {
  /** Tag als JJJJ-MM-TT (Ortszeit). */
  key: string;
  seed: number;
  /** Helden-Ids; der Spieler spielt heroes[0], die anderen spielen Bots. */
  heroes: string[];
  level: GameLevel;
  event: WaveEventKind;
}

export interface DailyResult {
  wave: number;
  time: number;
  victory: boolean;
  hero: string;
  date: string;
}

const KEY = 'winterburg.daily';
/** So viele Einträge je Tag bleiben in der Liste. */
export const DAILY_KEEP = 5;
const EVENTS: WaveEventKind[] = ['nebel', 'blutmond', 'regen'];

/** Kleiner, fester Zufall aus einer Zahl (mulberry32). */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Aufbau des Tages (für alle mit demselben Datum gleich). */
export function dailySetup(bots: BotsDef, heroIds: string[], date = new Date()): DailySetup {
  const key = dayKey(date);
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const r = rand(h);
  const pick = (role: TeamRole) => {
    const pool = heroIds.filter((id) => bots.heroes[id]?.teamRole === role);
    return pool.length > 0 ? pool[Math.floor(r() * pool.length)] : null;
  };
  const team = (['tank', 'dmg', 'support'] as TeamRole[]).map(pick).filter((x): x is string => !!x);
  // Reihenfolge mischen: wer gespielt wird, wechselt
  for (let i = team.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [team[i], team[j]] = [team[j], team[i]];
  }
  // Sonntags Albtraum, sonst normal
  const level: GameLevel = date.getDay() === 0 ? 'albtraum' : 'normal';
  return { key, seed: h % 2 ** 31, heroes: team, level, event: EVENTS[Math.floor(r() * EVENTS.length)] };
}

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Besser = höhere Welle, bei gleicher Welle (bzw. Sieg) kürzere Zeit. */
export function better(a: DailyResult, b: DailyResult): number {
  if (a.victory !== b.victory) return a.victory ? -1 : 1;
  if (a.wave !== b.wave) return b.wave - a.wave;
  return a.time - b.time;
}

export function loadDaily(key: string, store = storage()): DailyResult[] {
  try {
    const all = JSON.parse(store?.getItem(KEY) ?? '{}');
    const list = Array.isArray(all?.[key]) ? all[key] : [];
    return list.filter((x: DailyResult) => typeof x?.wave === 'number' && typeof x?.time === 'number').sort(better);
  } catch {
    return [];
  }
}

/** Ergebnis eintragen (nur der heutige und die letzten Tage bleiben); gibt den Platz (1…) oder null zurück. */
export function recordDaily(key: string, result: DailyResult, store = storage()): number | null {
  let all: Record<string, DailyResult[]> = {};
  try {
    all = JSON.parse(store?.getItem(KEY) ?? '{}') ?? {};
  } catch {
    all = {};
  }
  const list = [...loadDaily(key, store), result].sort(better).slice(0, DAILY_KEEP);
  const rank = list.indexOf(result);
  all[key] = list;
  // Alte Tage aufräumen (höchstens 14 Tage behalten)
  for (const k of Object.keys(all).sort().slice(0, -14)) delete all[k];
  try {
    store?.setItem(KEY, JSON.stringify(all));
  } catch {
    // ohne Speicher
  }
  return rank >= 0 ? rank + 1 : null;
}

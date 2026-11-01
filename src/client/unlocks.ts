import type { FinalHeroStats, GameLevel, TeamStats } from '../sim/types';

/**
 * Freischaltbares: Erfolge nach Spielende bringen Titel (unter dem Namen in
 * Heldenleiste und Teamliste) und Laternenfarben (Licht und Leuchtkreis um den
 * eigenen Helden). Alles wird im Browser gespeichert und ist nur auf dem
 * eigenen Bildschirm zu sehen.
 */
export interface Achievement {
  id: string;
  name: string;
  /** Wie man ihn bekommt. */
  how: string;
  title?: string;
  lantern?: { name: string; color: number };
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'welle5', name: 'Erste Nacht', how: 'Welle 5 erreichen', title: 'Nachtwache' },
  { id: 'welle10', name: 'Zähe Mauer', how: 'Welle 10 erreichen', lantern: { name: 'Moosgrün', color: 0x8ce06a } },
  { id: 'sieg', name: 'Burgretter', how: 'Koop gewinnen (Welle 20 überstehen)', title: 'Burgretter', lantern: { name: 'Gold', color: 0xffd166 } },
  { id: 'albtraum', name: 'Albtraum besiegt', how: 'Koop auf Albtraum gewinnen', title: 'Albtraumbezwinger', lantern: { name: 'Blutrot', color: 0xff3a2a } },
  { id: 'bosse', name: 'Bossjäger', how: '5 Zwischenbosse in einer Partie selbst erlegen', title: 'Bossjäger', lantern: { name: 'Violett', color: 0xb07cff } },
  { id: 'heiler', name: 'Feldsanitäter', how: '4000 Leben in einer Partie heilen', title: 'Feldsanitäter', lantern: { name: 'Heilgrün', color: 0x5effa0 } },
  { id: 'mvp', name: 'Bester Spieler', how: 'MVP einer Partie werden', title: 'MVP', lantern: { name: 'Türkis', color: 0x4fe0e0 } },
  { id: 'pvp', name: 'Arenachampion', how: 'eine PvP-Partie gewinnen', title: 'Arenachampion', lantern: { name: 'Eisblau', color: 0x8fd0ff } },
];

/** Standardfarbe der Laterne (warmes Licht). */
export const DEFAULT_LANTERN = 0xffb866;

export interface UnlockState {
  /** Erreichte Erfolge (Id → Datum ISO). */
  done: Record<string, string>;
  /** Gewählter Titel (Erfolgs-Id) bzw. Laterne (Erfolgs-Id), null = keiner/Standard. */
  title: string | null;
  lantern: string | null;
}

const KEY = 'winterburg.erfolge';

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadUnlocks(store = storage()): UnlockState {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? 'null');
    const done: Record<string, string> = {};
    if (v && typeof v.done === 'object' && v.done) for (const a of ACHIEVEMENTS) if (typeof v.done[a.id] === 'string') done[a.id] = v.done[a.id];
    const ok = (id: unknown, key: 'title' | 'lantern') => (typeof id === 'string' && done[id] && ACHIEVEMENTS.find((a) => a.id === id)?.[key] ? id : null);
    return { done, title: ok(v?.title, 'title'), lantern: ok(v?.lantern, 'lantern') };
  } catch {
    return { done: {}, title: null, lantern: null };
  }
}

export function saveUnlocks(s: UnlockState, store = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(s));
  } catch {
    // ohne Speicher
  }
}

export interface GameResult {
  victory: boolean;
  pvp: boolean;
  level: GameLevel;
  wave: number;
  stats: FinalHeroStats[];
  team?: TeamStats;
  /** Helden-Id des Spielers (−1 = Zuschauer). */
  heroId: number;
}

/** Welche Erfolge diese Partie bringt (unabhängig davon, ob schon erreicht). */
export function earned(r: GameResult): string[] {
  if (r.heroId < 0) return [];
  const me = r.stats.find((s) => s.heroId === r.heroId);
  const out: string[] = [];
  if (r.pvp) {
    if (r.victory) out.push('pvp');
  } else {
    if (r.wave >= 5) out.push('welle5');
    if (r.wave >= 10) out.push('welle10');
    if (r.victory) out.push('sieg');
    if (r.victory && r.level === 'albtraum') out.push('albtraum');
  }
  if (me) {
    if (me.score.bosses >= 5) out.push('bosse');
    if (me.stats.healing >= 4000) out.push('heiler');
    // MVP: an erster Stelle der Rangliste und mit mindestens einem Mitspieler
    if (r.stats.length > 1 && r.stats[0].heroId === me.heroId && me.mvp > 0) out.push('mvp');
  }
  return out;
}

/** Ergebnis eintragen; gibt die neu erreichten Erfolge zurück. */
export function recordResult(r: GameResult, store = storage(), now = new Date()): Achievement[] {
  const s = loadUnlocks(store);
  const fresh = earned(r).filter((id) => !s.done[id]);
  if (fresh.length === 0) return [];
  for (const id of fresh) s.done[id] = now.toISOString();
  saveUnlocks(s, store);
  return fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!);
}

/** Gewählter Titel als Text (oder null). */
export function chosenTitle(s: UnlockState = loadUnlocks()): string | null {
  return s.title ? (ACHIEVEMENTS.find((a) => a.id === s.title)?.title ?? null) : null;
}

/** Gewählte Laternenfarbe. */
export function chosenLantern(s: UnlockState = loadUnlocks()): number {
  return s.lantern ? (ACHIEVEMENTS.find((a) => a.id === s.lantern)?.lantern?.color ?? DEFAULT_LANTERN) : DEFAULT_LANTERN;
}

/**
 * Speedrun: Bestzeit für einen Sieg (Welle 20 geschafft), im Browser gespeichert.
 * Die Spielzeit läuft ab Spielbeginn; wer Pausen mit „Jetzt starten“ (N)
 * überspringt, ist schneller.
 */
export interface BestTime {
  /** Spielzeit in Sekunden. */
  time: number;
  /** Helden-Ids des Teams. */
  heroes: string[];
  /** Datum (ISO). */
  date: string;
}

const KEY = 'winterburg.bestzeit';

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadBestTime(store = storage()): BestTime | null {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? 'null');
    return v && typeof v.time === 'number' && Number.isFinite(v.time) && v.time > 0 ? { time: v.time, heroes: Array.isArray(v.heroes) ? v.heroes : [], date: String(v.date ?? '') } : null;
  } catch {
    return null;
  }
}

/** Sieg eintragen; gibt die bisherige Bestzeit und ob es eine neue ist zurück. */
export function recordVictory(time: number, heroes: string[], store = storage(), now = new Date()): { previous: BestTime | null; isNew: boolean } {
  const previous = loadBestTime(store);
  const isNew = !previous || time < previous.time;
  if (isNew) {
    try {
      store?.setItem(KEY, JSON.stringify({ time, heroes, date: now.toISOString() }));
    } catch {
      // ohne Speicher: nur anzeigen
    }
  }
  return { previous, isNew };
}

/** Stoppuhr-Anzeige: m:ss,z bzw. h:mm:ss,z. */
export function formatClock(seconds: number): string {
  const t = Math.max(0, seconds);
  const tenths = Math.floor((t * 10) % 10);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')},${tenths}`;
}

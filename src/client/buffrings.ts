import type { Hero } from '../sim/types';

/**
 * Buff-Ringe: Jede Art aktiver Wirkung bekommt einen farbigen,
 * sich drehenden Ring um den Helden. Gleiche Arten werden zusammengefasst,
 * höchstens MAX_RINGS Ringe.
 */
export interface BuffRing {
  key: 'damage' | 'attack' | 'speed' | 'guard' | 'heal' | 'plague';
  color: number;
  /** Team-Buff eines Bosses dabei (breiterer Ring mit Funkeln). */
  team: boolean;
  /** Schwächung (Seuche): gestrichelt, langsamer. */
  debuff: boolean;
  /** Restzeit der am längsten laufenden Wirkung (s). */
  left: number;
}

export const MAX_RINGS = 4;

const COLORS: Record<BuffRing['key'], number> = {
  damage: 0xff6a3d,
  attack: 0xffd23f,
  speed: 0x7fd8ff,
  guard: 0xdfe9ff,
  heal: 0x7bd36a,
  plague: 0x9be534,
};

/** Welche Ring-Art eine Wirkung zeigt (null: keine, z. B. Betäubung). */
function keyOf(kind: string, value: number): BuffRing['key'] | null {
  switch (kind) {
    case 'damageMult':
      return value > 1 ? 'damage' : null;
    case 'attackSpeed':
      return value > 0 ? 'attack' : null;
    case 'haste':
      return value > 0 ? 'speed' : null;
    case 'damageReduction':
    case 'shield':
    case 'thorns':
      return value > 0 ? 'guard' : null;
    case 'heal':
      return value > 0 ? 'heal' : null;
    default:
      return null;
  }
}

export function buffRings(h: Pick<Hero, 'buffs' | 'plague'>, time: number): BuffRing[] {
  const map = new Map<BuffRing['key'], BuffRing>();
  for (const b of h.buffs) {
    if (b.until <= time) continue;
    const key = keyOf(b.kind, b.value);
    if (!key) continue;
    const r = map.get(key) ?? { key, color: COLORS[key], team: false, debuff: false, left: 0 };
    r.team ||= b.source.startsWith('team-');
    r.left = Math.max(r.left, b.until - time);
    map.set(key, r);
  }
  if (h.plague && h.plague.until > time) map.set('plague', { key: 'plague', color: COLORS.plague, team: false, debuff: true, left: h.plague.until - time });
  // Team-Buffs zuerst, dann Schwächung, dann der Rest (feste Reihenfolge, damit Ringe nicht springen)
  const order: BuffRing['key'][] = ['damage', 'attack', 'speed', 'guard', 'heal', 'plague'];
  return [...map.values()].sort((a, b) => Number(b.team) - Number(a.team) || Number(b.debuff) - Number(a.debuff) || order.indexOf(a.key) - order.indexOf(b.key)).slice(0, MAX_RINGS);
}

/** Münzen für einen Goldbetrag (1 bei Kleinkram, bis 8 bei Bossen). */
export function coinCount(amount: number): number {
  return Math.max(1, Math.min(8, Math.round(Math.sqrt(Math.max(0, amount) / 4))));
}

/**
 * Lebensbalken: dünne Striche je 100 Leben, dickere je 1000.
 * Bei sehr viel Leben werden die dünnen Striche ausgedünnt (höchstens maxMinor).
 */
export function tickMarks(maxHp: number, maxMinor = 60): { at: number; major: boolean }[] {
  if (!(maxHp > 100)) return [];
  const step = 100 * Math.max(1, Math.ceil(maxHp / 100 / maxMinor));
  const out: { at: number; major: boolean }[] = [];
  for (let hp = step; hp < maxHp; hp += step) out.push({ at: hp / maxHp, major: hp % 1000 === 0 });
  return out;
}

/** Treffer, die zu einer Schadenszahl zusammengefasst werden. */
export interface PendingHit {
  sum: number;
  pos: { x: number; y: number };
  since: number;
  bonus: boolean;
  boss: boolean;
  own: boolean;
}

/**
 * Treffer je Ziel sammeln (Brand, Stiche, Durchschlag kommen sonst als
 * Zahlenregen). Gibt fertige Zahlen zurück, deren Sammelzeit window abgelaufen ist.
 */
export class HitMerger {
  private readonly pending = new Map<number, PendingHit>();
  constructor(readonly window = 0.15) {}

  add(id: number, amount: number, pos: { x: number; y: number }, now: number, flags: { bonus?: boolean; boss?: boolean; own?: boolean } = {}): void {
    const p = this.pending.get(id);
    if (p) {
      p.sum += amount;
      p.pos = pos;
      p.bonus ||= !!flags.bonus;
      return;
    }
    this.pending.set(id, { sum: amount, pos, since: now, bonus: !!flags.bonus, boss: !!flags.boss, own: !!flags.own });
  }

  /** Fertige Zahlen abholen. */
  flush(now: number): PendingHit[] {
    const out: PendingHit[] = [];
    for (const [id, p] of this.pending) {
      if (now - p.since < this.window) continue;
      this.pending.delete(id);
      if (p.sum >= 0.5) out.push(p);
    }
    return out;
  }
}

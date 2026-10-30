import type { SimContext } from './context';
import type { Hero, HeroDef, Zombie } from './types';
import { dist } from './vec';

/** Grundwerte eines Helden auf einem Level. */
export function levelStats(def: HeroDef, level: number): { maxHp: number; regen: number; damageFactor: number } {
  const n = level - 1;
  return {
    maxHp: Math.round(def.hp + def.hpPerLevel * n),
    regen: def.hpRegen + def.regenPerLevel * n,
    damageFactor: 1 + def.damagePerLevel * n,
  };
}

/** XP für einen getöteten Zombie an alle lebenden Helden in Reichweite verteilen. */
export function awardXp(ctx: SimContext, z: Zombie): void {
  const { state, data } = ctx;
  const prog = data.progression;
  const def = ctx.zombieDefs.get(z.defId);
  if (!def) return;
  const near = state.heroes.filter((h) => h.alive && dist(h.pos, z.pos) <= prog.xpShareRange);
  if (near.length === 0) return;
  const share = prog.xpShare[Math.min(near.length, prog.xpShare.length) - 1];
  const amount = def.xp * (1 + prog.xpWaveScale * (state.wave.number - 1)) * share;
  for (const h of near) addXp(ctx, h, amount);
}

export function addXp(ctx: SimContext, h: Hero, amount: number): void {
  const prog = ctx.data.progression;
  ctx.state.events.push({ type: 'xp', heroId: h.id, amount });
  h.xp += amount;
  while (h.level < prog.maxLevel && h.xp >= prog.xpToNext[h.level - 1]) {
    h.xp -= prog.xpToNext[h.level - 1];
    levelUp(ctx, h);
  }
  if (h.level >= prog.maxLevel) h.xp = 0;
}

/** Ein Level aufsteigen: Werte wachsen, ein Skillpunkt kommt dazu. */
export function levelUp(ctx: SimContext, h: Hero): void {
  const def = ctx.heroDefs.get(h.defId)!;
  const before = levelStats(def, h.level).maxHp;
  h.level++;
  h.skillPoints++;
  const after = levelStats(def, h.level).maxHp;
  h.maxHp = after;
  if (h.alive) h.hp += after - before;
  ctx.state.events.push({ type: 'levelUp', heroId: h.id, level: h.level });
}

/** Darf der Held einen Skillpunkt in diese Fähigkeit stecken (Regeln wie in LoL)? */
export function canRankUp(ctx: SimContext, h: Hero, slot: number): boolean {
  const prog = ctx.data.progression;
  if (h.skillPoints <= 0 || slot < 0 || slot > 3) return false;
  const rank = h.ranks[slot];
  if (slot === 3) return rank < prog.ultMaxRank && h.level >= prog.ultLevels[rank];
  return rank < prog.basicMaxRank && rank < Math.ceil(h.level / 2);
}

export function rankUp(ctx: SimContext, h: Hero, slot: number): boolean {
  if (!canRankUp(ctx, h, slot)) return false;
  h.ranks[slot]++;
  h.skillPoints--;
  return true;
}

/** Schaden eines Helden: Grundwert × Level-Wachstum × Buffs (z. B. Amok). */
export function heroDamage(ctx: SimContext, h: Hero, base: number): number {
  const def = ctx.heroDefs.get(h.defId)!;
  let mult = 1;
  for (const b of h.buffs) if (b.kind === 'damageMult') mult *= b.value;
  return base * levelStats(def, h.level).damageFactor * mult;
}

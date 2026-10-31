import type { DataContext, SimContext } from './context';
import { levelStats } from './progression';
import type { Hero, ItemDef, ItemStats } from './types';

const ZERO: Required<ItemStats> = {
  damage: 0,
  attackSpeed: 0,
  range: 0,
  damageReduction: 0,
  moveSpeed: 0,
  regen: 0,
  hp: 0,
  cooldownReduction: 0,
};

export function itemDef(ctx: DataContext, id: string): ItemDef | undefined {
  return ctx.data.items.find((i) => i.id === id);
}

/** Wirkt eine Waffe voll? Nahkampfwaffen bei Nahkämpfern, Fernkampfwaffen bei Fernkämpfern; sonst halb. */
export function itemFactor(ctx: SimContext, h: Hero, item: ItemDef): number {
  const type = ctx.heroDefs.get(h.defId)!.attack.type;
  if (item.category === 'meleeWeapon') return type === 'melee' ? 1 : 0.5;
  if (item.category === 'rangedWeapon') return type === 'ranged' ? 1 : 0.5;
  return 1;
}

/** Summe der Werte aller Items im Inventar. */
export function itemStats(ctx: SimContext, h: Hero): Required<ItemStats> {
  if (!h.inventory) return ZERO;
  const sum = { ...ZERO };
  for (const id of h.inventory) {
    if (!id) continue;
    const item = itemDef(ctx, id);
    if (!item?.stats) continue;
    const f = itemFactor(ctx, h, item);
    for (const [k, v] of Object.entries(item.stats) as [keyof ItemStats, number][]) sum[k] += v * f;
  }
  return sum;
}

/** Maximales Leben aus Level und Items. Beim Wechsel wächst bzw. sinkt das aktuelle Leben mit. */
export function refreshMaxHp(ctx: SimContext, h: Hero): void {
  const def = ctx.heroDefs.get(h.defId)!;
  const max = levelStats(def, h.level).maxHp + itemStats(ctx, h).hp;
  const delta = max - h.maxHp;
  h.maxHp = max;
  if (h.alive) h.hp = Math.max(1, Math.min(max, h.hp + Math.max(0, delta)));
}

/**
 * Kauf eines Rezept-Items: Welche Inventarplätze werden verbraucht und was
 * kostet der Rest? Fehlt ein Bauteil, zählen dessen eigene Bauteile (rekursiv).
 */
export function buildPlan(ctx: DataContext, h: Hero, itemId: string): { cost: number; consumed: number[] } {
  const taken = new Set<number>();
  const owned = (id: string): number => {
    let value = 0;
    for (const c of itemDef(ctx, id)?.from ?? []) {
      const slot = h.inventory.findIndex((s, i) => s === c && !taken.has(i));
      if (slot >= 0) {
        taken.add(slot);
        value += itemDef(ctx, c)?.price ?? 0;
      } else value += owned(c);
    }
    return value;
  };
  const value = owned(itemId);
  return { cost: (itemDef(ctx, itemId)?.price ?? 0) - value, consumed: [...taken].sort((a, b) => a - b) };
}

/** Alle Bauteile eines Items, rekursiv (ohne das Item selbst). */
export function componentsOf(ctx: DataContext, itemId: string): string[] {
  return (itemDef(ctx, itemId)?.from ?? []).flatMap((c) => [c, ...componentsOf(ctx, c)]);
}

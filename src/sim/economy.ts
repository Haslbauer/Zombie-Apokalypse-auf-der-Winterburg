import type { DataContext, SimContext } from './context';
import { buildPlan, itemDef, refreshMaxHp } from './items';
import { statsOf } from './stats';
import { addBuff, hasBuff } from './status';
import type { Hero, Zombie, ZombieDef } from './types';
import { dist } from './vec';

/**
 * Kill-Gold nach Leistung (wie in LoL): Der letzte Treffer bekommt das volle
 * Gold, Mitkämpfer einen Anteil, wer nur danebensteht nichts. Der Postbote
 * (Team-Ziel) bringt allen Beteiligten das volle Paket-Gold.
 */
export function awardGold(ctx: SimContext, z: Zombie, killer?: Hero, assists: Hero[] = []): void {
  const def = ctx.zombieDefs.get(z.defId);
  if (def?.courier) {
    const gold = courierGold(ctx, def);
    for (const h of [killer, ...assists]) if (h) giveGold(ctx, h, gold, h.alive ? z.pos : undefined);
    // Der nächste Postbote kommt erst every Wellen später (stärker, weil die Welle höher ist)
    const every = ctx.data.waves.courier?.every ?? 3;
    ctx.state.wave.courierWave = ctx.state.wave.number + every;
    ctx.state.couriersCaught = (ctx.state.couriersCaught ?? 0) + 1;
    ctx.state.events.push({ type: 'courier', zombieId: z.id, phase: 'caught', gold });
    return;
  }
  if (!def || def.gold <= 0) return;
  if (killer) giveGold(ctx, killer, def.gold, z.pos);
  const share = Math.round(def.gold * ctx.data.economy.rewards.assistGold);
  if (share > 0) for (const h of assists) giveGold(ctx, h, share, z.pos);
}

/** Gold, das jeder Held für den Postboten (Sidequest) bekommt. */
export function courierGold(ctx: SimContext, def: ZombieDef): number {
  const c = def.courier!;
  return c.gold + c.goldPerWave * ctx.state.wave.number;
}

/** Bonus für eine überstandene Welle, nur an Helden, die in dieser Welle mitgekämpft haben. */
export function awardWaveBonus(ctx: SimContext, wave: number): void {
  const eco = ctx.data.economy;
  for (const h of ctx.state.heroes) if (h.activeWave === wave) giveGold(ctx, h, eco.waveBonusBase + eco.waveBonusPerWave * wave);
}

/**
 * Boss erlegt (wie in LoL): Der Held mit dem letzten Treffer bekommt das
 * Boss-Gold, alle anderen, die in den letzten Sekunden Schaden gemacht haben,
 * einen Anteil (Assist). Der erste Boss der Partie bringt „Erstes Blut“.
 * Das normale Kill-Gold (awardGold) kommt zusätzlich.
 */
export function awardBoss(ctx: SimContext, z: Zombie, killer: Hero | undefined): void {
  const { state } = ctx;
  const cfg = ctx.data.economy.boss;
  const base = cfg.gold + cfg.goldPerWave * Math.max(1, state.wave.number);
  const firstBlood = !state.firstBlood && !!killer;
  if (firstBlood) state.firstBlood = true;
  const gold = killer ? base + (firstBlood ? cfg.firstBlood : 0) : 0;
  const assistGold = Math.round(base * cfg.assistShare);
  const assists: number[] = [];
  for (const c of z.contrib ?? []) {
    if (c.id === killer?.id || state.time - c.t > cfg.assistWindow) continue;
    const h = state.heroes.find((x) => x.id === c.id);
    if (!h) continue;
    assists.push(h.id);
    h.score.assists++;
    giveGold(ctx, h, assistGold, h.alive ? z.pos : undefined);
  }
  if (killer) {
    killer.score.bosses++;
    giveGold(ctx, killer, gold, z.pos);
  }
  state.events.push({ type: 'bossKill', zombieId: z.id, defId: z.defId, killerId: killer?.id ?? null, assists, gold, assistGold, firstBlood });
}

function giveGold(ctx: SimContext, h: Hero, amount: number, pos?: { x: number; y: number }): void {
  h.gold += amount;
  h.score.gold += amount;
  ctx.state.events.push({ type: 'gold', heroId: h.id, amount, pos: pos ? { ...pos } : undefined });
}

/** Einkaufen nur in der Pause und nur im Innenhof (Umkreis um das Herz). Gibt den Grund zurück, wenn nicht. */
export function shopClosedReason(ctx: DataContext, h: Hero): string | null {
  if (!h.alive) return 'Gefallene Helden können nicht einkaufen';
  if (ctx.state.wave.phase !== 'pause') return 'Der Shop hat nur in der Pause geöffnet';
  const heart = ctx.state.objectives.find((o) => o.id === 'heart');
  if (heart && dist(h.pos, heart.pos) > ctx.data.economy.shopRange) return 'Einkaufen nur im Innenhof beim Herz';
  return null;
}

function deny(ctx: SimContext, h: Hero, reason: string): false {
  ctx.state.events.push({ type: 'shopDenied', heroId: h.id, reason });
  return false;
}

export function buy(ctx: SimContext, h: Hero, itemId: string): boolean {
  const item = itemDef(ctx, itemId);
  if (!item) return deny(ctx, h, 'Unbekanntes Item');
  const closed = shopClosedReason(ctx, h);
  if (closed) return deny(ctx, h, closed);
  // Rezepte: vorhandene Bauteile werden verbraucht und angerechnet
  const plan = item.category === 'consumable' ? { cost: item.price, consumed: [] } : buildPlan(ctx, h, itemId);
  if (h.gold < plan.cost) return deny(ctx, h, 'Nicht genug Gold');

  if (item.category === 'consumable') {
    const max = item.maxStack ?? 1;
    const stack = h.consumables.find((c) => c?.itemId === itemId && c.count < max);
    if (stack) stack.count++;
    else {
      const free = h.consumables.findIndex((c) => c === null);
      if (free < 0) return deny(ctx, h, 'Keine freie Item-Taste (R/T)');
      h.consumables[free] = { itemId, count: 1 };
    }
  } else {
    const free = plan.consumed.length > 0 ? plan.consumed[0] : h.inventory.findIndex((s) => s === null);
    if (free < 0) return deny(ctx, h, 'Inventar ist voll');
    for (const slot of plan.consumed) h.inventory[slot] = null;
    h.inventory[free] = itemId;
    refreshMaxHp(ctx, h);
  }
  h.gold -= plan.cost;
  statsOf(h).goldSpent += plan.cost;
  ctx.state.events.push({ type: 'shop', heroId: h.id, action: 'buy', itemId });
  return true;
}

/** Verkaufen bringt sellFactor des Preises zurück (Verbrauchsgüter einzeln). */
export function sell(ctx: SimContext, h: Hero, slot: number, consumable = false): boolean {
  const closed = shopClosedReason(ctx, h);
  if (closed) return deny(ctx, h, closed);
  let itemId: string | null = null;
  if (consumable) {
    const c = h.consumables[slot];
    if (!c) return false;
    itemId = c.itemId;
    c.count--;
    if (c.count <= 0) h.consumables[slot] = null;
  } else {
    itemId = h.inventory[slot] ?? null;
    if (!itemId) return false;
    h.inventory[slot] = null;
    refreshMaxHp(ctx, h);
  }
  const item = itemDef(ctx, itemId)!;
  h.gold += Math.floor(item.price * ctx.data.economy.sellFactor);
  ctx.state.events.push({ type: 'shop', heroId: h.id, action: 'sell', itemId });
  return true;
}

/** Verbrauchsgut auf R (0) oder T (1) benutzen – jederzeit, außer betäubt. */
export function useConsumable(ctx: SimContext, h: Hero, slot: number): boolean {
  const c = h.consumables[slot];
  if (!c || !h.alive || hasBuff(h, 'stunned')) return false;
  const item = itemDef(ctx, c.itemId);
  if (!item?.use) return false;
  const u = item.use;
  if (u.heal) addBuff(ctx, h, 'heal', u.heal / u.duration, u.duration, item.id);
  if (u.haste) addBuff(ctx, h, 'haste', u.haste, u.duration, item.id);
  if (u.attackSpeed) addBuff(ctx, h, 'attackSpeed', u.attackSpeed, u.duration, item.id);
  c.count--;
  if (c.count <= 0) h.consumables[slot] = null;
  ctx.state.events.push({ type: 'shop', heroId: h.id, action: 'use', itemId: item.id });
  return true;
}

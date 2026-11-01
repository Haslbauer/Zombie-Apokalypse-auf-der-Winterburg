import { applyDamage } from './combat';
import type { SimContext } from './context';
import { distanceToObstacle } from './grid';
import { slow } from './status';
import { DT, type Defense, type DefenseKind, type Hero, type Obstacle, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

/**
 * Verteidigungen für die Pause (gegen Durchbrüche zu Vorrat und Bienenstock):
 *  - Stacheldraht: verlangsamt und macht Schaden, nutzt sich ab
 *  - Bretterbarrikade: blockiert den Weg (Hindernis im Wegenetz), Zombies schlagen sie kaputt
 *  - Feuerfass: setzt Zombies in der Nähe in Brand, brennt langsam herunter
 * Gekauft und aufgestellt wird nur in der Pause; die Höchstzahl gilt fürs ganze Team.
 */
const TICK = 0.5;

export function defenseDef(ctx: SimContext, kind: DefenseKind) {
  return ctx.data.economy.defenses?.[kind];
}

/** Rechteck einer Barrikade (quer oder längs). */
export function barricadeRect(ctx: SimContext, d: Pick<Defense, 'pos' | 'rot'>): Obstacle {
  const def = defenseDef(ctx, 'barrikade')!;
  const w = d.rot ? def.h! : def.w!;
  const h = d.rot ? def.w! : def.h!;
  return { kind: 'rect', x: d.pos.x, y: d.pos.y, w, h, look: 'blocked', blocksShots: false };
}

/** Warum hier nicht gebaut werden kann (null = geht). */
export function buildReason(ctx: SimContext, h: Hero, kind: DefenseKind, pos: Vec2, rot: number): string | null {
  const all = ctx.data.economy.defenses;
  const def = all?.[kind];
  if (!def || !all) return 'Unbekannte Verteidigung';
  if (ctx.state.pvp) return 'Im PvP gibt es keine Verteidigungen';
  if (!h.alive) return 'Gefallene können nicht bauen';
  if (ctx.state.wave.phase !== 'pause') return 'Bauen geht nur in der Pause';
  if (h.gold < def.cost) return `Nicht genug Gold (${def.cost})`;
  const list = ctx.state.defenses ?? [];
  if (list.filter((d) => d.kind === kind).length >= def.max) return `Höchstens ${def.max} × ${def.name}`;
  const { width, height, minX = 0, minY = 0 } = ctx.data.arena;
  if (pos.x < minX + 1 || pos.y < minY + 1 || pos.x > width - 1 || pos.y > height - 1) return 'Außerhalb der Karte';
  if (ctx.grid.isBlocked(pos)) return 'Hier ist kein Platz';
  if (list.some((d) => dist(d.pos, pos) < all.minSpacing + (d.kind === 'barrikade' || kind === 'barrikade' ? 1 : 0))) return 'Zu nah an einer anderen Verteidigung';
  if (kind === 'barrikade') {
    const r = barricadeRect(ctx, { pos, rot });
    // Stichproben entlang der Barrikade: alles frei?
    const half = (rot ? def.w! : def.w!) / 2;
    for (let k = -1; k <= 1; k += 0.5) {
      const p = rot ? { x: pos.x, y: pos.y + k * half } : { x: pos.x + k * half, y: pos.y };
      if (ctx.grid.isBlocked(p)) return 'Hier ist kein Platz';
    }
    if (ctx.state.heroes.some((x) => x.alive && distanceToObstacle(x.pos, r) < x.radius)) return 'Ein Held steht im Weg';
  }
  if (ctx.state.objectives.some((o) => dist(o.pos, pos) < (o.radius || Math.max(o.w ?? 1, o.h ?? 1) / 2) + 0.6)) return 'Zu nah an einem Ziel';
  return null;
}

/** Bauen: Gold abziehen, Verteidigung aufstellen; Barrikaden werden Hindernis. */
export function build(ctx: SimContext, h: Hero, kind: DefenseKind, pos: Vec2, rot: number): boolean {
  const reason = buildReason(ctx, h, kind, pos, rot);
  if (reason) {
    ctx.state.events.push({ type: 'defense', action: 'denied', heroId: h.id, reason });
    return false;
  }
  const def = defenseDef(ctx, kind)!;
  h.gold -= def.cost;
  const d: Defense = { id: ctx.state.nextId++, kind, pos: { ...pos }, rot: rot ? 1 : 0, hp: def.hp, maxHp: def.hp, ownerId: h.id, tickTimer: 0 };
  (ctx.state.defenses ??= []).push(d);
  if (kind === 'barrikade') ctx.rebuildCollision?.();
  ctx.state.events.push({ type: 'defense', action: 'built', kind, pos: { ...pos }, heroId: h.id, gold: def.cost });
  return true;
}

/** Reparaturkosten aller beschädigten Verteidigungen (Gold). */
export function repairCost(ctx: Pick<SimContext, 'state' | 'data'>): number {
  const all = ctx.data.economy.defenses;
  if (!all) return 0;
  let cost = 0;
  for (const d of ctx.state.defenses ?? []) cost += ((d.maxHp - d.hp) / d.maxHp) * all[d.kind].cost * all.repairFactor;
  return Math.ceil(cost);
}

/** Alles reparieren (nur in der Pause), bezahlt der Held, der es auslöst. */
export function repair(ctx: SimContext, h: Hero): boolean {
  const cost = repairCost(ctx);
  if (cost <= 0) return false;
  if (ctx.state.wave.phase !== 'pause' || h.gold < cost) {
    ctx.state.events.push({ type: 'defense', action: 'denied', heroId: h.id, reason: ctx.state.wave.phase !== 'pause' ? 'Reparieren geht nur in der Pause' : `Nicht genug Gold (${cost})` });
    return false;
  }
  h.gold -= cost;
  for (const d of ctx.state.defenses ?? []) d.hp = d.maxHp;
  ctx.state.events.push({ type: 'defense', action: 'repaired', heroId: h.id, gold: cost });
  return true;
}

/** Schaden an einer Verteidigung (Zombies schlagen Barrikaden, Abnutzung). */
export function damageDefense(ctx: SimContext, d: Defense, amount: number): void {
  d.hp -= amount;
  if (d.hp > 0) return;
  ctx.state.defenses = (ctx.state.defenses ?? []).filter((x) => x !== d);
  ctx.state.events.push({ type: 'defense', action: 'destroyed', kind: d.kind, pos: { ...d.pos } });
  if (d.kind === 'barrikade') ctx.rebuildCollision?.();
}

/** Barrikade, die diesem Zombie im Weg steht (berührt sie), sonst null. */
export function blockingBarricade(ctx: SimContext, z: Zombie, reach: number): Defense | null {
  for (const d of ctx.state.defenses ?? []) {
    if (d.kind !== 'barrikade') continue;
    if (distanceToObstacle(z.pos, barricadeRect(ctx, d)) - z.radius <= reach) return d;
  }
  return null;
}

/** Pro Tick: Stacheldraht und Feuerfass wirken auf Zombies in ihrem Umkreis und nutzen sich ab. */
export function updateDefenses(ctx: SimContext): void {
  const { state } = ctx;
  const list = state.defenses;
  if (!list?.length) return;
  for (const d of [...list]) {
    if (d.kind === 'barrikade') continue;
    const def = defenseDef(ctx, d.kind)!;
    const r = def.radius ?? 1.5;
    const inside = state.zombies.filter((z) => z.hp > 0 && !z.neutral && dist(z.pos, d.pos) - z.radius <= r);
    if (!inside.length) continue;
    d.tickTimer -= DT;
    const tick = d.tickTimer <= 0;
    if (tick) d.tickTimer += TICK;
    const owner = state.heroes.find((h) => h.id === d.ownerId);
    for (const z of inside) {
      if (d.kind === 'stacheldraht') {
        slow(ctx, z, def.slow ?? 0.5, 0.3);
        if (tick) applyDamage(ctx, z, (def.dps ?? 10) * TICK, owner);
      } else {
        z.st.burnUntil = state.time + (def.burnTime ?? 3);
        z.st.burnDps = def.burnDps ?? 10;
        z.st.burnBy = owner?.id;
      }
    }
    damageDefense(ctx, d, (def.wear ?? 0) * inside.length * DT);
  }
}

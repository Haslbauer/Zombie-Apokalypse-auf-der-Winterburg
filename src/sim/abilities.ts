import { edgeDistance, REVEAL_TIME } from './combat';
import type { SimContext } from './context';
import { kitOf } from './heroes/index';
import { itemStats } from './items';
import { statsOf } from './stats';
import { hasBuff } from './status';
import { DT, type Hero, type RankValue, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

/** Wert einer Fähigkeit auf dem aktuellen Rang (Rang 0 zählt wie Rang 1). */
export function rankValue(v: RankValue | undefined, rank: number): number {
  if (v === undefined) return 0;
  if (typeof v === 'number') return v;
  return v[Math.max(0, Math.min(v.length - 1, rank - 1))];
}

/** Wert `key` der Fähigkeit in `slot` auf dem aktuellen Rang des Helden. */
export function val(ctx: SimContext, h: Hero, slot: number, key: string): number {
  const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
  return rankValue(ability.values[key], h.ranks[slot]);
}

export function abilityDef(ctx: SimContext, h: Hero, slot: number) {
  return ctx.heroDefs.get(h.defId)!.abilities[slot];
}

/** Fähigkeit auslösen, wenn gelernt, bereit und der Held handlungsfähig ist. */
export function tryCast(ctx: SimContext, h: Hero, slot: number, aim: Vec2): boolean {
  if (!h.alive || h.dash || h.channel || slot < 0 || slot > 3 || hasBuff(h, 'stunned')) return false;
  if (h.ranks[slot] <= 0 || h.cooldowns[slot] > 0) return false;
  const ability = abilityDef(ctx, h, slot);
  // Zielpunkt auf die Reichweite begrenzen.
  const d = dist(h.pos, aim);
  const target =
    d > ability.range && d > 0
      ? { x: h.pos.x + ((aim.x - h.pos.x) / d) * ability.range, y: h.pos.y + ((aim.y - h.pos.y) / d) * ability.range }
      : { ...aim };
  if (d > 1e-6) h.facing = Math.atan2(aim.y - h.pos.y, aim.x - h.pos.x);
  if (!kitOf(h.defId).cast(ctx, h, slot, target, aim)) return false;
  h.cooldowns[slot] = rankValue(ability.cooldown, h.ranks[slot]) * (1 - Math.min(0.5, itemStats(ctx, h).cooldownReduction));
  ctx.state.events.push({ type: 'cast', heroId: h.id, slot, pos: target });
  statsOf(h).casts++;
  h.revealedUntil = ctx.state.time + REVEAL_TIME;
  return true;
}

/**
 * Sprung bzw. Antritt starten. Das Ziel wird entlang der Strecke vor dem
 * ersten Hindernis gekürzt.
 */
export function startDash(
  ctx: SimContext,
  h: Hero,
  to: Vec2,
  speed: number,
  height: number,
  tag: string,
  targetId?: number,
): void {
  const from = { ...h.pos };
  const total = dist(from, to);
  let reach = 0;
  for (let t = 0.25; t <= total; t += 0.25) {
    const p = { x: from.x + ((to.x - from.x) * t) / total, y: from.y + ((to.y - from.y) * t) / total };
    if (ctx.grid.isBlocked(p)) break;
    reach = t;
  }
  const end = total > 0 ? { x: from.x + ((to.x - from.x) * reach) / total, y: from.y + ((to.y - from.y) * reach) / total } : from;
  h.dash = { from, to: end, elapsed: 0, duration: Math.max(DT, reach / speed), height, tag, targetId };
}

/** Sprung weiterführen; bei der Landung das Heldenmodul informieren. */
export function updateDash(ctx: SimContext, h: Hero): void {
  const d = h.dash!;
  d.elapsed = Math.min(d.duration, d.elapsed + DT);
  const t = d.elapsed / d.duration;
  h.pos = { x: d.from.x + (d.to.x - d.from.x) * t, y: d.from.y + (d.to.y - d.from.y) * t };
  if (t < 1) return;
  h.dash = null;
  ctx.state.events.push({ type: 'land', heroId: h.id, pos: { ...h.pos }, tag: d.tag });
  kitOf(h.defId).onDashEnd?.(ctx, h, d);
}

/** Lebende Zombies, deren Rand im Kreis um p liegt. */
export function zombiesInCircle(ctx: SimContext, p: Vec2, r: number): Zombie[] {
  return ctx.state.zombies.filter((z) => z.hp > 0 && dist(z.pos, p) - z.radius <= r);
}

/** Zombie in Reichweite des Helden, der dem Zielpunkt am nächsten ist (Zielfähigkeiten). */
export function zombieNearAim(ctx: SimContext, h: Hero, aim: Vec2, range: number, prefer?: (z: Zombie) => boolean): Zombie | null {
  let best: Zombie | null = null;
  let bestScore = Infinity;
  for (const z of ctx.state.zombies) {
    if (z.hp <= 0 || edgeDistance(h, z) > range) continue;
    const score = dist(z.pos, aim) - (prefer?.(z) ? 3 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best;
}

/** Zombies im Kegel vor dem Helden. */
export function zombiesInCone(ctx: SimContext, h: Hero, facing: number, arcDeg: number, range: number): Zombie[] {
  const arc = (arcDeg * Math.PI) / 180;
  return ctx.state.zombies.filter((z) => {
    if (z.hp <= 0 || edgeDistance(h, z) > range) return false;
    const d = dist(h.pos, z.pos);
    if (d <= h.radius + z.radius) return true;
    let diff = Math.atan2(z.pos.y - h.pos.y, z.pos.x - h.pos.x) - facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return Math.abs(diff) <= arc / 2 + Math.asin(Math.min(1, z.radius / d));
  });
}

/** Zombies, deren Kreis die Strecke a→b (mit halber Breite w) berührt. */
export function zombiesOnLine(ctx: SimContext, a: Vec2, b: Vec2, w: number): Zombie[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  return ctx.state.zombies.filter((z) => {
    if (z.hp <= 0) return false;
    const t = Math.max(0, Math.min(1, ((z.pos.x - a.x) * dx + (z.pos.y - a.y) * dy) / len2));
    return Math.hypot(a.x + dx * t - z.pos.x, a.y + dy * t - z.pos.y) <= w + z.radius;
  });
}

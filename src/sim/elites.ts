import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { resolveObstacles } from './grid';
import { face } from './movement';
import { heroCC, isBlind } from './status';
import { DT, type Hero, type Zombie, type ZombieDef } from './types';
import { spawnZombieAt } from './waves';

/**
 * Spezialfähigkeiten der Elites. Gibt true zurück, solange die Fähigkeit den
 * Zombie beschäftigt (dann entfällt die normale KI in diesem Tick).
 */
export function updateElite(ctx: SimContext, z: Zombie, def: ZombieDef, heroes: Hero[]): boolean {
  const sp = def.special;
  if (!sp) return false;
  z.specialTimer = (z.specialTimer ?? sp.interval / 2) - DT;

  if (sp.kind === 'summon') {
    if (z.specialTimer > 0) return false;
    z.specialTimer = sp.interval;
    const count = sp.count as number;
    const type = ctx.zombieDefs.get(sp.summon as string);
    if (!type) return false;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const pos = { x: z.pos.x + Math.cos(a) * (z.radius + 0.6), y: z.pos.y + Math.sin(a) * (z.radius + 0.6) };
      resolveObstacles(pos, type.radius, ctx.arena);
      spawnZombieAt(ctx, type, pos);
    }
    ctx.state.events.push({ type: 'effect', kind: 'summon', pos: { ...z.pos }, radius: 2, heroId: undefined });
    return false;
  }

  // Anlauf (Schlächter): kurz ausholen, dann geradeaus stürmen.
  if (z.charge) {
    const c = z.charge;
    if (c.windup > 0) {
      c.windup -= DT;
      return true;
    }
    const step = Math.min((sp.speed as number) * DT, c.remaining);
    const next = { x: z.pos.x + c.dir.x * step, y: z.pos.y + c.dir.y * step };
    if (ctx.grid.isBlocked(next)) {
      z.charge = null;
      return true;
    }
    z.pos = next;
    c.remaining -= step;
    for (const h of heroes) {
      if (c.hitIds.includes(h.id) || edgeDistance(z, h) > 0.2) continue;
      c.hitIds.push(h.id);
      applyDamage(ctx, h, sp.damage as number);
      heroCC(ctx, h, 'stunned', sp.stun as number, { from: z.pos, distance: sp.knockback as number });
    }
    if (c.remaining <= 0) z.charge = null;
    return true;
  }

  if (z.specialTimer > 0 || isBlind(ctx, z)) return false;
  const range = sp.range as number;
  const target = heroes.find((h) => edgeDistance(z, h) <= range && edgeDistance(z, h) > 1 && ctx.grid.lineOfSight(z.pos, h.pos));
  if (!target) return false;
  z.specialTimer = sp.interval;
  const dx = target.pos.x - z.pos.x;
  const dy = target.pos.y - z.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / d, y: dy / d };
  const distance = sp.distance as number;
  face(z, target.pos);
  z.charge = { dir, remaining: distance, hitIds: [], windup: sp.windup as number };
  ctx.state.events.push({
    type: 'charge',
    zombieId: z.id,
    from: { ...z.pos },
    to: { x: z.pos.x + dir.x * distance, y: z.pos.y + dir.y * distance },
  });
  return true;
}

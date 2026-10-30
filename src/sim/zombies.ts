import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { face, stepToward } from './movement';
import { DT, type Hero } from './types';
import { distSq } from './vec';

/** Bis zu diesem Abstand laufen Zombies direkt aufs Ziel zu, sonst entlang des Distanzfelds. */
const DIRECT_RANGE = 3;

/**
 * Zombie-KI für M1: jagt den nächsten lebenden Helden und greift ihn an.
 * field ist das Distanzfeld zu allen lebenden Helden.
 */
export function updateZombies(ctx: SimContext, field: Float32Array | null): void {
  const { state, grid, zombieDefs } = ctx;
  const heroes = state.heroes.filter((h) => h.alive);

  for (const z of state.zombies) {
    if (z.hp <= 0) continue;
    z.attackTimer = Math.max(0, z.attackTimer - DT);

    let target: Hero | null = null;
    let bestSq = Infinity;
    for (const h of heroes) {
      const d = distSq(z.pos, h.pos);
      if (d < bestSq) {
        bestSq = d;
        target = h;
      }
    }
    z.targetId = target?.id ?? null;
    if (!target) continue;

    const def = zombieDefs.get(z.defId)!;
    if (edgeDistance(z, target) <= def.attackRange) {
      face(z, target.pos);
      if (z.attackTimer <= 0) {
        z.attackTimer = def.attackCooldown;
        state.events.push({ type: 'attack', id: z.id, targetId: target.id });
        applyDamage(ctx, target, z.damage);
      }
      continue;
    }

    const step = z.speed * DT;
    if (bestSq < DIRECT_RANGE * DIRECT_RANGE || !field || grid.lineOfSight(z.pos, target.pos)) {
      stepToward(z, target.pos, step);
    } else {
      const next = grid.downhill(field, z.pos);
      stepToward(z, next ?? target.pos, step);
    }
  }
}

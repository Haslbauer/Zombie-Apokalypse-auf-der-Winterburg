import { edgeDistance, heroAttack } from './combat';
import type { SimContext } from './context';
import { followPath, stepToward } from './movement';
import { DT, type Hero, type Zombie } from './types';

/** Beim Attack-Move greift der Held Zombies in diesem Umkreis (zusätzlich zur Reichweite) an. */
const ACQUIRE_BONUS = 4;
/** Beim Verfolgen ohne Sichtlinie wird der Pfad alle so viele Ticks neu berechnet. */
const REPATH_TICKS = 10;

export function updateHero(ctx: SimContext, h: Hero): void {
  if (!h.alive) return;
  const def = ctx.heroDefs.get(h.defId)!;
  h.attackTimer = Math.max(0, h.attackTimer - DT);
  h.hp = Math.min(h.maxHp, h.hp + def.hpRegen * DT);
  const range = def.attack.range;
  const order = h.order;

  switch (order.type) {
    case 'idle': {
      // Wie in LoL: Ein stehender Held greift Zombies in Reichweite von selbst an.
      const z = nearestZombie(ctx, h, range);
      if (z && h.attackTimer <= 0) heroAttack(ctx, h, z);
      break;
    }
    case 'move':
      if (followPath(h, h.speed * DT)) h.order = { type: 'idle' };
      break;
    case 'attack': {
      const z = ctx.state.zombies.find((x) => x.id === order.targetId && x.hp > 0);
      if (!z) h.order = { type: 'idle' };
      else engage(ctx, h, z, range);
      break;
    }
    case 'attackMove': {
      const z = nearestZombie(ctx, h, range + ACQUIRE_BONUS);
      if (z) {
        engage(ctx, h, z, range);
        h.path = [];
      } else {
        if (h.path.length === 0) h.path = ctx.grid.findPath(h.pos, order.target);
        if (followPath(h, h.speed * DT)) h.order = { type: 'idle' };
      }
      break;
    }
  }
}

/** Auf das Ziel zulaufen, bis es in Reichweite ist, dann angreifen. */
function engage(ctx: SimContext, h: Hero, z: Zombie, range: number): void {
  if (edgeDistance(h, z) <= range) {
    h.path = [];
    if (h.attackTimer <= 0) heroAttack(ctx, h, z);
    return;
  }
  const step = h.speed * DT;
  if (ctx.grid.lineOfSight(h.pos, z.pos)) {
    h.path = [];
    stepToward(h, z.pos, step);
  } else {
    if (h.path.length === 0 || ctx.state.tick >= h.repathAt) {
      h.path = ctx.grid.findPath(h.pos, z.pos);
      h.repathAt = ctx.state.tick + REPATH_TICKS;
    }
    followPath(h, step);
  }
}

function nearestZombie(ctx: SimContext, h: Hero, maxEdgeDistance: number): Zombie | null {
  let best: Zombie | null = null;
  let bestD = maxEdgeDistance;
  for (const z of ctx.state.zombies) {
    if (z.hp <= 0) continue;
    const d = edgeDistance(h, z);
    if (d <= bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

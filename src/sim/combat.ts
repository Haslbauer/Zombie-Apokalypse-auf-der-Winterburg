import type { SimContext } from './context';
import { face } from './movement';
import { DT, type Hero, type Zombie } from './types';
import { dist } from './vec';

/** Abstand von Rand zu Rand zweier runder Einheiten. */
export function edgeDistance(a: { pos: { x: number; y: number }; radius: number }, b: typeof a): number {
  return dist(a.pos, b.pos) - a.radius - b.radius;
}

/** Zieht Leben ab. Gibt true zurück, wenn das Ziel dadurch gestorben ist. */
export function applyDamage(ctx: SimContext, target: Hero | Zombie, amount: number): boolean {
  if (target.hp <= 0 || amount <= 0) return false;
  const dealt = Math.min(amount, target.hp);
  target.hp -= dealt;
  const { state } = ctx;
  state.events.push({ type: 'hit', targetId: target.id, amount: dealt, pos: { ...target.pos } });
  if (target.hp > 0) return false;

  target.hp = 0;
  state.events.push({ type: 'death', id: target.id, pos: { ...target.pos } });
  if ('alive' in target) {
    target.alive = false;
    target.path = [];
    target.order = { type: 'idle' };
    if (!state.gameOver && state.heroes.every((h) => !h.alive)) {
      state.gameOver = true;
      state.events.push({ type: 'gameOver', wave: state.wave.number });
    }
  } else {
    state.kills++;
  }
  return true;
}

/** Standardangriff eines Helden: Nahkampf trifft sofort, Fernkampf schießt ein Projektil. */
export function heroAttack(ctx: SimContext, h: Hero, z: Zombie): void {
  const attack = ctx.heroDefs.get(h.defId)!.attack;
  face(h, z.pos);
  h.attackTimer = attack.cooldown;
  ctx.state.events.push({ type: 'attack', id: h.id, targetId: z.id });
  if (attack.type === 'melee') {
    applyDamage(ctx, z, attack.damage);
  } else {
    ctx.state.projectiles.push({
      id: ctx.state.nextId++,
      ownerId: h.id,
      targetId: z.id,
      pos: { x: h.pos.x + Math.cos(h.facing) * h.radius, y: h.pos.y + Math.sin(h.facing) * h.radius },
      speed: attack.projectileSpeed!,
      damage: attack.damage,
    });
  }
}

/** Projektile verfolgen ihr Ziel (wie Auto-Attacks in LoL) und treffen immer. */
export function updateProjectiles(ctx: SimContext): void {
  const { state } = ctx;
  state.projectiles = state.projectiles.filter((p) => {
    const target = state.zombies.find((z) => z.id === p.targetId && z.hp > 0);
    if (!target) return false;
    const dx = target.pos.x - p.pos.x;
    const dy = target.pos.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * DT;
    if (d <= step + target.radius) {
      applyDamage(ctx, target, p.damage);
      return false;
    }
    p.pos.x += (dx / d) * step;
    p.pos.y += (dy / d) * step;
    return true;
  });
}

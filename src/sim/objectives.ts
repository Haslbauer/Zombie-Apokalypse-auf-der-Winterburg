import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { DT, type Hero, type Objective, type Zombie } from './types';

export function objectiveDef(ctx: SimContext, id: string) {
  return ctx.data.arena.objectives.find((o) => o.id === id)!;
}

/** Schaden an einem Ziel. Fällt ein Ziel mit loseOnDestroy, ist das Spiel verloren. */
export function damageObjective(ctx: SimContext, obj: Objective, amount: number): void {
  if (obj.destroyed || amount <= 0) return;
  const { state } = ctx;
  const def = objectiveDef(ctx, obj.id);
  const dealt = Math.min(amount, obj.hp);
  obj.hp -= dealt;
  state.events.push({ type: 'objectiveHit', objectiveId: obj.id, amount: dealt });

  // Bienen werden wütend, sobald ihr Stock Schaden nimmt.
  if (def.bees) {
    if (state.time >= obj.aggroUntil) state.events.push({ type: 'beesAngry', objectiveId: obj.id });
    obj.aggroUntil = state.time + def.bees.aggroDuration;
  }

  if (obj.hp > 0) return;
  obj.hp = 0;
  obj.destroyed = true;
  state.events.push({ type: 'objectiveDestroyed', objectiveId: obj.id });
  if (def.loseOnDestroy && !state.gameOver) {
    state.gameOver = true;
    state.events.push({ type: 'gameOver', wave: state.wave.number, reason: `${def.name} ist gefallen` });
  }
}

/** Regeneration der Ziele und Stiche der Bienen. */
export function updateObjectives(ctx: SimContext): void {
  const { state } = ctx;
  for (const obj of state.objectives) {
    if (obj.destroyed) continue;
    const def = objectiveDef(ctx, obj.id);
    const regen = state.wave.phase === 'pause' ? def.pauseRegen : def.regen;
    obj.hp = Math.min(obj.maxHp, obj.hp + regen * DT);

    if (!def.bees) continue;
    obj.stingTimer -= DT;
    if (obj.stingTimer > 0) continue;
    obj.stingTimer += def.bees.interval;

    const range = def.bees.range;
    const inRange = (u: Hero | Zombie) => edgeDistance(u, obj) <= range;
    if (state.time < obj.aggroUntil) {
      // Wütend: Die Bienen stechen alle in der Nähe, auch Helden.
      const targets: (Hero | Zombie)[] = [
        ...state.zombies.filter((z) => z.hp > 0 && inRange(z)),
        ...state.heroes.filter((h) => h.alive && inRange(h)),
      ];
      for (const t of targets) sting(ctx, obj, t, def.bees.damage);
    } else {
      // Ruhig: Ein Stich auf den nächsten Zombie.
      let best: Zombie | null = null;
      let bestD = range;
      for (const z of state.zombies) {
        if (z.hp <= 0) continue;
        const d = edgeDistance(z, obj);
        if (d <= bestD) {
          bestD = d;
          best = z;
        }
      }
      if (best) sting(ctx, obj, best, def.bees.damage);
    }
  }
}

function sting(ctx: SimContext, obj: Objective, target: Hero | Zombie, damage: number): void {
  ctx.state.events.push({ type: 'sting', objectiveId: obj.id, targetId: target.id });
  applyDamage(ctx, target, damage);
}

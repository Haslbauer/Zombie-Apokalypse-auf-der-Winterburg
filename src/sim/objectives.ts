import { applyDamage } from './combat';
import type { SimContext } from './context';
import { distanceToObstacle } from './grid';
import { DT, type Hero, type Objective, type ObjectiveDef, type Obstacle, type Zombie } from './types';

/** Form eines Ziels als Hindernis (Kreis oder Rechteck). */
export function objectiveShape(o: Pick<ObjectiveDef, 'x' | 'y' | 'radius' | 'w' | 'h'>): Obstacle {
  return o.w !== undefined && o.h !== undefined
    ? { kind: 'rect', x: o.x, y: o.y, w: o.w, h: o.h, look: 'objective' }
    : { kind: 'circle', x: o.x, y: o.y, r: o.radius, look: 'objective' };
}

/** Abstand vom Rand einer Einheit zum Rand eines Ziels. */
export function objDistance(u: { pos: { x: number; y: number }; radius: number }, o: Objective): number {
  return distanceToObstacle(u.pos, objectiveShape({ x: o.pos.x, y: o.pos.y, radius: o.radius, w: o.w, h: o.h })) - u.radius;
}

/** Ziele zu einem Schlüssel: Objective-Id oder Art (Gruppe, z. B. "bed"). Nur intakte. */
export function objectivesFor(ctx: SimContext, key: string): Objective[] {
  return ctx.state.objectives.filter((o) => !o.destroyed && (o.id === key || o.kind === key));
}

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
  obj.regrowIn = def.regrowWaves ?? 0;
  state.events.push({ type: 'objectiveDestroyed', objectiveId: obj.id });
  ctx.refreshObjectiveFields(obj.kind);
  if (def.loseOnDestroy && !state.gameOver) {
    state.gameOver = true;
    state.events.push({ type: 'gameOver', wave: state.wave.number, reason: def.lostText ?? `${def.name} ist gefallen` });
  }
}

/**
 * Nach einer überstandenen Welle: Intakte Hochbeete ernten (anteilig nach
 * Leben) und füllen den Lebensmittelvorrat auf; zerstörte wachsen nach,
 * solange der Bienenstock steht.
 */
export function harvest(ctx: SimContext): void {
  const { state } = ctx;
  const food = state.objectives.find((o) => o.kind === 'food' && !o.destroyed);
  const hiveAlive = state.objectives.some((o) => o.kind === 'hive' && !o.destroyed);
  let total = 0;
  for (const obj of state.objectives) {
    const def = objectiveDef(ctx, obj.id);
    if (!def.harvest && !def.regrowWaves) continue;
    if (obj.destroyed) {
      // Ohne Bienen keine Bestäubung: Ist der Bienenstock zerstört, wächst nichts mehr nach.
      if (!hiveAlive) continue;
      obj.regrowIn--;
      if (obj.regrowIn <= 0) {
        obj.destroyed = false;
        obj.hp = obj.maxHp;
        state.events.push({ type: 'regrow', objectiveId: obj.id });
        ctx.refreshObjectiveFields(obj.kind);
      }
      continue;
    }
    total += (def.harvest ?? 0) * (obj.hp / obj.maxHp);
  }
  if (food && total > 0) {
    const gained = Math.min(total, food.maxHp - food.hp);
    food.hp += gained;
    state.events.push({ type: 'harvest', amount: Math.round(gained) });
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
    const inRange = (u: Hero | Zombie) => objDistance(u, obj) <= range;
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
        const d = objDistance(z, obj);
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

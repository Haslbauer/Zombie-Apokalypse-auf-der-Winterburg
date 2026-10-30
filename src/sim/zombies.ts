import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { face, stepToward } from './movement';
import { damageObjective } from './objectives';
import { DT, type Hero, type Objective, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

/** Bis zu diesem Abstand laufen Zombies direkt aufs Ziel zu, sonst entlang des Distanzfelds. */
const DIRECT_RANGE = 3;
/** Entfernt sich der verfolgte Held so viel weiter als die Aggro-Reichweite, gibt der Zombie auf. */
const LEASH = 4;

/**
 * Zombie-KI: Helden in der Nähe werden gejagt, sonst läuft der Zombie zu
 * seinem Ziel (Herz oder Bienenstock) und greift es an.
 * heroField ist das Distanzfeld zu allen lebenden Helden.
 */
export function updateZombies(ctx: SimContext, heroField: Float32Array | null): void {
  const { state, zombieDefs } = ctx;
  const heroes = state.heroes.filter((h) => h.alive);

  for (const z of state.zombies) {
    if (z.hp <= 0) continue;
    z.attackTimer = Math.max(0, z.attackTimer - DT);
    const def = zombieDefs.get(z.defId)!;
    const speed = z.speed * slowFactor(ctx, z.pos);

    const hero = chaseTarget(ctx, z, heroes, def.aggroRange);
    if (hero) {
      if (edgeDistance(z, hero) <= def.attackRange) {
        face(z, hero.pos);
        if (z.attackTimer <= 0) {
          z.attackTimer = def.attackCooldown;
          state.events.push({ type: 'attack', id: z.id, targetId: hero.id });
          applyDamage(ctx, hero, z.damage);
        }
      } else {
        moveTo(ctx, z, hero.pos, heroField, speed * DT);
      }
      continue;
    }

    const obj = currentObjective(ctx, z);
    if (!obj) continue;
    if (edgeDistance(z, obj) <= def.attackRange) {
      face(z, obj.pos);
      if (obj.id === 'heart' && !state.wave.breached) {
        state.wave.breached = true;
        state.events.push({ type: 'breach', objectiveId: obj.id });
      }
      if (z.attackTimer <= 0) {
        z.attackTimer = def.attackCooldown;
        damageObjective(ctx, obj, z.damage);
      }
    } else {
      moveTo(ctx, z, obj.pos, ctx.objectiveFields.get(obj.id) ?? null, speed * DT);
    }
  }
}

/** Held, den der Zombie verfolgt: der bisherige, solange er nah genug ist, sonst der nächste in Aggro-Reichweite. */
function chaseTarget(ctx: SimContext, z: Zombie, heroes: Hero[], aggroRange: number): Hero | null {
  if (z.targetId !== null) {
    const h = heroes.find((x) => x.id === z.targetId);
    if (h && edgeDistance(z, h) <= aggroRange + LEASH) return h;
    z.targetId = null;
  }
  let best: Hero | null = null;
  let bestD = aggroRange;
  for (const h of heroes) {
    const d = edgeDistance(z, h);
    if (d <= bestD && ctx.grid.lineOfSight(z.pos, h.pos)) {
      bestD = d;
      best = h;
    }
  }
  z.targetId = best?.id ?? null;
  return best;
}

/** Das Ziel des Zombies; ist es zerstört, wird auf das nächste noch stehende Ziel umgeschaltet. */
function currentObjective(ctx: SimContext, z: Zombie): Objective | null {
  const objectives = ctx.state.objectives;
  let obj = objectives.find((o) => o.id === z.objectiveId && !o.destroyed);
  if (!obj) {
    obj = objectives.find((o) => o.id === 'heart' && !o.destroyed) ?? objectives.find((o) => !o.destroyed);
    if (obj) z.objectiveId = obj.id;
  }
  return obj ?? null;
}

function moveTo(ctx: SimContext, z: Zombie, target: Vec2, field: Float32Array | null, step: number): void {
  if (!field || dist(z.pos, target) < DIRECT_RANGE || ctx.grid.lineOfSight(z.pos, target)) {
    stepToward(z, target, step);
  } else {
    stepToward(z, ctx.grid.downhill(field, z.pos) ?? target, step);
  }
}

/** Tempo-Faktor durch Flächen wie den Hang (kleinster Faktor gilt). */
export function slowFactor(ctx: SimContext, p: Vec2): number {
  let f = 1;
  for (const s of ctx.data.arena.slowZones) {
    if (Math.abs(p.x - s.x) <= s.w / 2 && Math.abs(p.y - s.y) <= s.h / 2) f = Math.min(f, s.factor);
  }
  return f;
}

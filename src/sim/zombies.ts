import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { face, stepToward } from './movement';
import { damageObjective } from './objectives';
import { nextRandom } from './rng';
import { updateElite } from './elites';
import { hasBuff, heroCC, isBlind, isDisabled, isFeared, isRooted, statusSpeedFactor } from './status';
import { DT, type Hero, type Objective, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

/** Bis zu diesem Abstand laufen Zombies direkt aufs Ziel zu, sonst entlang des Distanzfelds. */
const DIRECT_RANGE = 3;
/** Entfernt sich der verfolgte Held so viel weiter als die Aggro-Reichweite, gibt der Zombie auf. */
const LEASH = 4;
/** Geblendete Zombies sehen nur so weit, torkeln mit diesem Tempo-Anteil und verfehlen so oft. */
const BLIND_SIGHT = 2;
const BLIND_SPEED = 0.6;
const BLIND_MISS = 0.5;

/**
 * Zombie-KI: Helden in der Nähe werden gejagt, sonst läuft der Zombie zu
 * seinem Ziel (Herz oder Bienenstock) und greift es an.
 * heroField ist das Distanzfeld zu allen lebenden Helden.
 */
export function updateZombies(ctx: SimContext, heroField: Float32Array | null): void {
  const { state, zombieDefs } = ctx;
  // Unsichtbare Helden (Nebelschritt) werden nicht gesehen.
  const heroes = state.heroes.filter((h) => h.alive && !hasBuff(h, 'invisible'));

  for (const z of state.zombies) {
    if (z.hp <= 0) continue;
    z.attackTimer = Math.max(0, z.attackTimer - DT);
    if (isDisabled(ctx, z)) continue; // schläft oder ist betäubt
    const def = zombieDefs.get(z.defId)!;
    const blind = isBlind(ctx, z);
    const rooted = isRooted(ctx, z);
    const speed = z.speed * slowFactor(ctx, z.pos) * statusSpeedFactor(ctx, z) * (blind ? BLIND_SPEED : 1);

    if (isFeared(ctx, z)) {
      z.charge = null;
      if (!rooted) flee(z, z.st.fearFrom, speed * DT);
      continue;
    }
    if (def.special && updateElite(ctx, z, def, heroes)) continue;

    const hero = chaseTarget(ctx, z, heroes, blind ? BLIND_SIGHT : def.aggroRange);
    if (hero) {
      if (edgeDistance(z, hero) <= def.attackRange) {
        face(z, hero.pos);
        if (z.attackTimer <= 0) {
          z.attackTimer = def.attackCooldown;
          state.events.push({ type: 'attack', id: z.id, targetId: hero.id });
          if (!blind || nextRandom(state) >= BLIND_MISS) {
            applyDamage(ctx, hero, z.damage);
            if (def.rootOnHit) heroCC(ctx, hero, 'rooted', def.rootOnHit);
          }
        }
      } else if (!rooted) {
        if (blind) stagger(ctx, z, hero.pos, speed * DT);
        else moveTo(ctx, z, hero.pos, heroField, speed * DT);
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
        if (!blind || nextRandom(state) >= BLIND_MISS) damageObjective(ctx, obj, z.damage);
      }
    } else if (!rooted) {
      if (blind) stagger(ctx, z, obj.pos, speed * DT);
      else moveTo(ctx, z, obj.pos, ctx.objectiveFields.get(obj.id) ?? null, speed * DT);
    }
  }
}

/** Vom Auslöser der Angst weglaufen. */
function flee(z: Zombie, from: Vec2, step: number): void {
  const dx = z.pos.x - from.x;
  const dy = z.pos.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  stepToward(z, { x: z.pos.x + (dx / d) * 5, y: z.pos.y + (dy / d) * 5 }, step);
}

/** Geblendet: torkelt grob Richtung Ziel, mit zufälligem Schlingern. */
function stagger(ctx: SimContext, z: Zombie, target: Vec2, step: number): void {
  z.wander += (nextRandom(ctx.state) - 0.5) * 1.2;
  z.wander = Math.max(-1.4, Math.min(1.4, z.wander));
  const a = Math.atan2(target.y - z.pos.y, target.x - z.pos.x) + z.wander;
  stepToward(z, { x: z.pos.x + Math.cos(a) * 5, y: z.pos.y + Math.sin(a) * 5 }, step);
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

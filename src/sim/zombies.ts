import { applyDamage, edgeDistance } from './combat';
import type { SimContext } from './context';
import { face, stepToward } from './movement';
import { damageObjective, objDistance, objectivesFor } from './objectives';
import { nextRandom } from './rng';
import { updateElite } from './elites';
import { updateNeutral } from './neutrals';
import { hasBuff, heroCC, isBlind, isDisabled, isFeared, isRooted, statusSpeedFactor } from './status';
import { type Defense, DT, type Hero, type Objective, type Zombie } from './types';
import { dist, type Vec2 } from './vec';
import { brushAt } from './grid';
import { threatTarget } from './roles';
import { minionTarget } from './minions';
import { eventFactor } from './waveevents';
import { blockingBarricade, damageDefense } from './defenses';
import { enrageFactor, updateBossAbilities } from './bossabilities';

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
export function updateZombies(ctx: SimContext, heroField: Float32Array | null, smallHeroField: Float32Array | null = null): void {
  const { state, zombieDefs } = ctx;
  // Unsichtbare Helden (Nebelschritt) werden nicht gesehen.
  const heroes = state.heroes.filter((h) => h.alive && !h.afk && !hasBuff(h, 'invisible'));

  for (const z of state.zombies) {
    if (z.hp <= 0) continue;
    z.attackTimer = Math.max(0, z.attackTimer - DT);
    if (isDisabled(ctx, z)) continue; // schläft oder ist betäubt
    const def = zombieDefs.get(z.defId)!;
    const blind = isBlind(ctx, z);
    const rooted = isRooted(ctx, z);
    const speed = z.speed * slowFactor(ctx, z.pos) * statusSpeedFactor(ctx, z) * (blind ? BLIND_SPEED : 1) * eventFactor(ctx, 'speed');

    if (isFeared(ctx, z)) {
      z.charge = null;
      if (!rooted) flee(z, z.st.fearFrom, speed * DT);
      continue;
    }
    // Versteckte Helden (Gebüsch, hohes Gras) sieht der Zombie nur aus nächster Nähe
    const seen = heroes.some((h) => (h.brush ?? -1) >= 0) ? heroes.filter((h) => canSee(ctx, z, h)) : heroes;
    if (def.abilities && updateBossAbilities(ctx, z, def, seen)) continue;
    if (def.special && updateElite(ctx, z, def, seen)) continue;
    if (z.neutral) {
      if (rooted) continue;
      // Verfolgen mit dem Wegfeld zu den Helden (um Zäune herum), heimkehren geradeaus
      const busy = updateNeutral(ctx, z, def, speed, (to, step, chase) => moveTo(ctx, z, to, chase ? heroField : null, step));
      if (!busy && z.courier) updateCourier(ctx, z, speed);
      continue;
    }

    // Bosse und Elites gehen auf einen Tank in der Nähe (Bedrohung), sonst wie gewohnt
    const tank = blind ? null : threatTarget(ctx, z, seen);
    if (tank) z.targetId = tank.id;
    const hero = tank ?? chaseTarget(ctx, z, seen, blind ? BLIND_SIGHT : def.aggroRange * eventFactor(ctx, 'aggro'), def.provokeOnly ?? false);
    // Trolle (Lotte): Brückentroll zieht Zombies an, sonst wird ein Troll direkt daneben angegriffen
    const troll = z.neutral ? null : minionTarget(ctx, z);
    if (troll && (!hero || edgeDistance(z, troll) < edgeDistance(z, hero))) {
      if (edgeDistance(z, troll) <= def.attackRange + 0.2) {
        face(z, troll.pos);
        if (z.attackTimer <= 0) {
          z.attackTimer = def.attackCooldown;
          troll.hp -= z.damage * enrageFactor(ctx, z);
          state.events.push({ type: 'attack', id: z.id, targetId: troll.id });
        }
      } else if (!rooted) stepToward(z, troll.pos, speed * DT);
      continue;
    }
    if (hero) {
      if (edgeDistance(z, hero) <= def.attackRange) {
        face(z, hero.pos);
        if (z.attackTimer <= 0) {
          z.attackTimer = def.attackCooldown;
          state.events.push({ type: 'attack', id: z.id, targetId: hero.id });
          if (!blind || nextRandom(state) >= BLIND_MISS) {
            applyDamage(ctx, hero, z.damage * (state.time < (z.st.weakUntil ?? 0) ? (z.st.weakFactor ?? 1) : 1) * enrageFactor(ctx, z));
            if (def.rootOnHit) heroCC(ctx, hero, 'rooted', def.rootOnHit);
            // Wachbienen: der Angreifer wird gestochen
            for (const b of hero.buffs) {
              if (b.kind !== 'thorns' || b.until <= state.time) continue;
              applyDamage(ctx, z, b.value, state.heroes.find((x) => x.id === b.by));
            }
          }
        }
      } else if (!rooted) {
        if (blind) stagger(ctx, z, hero.pos, speed * DT);
        else if (def.flying) stepToward(z, hero.pos, speed * DT);
        else moveTo(ctx, z, hero.pos, def.small ? smallHeroField : heroField, speed * DT, def.small);
      }
      continue;
    }

    const found = currentObjective(ctx, z);
    if (!found) continue;
    let bar: Defense | null = null;
    const obj = found.obj;
    if (objDistance(z, obj) <= def.attackRange) {
      face(z, obj.pos);
      if (obj.kind === 'food' && !state.wave.breached) {
        state.wave.breached = true;
        state.events.push({ type: 'breach', objectiveId: obj.id });
      }
      if (z.attackTimer <= 0) {
        z.attackTimer = def.attackCooldown;
        if (!blind || nextRandom(state) >= BLIND_MISS) damageObjective(ctx, obj, z.damage);
      }
    } else if (!def.flying && (bar = blockingBarricade(ctx, z, def.attackRange + 0.25))) {
      // Bretterbarrikade im Weg: kaputtschlagen
      face(z, bar.pos);
      if (z.attackTimer <= 0) {
        z.attackTimer = def.attackCooldown;
        damageDefense(ctx, bar, z.damage * enrageFactor(ctx, z));
        state.events.push({ type: 'attack', id: z.id, targetId: bar.id });
      }
    } else if (!rooted) {
      if (blind) stagger(ctx, z, obj.pos, speed * DT);
      else if (def.flying) stepToward(z, obj.pos, speed * DT);
      else moveTo(ctx, z, obj.pos, (def.small ? ctx.smallObjectiveFields : ctx.objectiveFields).get(found.key) ?? null, speed * DT, def.small);
    }
  }
}

/** Postbote: läuft seinen Rundweg ab, bis er getötet wird. */
function updateCourier(ctx: SimContext, z: Zombie, speed: number): void {
  const c = z.courier!;
  const route = ctx.data.arena.courierRoute ?? [];
  // Er bleibt, bis er getötet wird (keine Zeitbegrenzung mehr)
  if (route.length < 2) return;
  const target = route[c.wp];
  if (dist(z.pos, target) < 0.8) c.wp = (c.wp + c.dir + route.length) % route.length;
  stepToward(z, target, speed * DT);
  // Sein Platz wandert mit: Wird er angegriffen, kämpft er höchstens leash Meter von hier
  z.neutral!.home = { ...z.pos };
}

/** Aus dieser Nähe sieht ein Gegner auch einen versteckten Helden (m, Rand zu Rand). */
export const BRUSH_SIGHT = 2.5;

/**
 * Sieht der Zombie den Helden? Nicht, wenn der Held im Versteck steht, außer
 * er ist sehr nah, beide stehen im selben Versteck oder der Held hat gerade
 * angegriffen.
 */
export function canSee(ctx: SimContext, z: Zombie, h: Hero): boolean {
  const brush = h.brush ?? -1;
  if (brush < 0 || ctx.state.time < (h.revealedUntil ?? 0)) return true;
  if (edgeDistance(z, h) <= BRUSH_SIGHT) return true;
  return brushAt(ctx.arena, z.pos) === brush;
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

/** So weit verfolgt ein gereiztes Tier den Helden, der es getroffen hat. */
const PROVOKE_RANGE = 12;

/**
 * Held, den der Zombie verfolgt: der bisherige, solange er nah genug ist, sonst
 * der nächste in Aggro-Reichweite. Ratten und Hornissen (provokeOnly) jagen
 * außerdem den Helden, der sie zuletzt getroffen hat.
 */
function chaseTarget(ctx: SimContext, z: Zombie, heroes: Hero[], aggroRange: number, provokeOnly: boolean): Hero | null {
  if (provokeOnly && ctx.state.time < z.st.provokedUntil) {
    const h = heroes.find((x) => x.id === z.st.provokedBy);
    if (h && edgeDistance(z, h) <= PROVOKE_RANGE) {
      z.targetId = h.id;
      return h;
    }
  }
  if (z.targetId !== null) {
    const h = heroes.find((x) => x.id === z.targetId);
    if (h && edgeDistance(z, h) <= aggroRange + (provokeOnly ? 1 : LEASH)) return h;
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

/**
 * Ziel des Zombies: objectiveId ist eine Ziel-Id oder eine Gruppe (z. B. "bed").
 * Bei einer Gruppe zählt das nächste intakte Mitglied. Ist nichts mehr da,
 * geht es zum Lebensmittelvorrat. key ist das passende Distanzfeld.
 */
function currentObjective(ctx: SimContext, z: Zombie): { obj: Objective; key: string } | null {
  let candidates = objectivesFor(ctx, z.objectiveId);
  if (candidates.length === 0) {
    z.objectiveId = 'heart';
    candidates = objectivesFor(ctx, 'heart');
    if (candidates.length === 0) candidates = ctx.state.objectives.filter((o) => !o.destroyed);
  }
  let best: Objective | null = null;
  let bestD = Infinity;
  for (const o of candidates) {
    const d = objDistance(z, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best ? { obj: best, key: z.objectiveId } : null;
}

function moveTo(ctx: SimContext, z: Zombie, target: Vec2, field: Float32Array | null, step: number, small = false): void {
  const grid = small ? ctx.smallGrid : ctx.grid;
  if (!field || dist(z.pos, target) < DIRECT_RANGE || grid.lineOfSight(z.pos, target)) {
    stepToward(z, target, step);
  } else {
    stepToward(z, grid.downhill(field, z.pos) ?? target, step);
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

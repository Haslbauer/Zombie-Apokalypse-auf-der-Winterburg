import type { SimContext } from './context';
import { shotBlocked } from './grid';
import { kitOf } from './heroes/index';
import { awardXp, heroDamage } from './progression';
import { absorbWithShield, buffSum } from './status';
import { DT, type Hero, type Projectile, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

/** Bonus auf den ersten Treffer gegen einen schlafenden Zombie. */
const SLEEP_BONUS = 1.5;

/** Abstand von Rand zu Rand zweier runder Einheiten. */
export function edgeDistance(a: { pos: { x: number; y: number }; radius: number }, b: typeof a): number {
  return dist(a.pos, b.pos) - a.radius - b.radius;
}

/**
 * Zieht Leben ab und gibt den tatsächlich verursachten Schaden zurück.
 * Zombies: Schlafende nehmen beim ersten Treffer mehr Schaden und wachen auf.
 * Helden: Schadensreduktion und Schild greifen zuerst.
 * source ist der Held, der den Schaden verursacht (für Kampfstatus).
 */
export function applyDamage(ctx: SimContext, target: Hero | Zombie, amount: number, source?: Hero): number {
  if (target.hp <= 0 || amount <= 0) return 0;
  const { state } = ctx;
  if (source) source.lastCombatAt = state.time;

  if ('alive' in target) {
    target.lastCombatAt = state.time;
    const reduction = Math.min(0.8, buffSum(target, 'damageReduction') + (kitOf(target.defId).damageReduction?.(ctx, target) ?? 0));
    amount = absorbWithShield(target, amount * (1 - reduction));
    if (amount <= 0) return 0;
  } else if (state.time < target.st.sleepUntil) {
    amount *= SLEEP_BONUS;
    target.st.sleepUntil = 0;
    state.events.push({ type: 'status', zombieId: target.id, status: 'wake' });
  }

  const dealt = Math.min(amount, target.hp);
  target.hp -= dealt;
  state.events.push({ type: 'hit', targetId: target.id, amount: dealt, pos: { ...target.pos } });
  if (target.hp > 0) return dealt;

  target.hp = 0;
  state.events.push({ type: 'death', id: target.id, pos: { ...target.pos } });
  if ('alive' in target) {
    // Gefallene Helden kommen nach einem Timer im Innenhof zurück (kein Game Over).
    const { respawn } = ctx.data.arena;
    target.alive = false;
    target.dash = null;
    target.channel = null;
    target.input = { move: { x: 0, y: 0 }, aim: target.input.aim, attack: false };
    target.respawnAt = state.time + respawn.base + respawn.perWave * (state.wave.number - 1);
  } else {
    state.kills++;
    awardXp(ctx, target);
  }
  return dealt;
}

/** Schaden eines Helden mit Level-Wachstum und Buffs. */
export function heroHit(ctx: SimContext, h: Hero, z: Zombie, base: number): number {
  return applyDamage(ctx, z, heroDamage(ctx, h, base), h);
}

/**
 * Standardangriff in Blickrichtung. Nahkampf trifft alle Zombies im Bogen vor
 * dem Helden, Fernkampf feuert ein Projektil, das geradeaus fliegt.
 */
export function heroAttack(ctx: SimContext, h: Hero, cooldown: number): void {
  const attack = ctx.heroDefs.get(h.defId)!.attack;
  h.attackTimer = cooldown;
  const dir = { x: Math.cos(h.facing), y: Math.sin(h.facing) };

  if (attack.type === 'melee') {
    const arc = ((attack.arc ?? 90) * Math.PI) / 180;
    ctx.state.events.push({ type: 'swing', id: h.id, facing: h.facing, range: attack.range, arc });
    for (const z of ctx.state.zombies) {
      if (z.hp > 0 && inArc(h, z, h.facing, arc, attack.range)) {
        const dealt = heroHit(ctx, h, z, attack.damage);
        kitOf(h.defId).onBasicHit?.(ctx, h, z, dealt);
      }
    }
    return;
  }

  ctx.state.events.push({ type: 'shot', id: h.id });
  fireProjectile(ctx, h, dir, {
    speed: attack.projectileSpeed!,
    damage: attack.damage,
    radius: attack.projectileRadius ?? 0.2,
    range: attack.range,
    tag: 'basic',
    look: attack.look,
  });
}

/** Projektil vom Rand des Helden aus abfeuern. */
export function fireProjectile(
  ctx: SimContext,
  h: Hero,
  dir: Vec2,
  o: { speed: number; damage: number; radius: number; range: number; tag: string; look?: string; pierce?: boolean },
): Projectile {
  const p: Projectile = {
    id: ctx.state.nextId++,
    ownerId: h.id,
    pos: { x: h.pos.x + dir.x * h.radius, y: h.pos.y + dir.y * h.radius },
    dir,
    speed: o.speed,
    damage: o.damage,
    radius: o.radius,
    remaining: o.range,
    tag: o.tag,
    look: o.look,
    pierce: o.pierce,
    hitIds: o.pierce ? [] : undefined,
  };
  ctx.state.projectiles.push(p);
  return p;
}

/**
 * Liegt der Zombie im Schlagbogen? Randabstand höchstens range und Richtung
 * innerhalb von ±arc/2 (plus die halbe Breite des Zombies aus Sicht des Helden).
 */
export function inArc(h: Hero, z: Zombie, facing: number, arc: number, range: number): boolean {
  if (edgeDistance(h, z) > range) return false;
  const dx = z.pos.x - h.pos.x;
  const dy = z.pos.y - h.pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= h.radius + z.radius) return true; // berührt den Helden
  let diff = Math.atan2(dy, dx) - facing;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= arc / 2 + Math.asin(Math.min(1, z.radius / d));
}

/** Projektile fliegen geradeaus, treffen den ersten Zombie auf ihrer Bahn (bzw. alle beim Durchschlagen) oder enden an Hindernissen. */
export function updateProjectiles(ctx: SimContext): void {
  const { state } = ctx;
  state.projectiles = state.projectiles.filter((p) => {
    const step = Math.min(p.speed * DT, p.remaining);
    const from = p.pos;

    // Treffer entlang der Strecke from → from + dir * step, nach Entfernung sortiert
    const hits: { z: Zombie; t: number }[] = [];
    for (const z of state.zombies) {
      if (z.hp <= 0 || p.hitIds?.includes(z.id)) continue;
      const t = sweepCircle(from, p.dir, step, z.pos, z.radius + p.radius);
      if (t !== null) hits.push({ z, t });
    }
    hits.sort((a, b) => a.t - b.t || a.z.id - b.z.id);
    const firstT = !p.pierce && hits.length > 0 ? hits[0].t : Infinity;

    // Hindernisse in kleinen Schritten prüfen, damit dünne Hecken nicht übersprungen werden.
    let blockedAt = Infinity;
    const samples = Math.ceil(step / 0.25);
    for (let i = 1; i <= samples; i++) {
      const t = (step * i) / samples;
      if (t >= firstT) break;
      if (shotBlocked({ x: from.x + p.dir.x * t, y: from.y + p.dir.y * t }, ctx.arena)) {
        blockedAt = t;
        break;
      }
    }

    const owner = state.heroes.find((h) => h.id === p.ownerId);
    for (const { z, t } of hits) {
      if (t >= blockedAt) break;
      if (owner) projectileHit(ctx, owner, z, p);
      if (!p.pierce) return false;
      p.hitIds!.push(z.id);
    }
    if (blockedAt < Infinity) return false;
    p.pos = { x: from.x + p.dir.x * step, y: from.y + p.dir.y * step };
    p.remaining -= step;
    return p.remaining > 1e-6;
  });
}

function projectileHit(ctx: SimContext, owner: Hero, z: Zombie, p: Projectile): void {
  const kit = kitOf(owner.defId);
  if (p.tag === 'basic') {
    const dealt = heroHit(ctx, owner, z, p.damage);
    kit.onBasicHit?.(ctx, owner, z, dealt);
  } else if (kit.onProjectileHit) {
    kit.onProjectileHit(ctx, owner, z, p);
  } else {
    heroHit(ctx, owner, z, p.damage);
  }
}

/**
 * Strahl from + dir * t (0 <= t <= maxT) gegen einen Kreis. Gibt das kleinste t
 * zurück, bei dem der Strahl den Kreis berührt, sonst null.
 */
function sweepCircle(from: Vec2, dir: Vec2, maxT: number, center: Vec2, r: number): number | null {
  const fx = from.x - center.x;
  const fy = from.y - center.y;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const b = fx * dir.x + fy * dir.y;
  if (b > 0) return null; // fliegt weg
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t <= maxT ? t : null;
}

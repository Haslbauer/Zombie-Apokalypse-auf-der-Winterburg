import type { SimContext } from './context';
import { distanceToObstacle } from './grid';
import { DT, type Hero, type Zombie } from './types';
import { dist, type Vec2 } from './vec';

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
    target.input = { move: { x: 0, y: 0 }, aim: target.input.aim, attack: false };
    if (!state.gameOver && state.heroes.every((h) => !h.alive)) {
      state.gameOver = true;
      state.events.push({ type: 'gameOver', wave: state.wave.number });
    }
  } else {
    state.kills++;
  }
  return true;
}

/**
 * Standardangriff in Blickrichtung. Nahkampf trifft alle Zombies im Bogen vor
 * dem Helden, Fernkampf feuert ein Projektil, das geradeaus fliegt.
 */
export function heroAttack(ctx: SimContext, h: Hero): void {
  const attack = ctx.heroDefs.get(h.defId)!.attack;
  h.attackTimer = attack.cooldown;
  const dir = { x: Math.cos(h.facing), y: Math.sin(h.facing) };

  if (attack.type === 'melee') {
    const arc = ((attack.arc ?? 90) * Math.PI) / 180;
    ctx.state.events.push({ type: 'swing', id: h.id, facing: h.facing, range: attack.range, arc });
    for (const z of ctx.state.zombies) {
      if (z.hp > 0 && inArc(h, z, h.facing, arc, attack.range)) applyDamage(ctx, z, attack.damage);
    }
    return;
  }

  ctx.state.events.push({ type: 'shot', id: h.id });
  ctx.state.projectiles.push({
    id: ctx.state.nextId++,
    ownerId: h.id,
    pos: { x: h.pos.x + dir.x * h.radius, y: h.pos.y + dir.y * h.radius },
    dir,
    speed: attack.projectileSpeed!,
    damage: attack.damage,
    radius: attack.projectileRadius ?? 0.2,
    remaining: attack.range,
  });
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

/** Projektile fliegen geradeaus, treffen den ersten Zombie auf ihrer Bahn oder enden an Hindernissen. */
export function updateProjectiles(ctx: SimContext): void {
  const { state, data } = ctx;
  state.projectiles = state.projectiles.filter((p) => {
    const step = Math.min(p.speed * DT, p.remaining);
    const from = p.pos;

    // Erster Zombie entlang der Strecke from → from + dir * step
    let hit: Zombie | null = null;
    let hitT = Infinity;
    for (const z of state.zombies) {
      if (z.hp <= 0) continue;
      const t = sweepCircle(from, p.dir, step, z.pos, z.radius + p.radius);
      if (t !== null && t < hitT) {
        hitT = t;
        hit = z;
      }
    }

    // Hindernisse in kleinen Schritten prüfen, damit dünne Hecken nicht übersprungen werden.
    const samples = Math.ceil(step / 0.25);
    for (let i = 1; i <= samples; i++) {
      const t = (step * i) / samples;
      if (t >= hitT) break;
      const q = { x: from.x + p.dir.x * t, y: from.y + p.dir.y * t };
      const outside = q.x < 0 || q.y < 0 || q.x > data.arena.width || q.y > data.arena.height;
      if (outside || data.arena.obstacles.some((o) => distanceToObstacle(q, o) < 0)) return false;
    }

    if (hit) {
      applyDamage(ctx, hit, p.damage);
      return false;
    }
    p.pos = { x: from.x + p.dir.x * step, y: from.y + p.dir.y * step };
    p.remaining -= step;
    return p.remaining > 1e-6;
  });
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

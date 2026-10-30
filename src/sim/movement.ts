import type { Hero, Unit } from './types';
import type { Vec2 } from './vec';

/**
 * Bewegt eine Einheit höchstens maxDist in Richtung target und dreht sie dorthin.
 * Gibt die Reststrecke zurück, die nach Erreichen des Ziels übrig ist.
 */
export function stepToward(u: Unit, target: Vec2, maxDist: number): number {
  const dx = target.x - u.pos.x;
  const dy = target.y - u.pos.y;
  const d = Math.hypot(dx, dy);
  if (d > 1e-9) u.facing = Math.atan2(dy, dx);
  if (d <= maxDist) {
    u.pos.x = target.x;
    u.pos.y = target.y;
    return maxDist - d;
  }
  u.pos.x += (dx / d) * maxDist;
  u.pos.y += (dy / d) * maxDist;
  return 0;
}

/** Folgt den Wegpunkten des Helden. true, wenn der Pfad zu Ende ist. */
export function followPath(h: Hero, maxDist: number): boolean {
  let remaining = maxDist;
  while (h.path.length > 0 && remaining > 0) {
    remaining = stepToward(h, h.path[0], remaining);
    if (h.pos.x === h.path[0].x && h.pos.y === h.path[0].y) h.path.shift();
  }
  return h.path.length === 0;
}

/** Dreht eine Einheit zu einem Punkt, ohne sie zu bewegen. */
export function face(u: Unit, p: Vec2): void {
  const dx = p.x - u.pos.x;
  const dy = p.y - u.pos.y;
  if (dx !== 0 || dy !== 0) u.facing = Math.atan2(dy, dx);
}

/** Schiebt zwei überlappende Einheiten auseinander. share = Anteil, den a weicht (0..1). */
export function pushApart(a: Unit, b: Unit, share: number): void {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const min = a.radius + b.radius;
  const dSq = dx * dx + dy * dy;
  if (dSq >= min * min) return;
  const d = Math.sqrt(dSq);
  // Exakt übereinander: feste Richtung nach Id, damit es deterministisch bleibt.
  const nx = d > 1e-9 ? dx / d : a.id < b.id ? 1 : -1;
  const ny = d > 1e-9 ? dy / d : 0;
  const overlap = min - d;
  a.pos.x -= nx * overlap * share;
  a.pos.y -= ny * overlap * share;
  b.pos.x += nx * overlap * (1 - share);
  b.pos.y += ny * overlap * (1 - share);
}

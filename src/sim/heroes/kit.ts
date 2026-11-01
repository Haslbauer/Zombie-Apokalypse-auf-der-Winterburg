import type { SimContext } from '../context';
import type { Dash, Delayed, Hero, Projectile, Zombie } from '../types';
import type { Vec2 } from '../vec';

/**
 * Code eines Helden: Fähigkeiten und Passiv. Die Zahlen kommen aus
 * data/heroes.json, hier steht nur das Verhalten.
 */
export interface HeroKit {
  /** Fähigkeit in slot (0–3) auslösen. target ist auf die Reichweite begrenzt, aim der rohe Mauspunkt. false = nicht möglich (keine Abklingzeit). */
  cast(ctx: SimContext, h: Hero, slot: number, target: Vec2, aim: Vec2): boolean;
  init?(ctx: SimContext, h: Hero): void;
  /** Jeden Tick (für Passive). */
  update?(ctx: SimContext, h: Hero): void;
  onBasicHit?(ctx: SimContext, h: Hero, z: Zombie, dealt: number): void;
  onProjectileHit?(ctx: SimContext, h: Hero, z: Zombie, p: Projectile): void;
  onDashEnd?(ctx: SimContext, h: Hero, dash: Dash): void;
  onDelayed?(ctx: SimContext, h: Hero, d: Delayed): void;
  onChannelEnd?(ctx: SimContext, h: Hero, tag: string, completed: boolean): void;
  onRespawn?(ctx: SimContext, h: Hero): void;
  attackSpeedBonus?(ctx: SimContext, h: Hero): number;
  moveSpeedFactor?(ctx: SimContext, h: Hero): number;
  damageReduction?(ctx: SimContext, h: Hero): number;
  regenBonus?(ctx: SimContext, h: Hero): number;
  /** Zusätzlicher Schadensanteil (z. B. 0.1 = +10 %). */
  damageBonus?(ctx: SimContext, h: Hero): number;
  /** Faktor auf Kill-Gold (z. B. 1.15). */
  goldFactor?(ctx: SimContext, h: Hero): number;
}

/** Passivwert aus heroes.json. */
export function passive(ctx: SimContext, h: Hero, key: string): number {
  return ctx.heroDefs.get(h.defId)!.passive.values[key] ?? 0;
}

/** Einheitsvektor von a nach b (Fallback: Blickrichtung). */
export function direction(from: Vec2, to: Vec2, facing: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d > 1e-6 ? { x: dx / d, y: dy / d } : { x: Math.cos(facing), y: Math.sin(facing) };
}

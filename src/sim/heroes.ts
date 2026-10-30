import { heroAttack } from './combat';
import type { SimContext } from './context';
import { face } from './movement';
import { DT, type Command, type Hero } from './types';

/** Übernimmt die Eingaben eines Ticks. Sie gelten, bis eine neue Eingabe kommt. */
export function applyInputs(ctx: SimContext, commands: readonly Command[]): void {
  for (const cmd of commands) {
    const h = ctx.state.heroes.find((x) => x.id === cmd.heroId);
    if (!h || !h.alive) continue;
    // Laufrichtung auf Länge 1 begrenzen: schräg ist nicht schneller als gerade.
    const len = Math.hypot(cmd.move.x, cmd.move.y);
    const move = len > 1 ? { x: cmd.move.x / len, y: cmd.move.y / len } : { ...cmd.move };
    h.input = { move, aim: { ...cmd.aim }, attack: cmd.attack };
  }
}

/** Laufen mit WASD, Blick zur Maus, Angriff nur auf Tastendruck (kein Auto-Attack). */
export function updateHero(ctx: SimContext, h: Hero): void {
  if (!h.alive) return;
  const def = ctx.heroDefs.get(h.defId)!;
  h.attackTimer = Math.max(0, h.attackTimer - DT);
  h.hp = Math.min(h.maxHp, h.hp + def.hpRegen * DT);

  const { move, aim, attack } = h.input;
  h.pos.x += move.x * h.speed * DT;
  h.pos.y += move.y * h.speed * DT;
  face(h, aim);

  if (attack && h.attackTimer <= 0) heroAttack(ctx, h);
}

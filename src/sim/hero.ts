import { tryCast, updateDash } from './abilities';
import { heroAttack } from './combat';
import type { SimContext } from './context';
import { kitOf } from './heroes/index';
import { face } from './movement';
import { levelStats, rankUp } from './progression';
import { buffSum, updateBuffs } from './status';
import { DT, type Command, type Hero } from './types';

/** Übernimmt die Befehle eines Ticks. Eingaben gelten, bis eine neue kommt. */
export function applyInputs(ctx: SimContext, commands: readonly Command[]): void {
  for (const cmd of commands) {
    const h = ctx.state.heroes.find((x) => x.id === cmd.heroId);
    if (!h) continue;
    if (cmd.type === 'levelUp') {
      rankUp(ctx, h, cmd.slot);
      continue;
    }
    if (!h.alive) continue;
    if (cmd.type === 'cast') {
      tryCast(ctx, h, cmd.slot, cmd.aim);
      continue;
    }
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
  const kit = kitOf(h.defId);
  h.attackTimer = Math.max(0, h.attackTimer - DT);
  for (let i = 0; i < 4; i++) h.cooldowns[i] = Math.max(0, h.cooldowns[i] - DT);
  updateBuffs(ctx, h, DT);
  const regen = levelStats(def, h.level).regen + (kit.regenBonus?.(ctx, h) ?? 0);
  h.hp = Math.min(h.maxHp, h.hp + regen * DT);
  kit.update?.(ctx, h);

  if (h.dash) {
    updateDash(ctx, h);
    return;
  }

  const { move, aim, attack } = h.input;
  const moving = move.x !== 0 || move.y !== 0;
  if (h.channel) {
    const done = ctx.state.time >= h.channel.until;
    if (done || (moving && h.channel.cancelOnMove)) {
      const tag = h.channel.tag;
      h.channel = null;
      kit.onChannelEnd?.(ctx, h, tag, done);
    }
    if (h.channel) return;
  }

  const speed = h.speed * (1 + buffSum(h, 'haste')) * (kit.moveSpeedFactor?.(ctx, h) ?? 1);
  h.pos.x += move.x * speed * DT;
  h.pos.y += move.y * speed * DT;
  face(h, aim);

  if (attack && h.attackTimer <= 0) {
    const bonus = buffSum(h, 'attackSpeed') + (kit.attackSpeedBonus?.(ctx, h) ?? 0);
    heroAttack(ctx, h, def.attack.cooldown / (1 + bonus));
  }
}

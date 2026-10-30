import { zombiesInCircle, zombiesInCone, zombiesOnLine } from '../abilities';
import { edgeDistance } from '../combat';
import type { SimContext } from '../context';
import type { BotAbilityHint, Hero, Zombie } from '../types';
import { dist, type Vec2 } from '../vec';

/**
 * Prüft, ob sich der Einsatz einer Fähigkeit gerade lohnt. Gibt den Zielpunkt
 * zurück oder null. target ist das aktuelle Ziel des Bots.
 */
export function abilityAim(ctx: SimContext, h: Hero, slot: number, hint: BotAbilityHint, target: Zombie | null): Vec2 | null {
  const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
  const hpShare = h.hp / h.maxHp;
  const min = hint.min ?? 1;
  const near = (r: number) => ctx.state.zombies.filter((z) => z.hp > 0 && edgeDistance(h, z) <= r);

  switch (hint.use) {
    case 'engage': {
      // Sprung zum Ziel, wenn es außer Schlagweite, aber in Reichweite ist
      if (!target) return null;
      const d = edgeDistance(h, target);
      if (d < 2.5 || d > ability.range) return null;
      if (min > 1 && zombiesInCircle(ctx, target.pos, ability.radius ?? 2.5).length < min) return null;
      return { ...target.pos };
    }
    case 'cone': {
      if (!target || edgeDistance(h, target) > ability.range) return null;
      const facing = Math.atan2(target.pos.y - h.pos.y, target.pos.x - h.pos.x);
      return zombiesInCone(ctx, h, facing, ability.arc ?? 60, ability.range).length >= min ? { ...target.pos } : null;
    }
    case 'line': {
      if (!target || dist(h.pos, target.pos) > ability.range) return null;
      const end = { x: h.pos.x + ((target.pos.x - h.pos.x) / (dist(h.pos, target.pos) || 1)) * ability.range, y: h.pos.y + ((target.pos.y - h.pos.y) / (dist(h.pos, target.pos) || 1)) * ability.range };
      return zombiesOnLine(ctx, h.pos, end, (ability.width ?? 0.6) / 2).length >= min ? { ...target.pos } : null;
    }
    case 'aoe': {
      // Bester Mittelpunkt unter den Zombies in Reichweite
      const radius = ability.radius ?? 3;
      let best: Vec2 | null = null;
      let bestCount = min - 1;
      for (const z of ctx.state.zombies) {
        if (z.hp <= 0 || dist(h.pos, z.pos) > ability.range) continue;
        const count = zombiesInCircle(ctx, z.pos, radius).length;
        if (count > bestCount) {
          bestCount = count;
          best = { ...z.pos };
        }
      }
      return best;
    }
    case 'heal': {
      const radius = ability.radius ?? 6;
      const hurt = ctx.state.heroes.some((a) => a.alive && dist(a.pos, h.pos) <= radius && a.hp / a.maxHp < (hint.hp ?? 0.6));
      return hurt ? { ...h.pos } : null;
    }
    case 'channelHeal':
      return hpShare < (hint.hp ?? 0.5) && near(5).length === 0 ? { ...h.pos } : null;
    case 'buff':
      return near(4).length >= min ? (target ? { ...target.pos } : { ...h.pos }) : null;
    case 'escape': {
      if (hpShare >= (hint.hp ?? 0.35) || near(3).length === 0) return null;
      // weg von den Zombies, Richtung Herz
      const heart = ctx.state.objectives.find((o) => o.id === 'heart');
      const to = heart?.pos ?? ctx.data.arena.heroStart;
      const d = dist(h.pos, to) || 1;
      return { x: h.pos.x + ((to.x - h.pos.x) / d) * ability.range, y: h.pos.y + ((to.y - h.pos.y) / d) * ability.range };
    }
    case 'elite': {
      const rankOf = (z: Zombie) => ctx.zombieDefs.get(z.defId)?.rank ?? 'normal';
      const candidates = ctx.state.zombies.filter((z) => z.hp > 0 && edgeDistance(h, z) <= ability.range);
      const elite = candidates.find((z) => rankOf(z) !== 'normal');
      if (elite) return { ...elite.pos };
      // ohne Elite: gegen einen gefährlichen Zombie, wenn viele da sind
      if (target && candidates.length >= 3 && edgeDistance(h, target) <= ability.range) return { ...target.pos };
      return null;
    }
    case 'pass': {
      const ally = ctx.state.heroes.find((a) => a.alive && a.id !== h.id && dist(a.pos, h.pos) <= ability.range && a.hp / a.maxHp < (hint.hp ?? 0.5));
      if (ally) return { ...ally.pos };
      // Ball liegt weit weg: zu sich selbst zurückspielen
      if (h.ball && h.ball.heldBy === null && !h.ball.flight && dist(h.ball.pos, h.pos) > 8) return { ...h.pos };
      return null;
    }
    case 'spike': {
      if (!h.ball) return null;
      const at = h.ball.heldBy !== null ? h.pos : h.ball.pos;
      return zombiesInCircle(ctx, at, ability.radius ?? 4).length >= min ? { ...at } : null;
    }
  }
  return null;
}

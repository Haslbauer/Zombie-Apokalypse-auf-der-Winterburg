import { val, zombiesInCircle, zombiesInCone } from '../abilities';
import { heroHit } from '../combat';
import { addBuff } from '../status';
import type { Hero } from '../types';
import { dist, type Vec2 } from '../vec';
import { addZone } from '../zones';
import { type HeroKit, passive } from './kit';
import type { SimContext } from '../context';

/** Mitspieler (oder er selbst), der dem Punkt am nächsten ist. */
function allyNear(ctx: SimContext, h: Hero, p: Vec2, range: number): Hero {
  let best = h;
  let bestD = dist(h.pos, p);
  for (const a of ctx.state.heroes) {
    if (!a.alive || a.benched || (a.team ?? 0) !== (h.team ?? 0) || dist(a.pos, h.pos) > range + 1) continue;
    const d = dist(a.pos, p);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/**
 * Goldschmied Aurelius – Fernkampf-Schaden mit Gold: Nuggets (Durchschlag),
 * Lötflamme, Blattgold-Schild, Schmelztiegel und Goldrausch.
 */
export const goldschmied: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0: {
        // Lötflamme: Kegel, Schaden und Brand
        const burnTime = val(ctx, h, slot, 'burnTime');
        for (const z of zombiesInCone(ctx, h, h.facing, ability.arc ?? 50, ability.range)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
          z.st.burnUntil = t + burnTime;
          z.st.burnDps = val(ctx, h, slot, 'burn') / burnTime;
          z.st.burnBy = h.id;
        }
        ctx.state.events.push({ type: 'effect', kind: 'flame', pos: { ...h.pos }, radius: ability.range, facing: h.facing, arc: ability.arc ?? 50, heroId: h.id });
        return true;
      }
      case 1: {
        // Blattgold: Schild auf den Mitspieler am Zeiger
        const ally = allyNear(ctx, h, target, ability.range);
        addBuff(ctx, ally, 'shield', val(ctx, h, slot, 'shield'), val(ctx, h, slot, 'duration'), 'blattgold', h.id);
        ctx.state.events.push({ type: 'effect', kind: 'goldleaf', pos: { ...ally.pos }, radius: 1.2, heroId: ally.id });
        return true;
      }
      case 2:
        // Schmelztiegel: Fläche mit flüssigem Gold
        addZone(ctx, { kind: 'molten', ownerId: h.id, pos: { ...target }, radius: ability.radius ?? 2.8, activeAt: t, until: t + val(ctx, h, slot, 'duration'), slow: val(ctx, h, slot, 'slow'), dps: val(ctx, h, slot, 'dps') });
        return true;
      case 3: {
        // Goldrausch: Flächenschaden, Zombies lassen beim Tod doppelt Gold fallen
        const until = t + val(ctx, h, slot, 'duration');
        for (const z of zombiesInCircle(ctx, target, ability.radius ?? 5)) {
          z.st.goldUntil = until;
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
        }
        ctx.state.events.push({ type: 'effect', kind: 'goldrush', pos: { ...target }, radius: ability.radius ?? 5, heroId: h.id });
        return true;
      }
    }
    return false;
  },

  /** Feingold: mehr Gold für eigene Kills. */
  goldFactor(ctx, h) {
    return 1 + passive(ctx, h, 'goldBonus');
  },
  /** Feingold: Schaden je getragenem Gold. */
  damageBonus(ctx, h) {
    return Math.min(passive(ctx, h, 'maxDamage'), (h.gold / 100) * passive(ctx, h, 'damagePer100'));
  },
};


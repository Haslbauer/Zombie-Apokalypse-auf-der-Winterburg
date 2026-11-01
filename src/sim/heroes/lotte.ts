import { val } from '../abilities';
import { minionsOf, summonMinion } from '../minions';
import type { Hero } from '../types';
import type { SimContext } from '../context';
import { dist } from '../vec';
import { type HeroKit, passive } from './kit';

/** Stärke der Trolle mit Lottes Level (Passiv „Beste Freunde“). */
function trollFactor(ctx: SimContext, h: Hero): number {
  return 1 + passive(ctx, h, 'trollPerLevel') * (h.level - 1);
}

/**
 * Lotte – Beschwörerin: Steinschleuder, dazu Trolle, die selbst kämpfen
 * (Trollruf, Brückentroll, Trollfamilie) und per Wutanfall rasend werden.
 */
export const lotte: HeroKit = {
  cast(ctx, h, slot, target) {
    const f = trollFactor(ctx, h);
    const t = ctx.state.time;
    switch (slot) {
      case 0:
        summonMinion(ctx, h, 'troll', target, { hp: val(ctx, h, slot, 'hp') * f, damage: val(ctx, h, slot, 'damage') * f, duration: val(ctx, h, slot, 'duration') });
        return true;
      case 1:
        summonMinion(ctx, h, 'bridge', target, {
          hp: val(ctx, h, slot, 'hp') * f,
          damage: val(ctx, h, slot, 'damage') * f,
          duration: val(ctx, h, slot, 'duration'),
          taunt: val(ctx, h, slot, 'taunt'),
        });
        return true;
      case 2: {
        const mine = minionsOf(ctx, h.id);
        if (mine.length === 0) return false;
        for (const m of mine) m.rageUntil = t + val(ctx, h, slot, 'duration');
        ctx.state.events.push({ type: 'effect', kind: 'trollrage', pos: { ...h.pos }, radius: 2, heroId: h.id });
        return true;
      }
      case 3: {
        const d = val(ctx, h, slot, 'duration');
        for (const [dx, dy] of [
          [-1.6, 0.8],
          [1.6, 0.8],
        ]) {
          summonMinion(ctx, h, 'troll', { x: target.x + dx, y: target.y + dy }, { hp: val(ctx, h, slot, 'hp') * f, damage: val(ctx, h, slot, 'damage') * f, duration: d });
        }
        summonMinion(ctx, h, 'giant', { x: target.x, y: target.y - 0.8 }, { hp: val(ctx, h, slot, 'giantHp') * f, damage: val(ctx, h, slot, 'giantDamage') * f, duration: d });
        return true;
      }
    }
    return false;
  },

  /** Beste Freunde: weniger Schaden, wenn ein Troll in der Nähe ist. */
  damageReduction(ctx, h) {
    const r = passive(ctx, h, 'guardRange');
    return minionsOf(ctx, h.id).some((m) => dist(m.pos, h.pos) <= r) ? passive(ctx, h, 'guardReduction') : 0;
  },
};

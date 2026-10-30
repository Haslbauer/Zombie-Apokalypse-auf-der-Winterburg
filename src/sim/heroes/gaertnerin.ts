import { val } from '../abilities';
import { fireProjectile, heroHit } from '../combat';
import { addBuff, knockback } from '../status';
import { DT } from '../types';
import { dist } from '../vec';
import { addZone } from '../zones';
import { direction, type HeroKit, passive } from './kit';

/** Gärtnerin – Fernkampf, ausdauernd, Pflanzen als kleine Geschütztürme. */
export const gaertnerin: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0:
        fireProjectile(ctx, h, direction(h.pos, target, h.facing), {
          speed: val(ctx, h, slot, 'speed'),
          damage: val(ctx, h, slot, 'damage'),
          radius: 0.3,
          range: ability.range,
          tag: 'schleuderschuss',
          look: 'bigstone',
        });
        return true;
      case 1: {
        // Saat: höchstens maxSeeds gleichzeitig, die älteste verschwindet.
        const mine = ctx.state.zones.filter((z) => z.ownerId === h.id && z.kind === 'thorns');
        const max = val(ctx, h, slot, 'maxSeeds');
        if (mine.length >= max) {
          const oldest = mine.sort((a, b) => a.activeAt - b.activeAt)[0];
          ctx.state.zones = ctx.state.zones.filter((z) => z !== oldest);
        }
        const grow = val(ctx, h, slot, 'growTime');
        addZone(ctx, {
          kind: 'thorns',
          ownerId: h.id,
          pos: { ...target },
          radius: ability.radius ?? 2.5,
          activeAt: t + grow,
          until: t + grow + val(ctx, h, slot, 'duration'),
          slow: val(ctx, h, slot, 'slow'),
          dps: val(ctx, h, slot, 'dps'),
        });
        return true;
      }
      case 2: {
        // Kräutertee: Heilung über Zeit für sie und Verbündete in der Nähe
        const duration = val(ctx, h, slot, 'duration');
        const perSecond = val(ctx, h, slot, 'heal') / duration;
        for (const ally of ctx.state.heroes) {
          if (ally.alive && dist(ally.pos, h.pos) <= (ability.radius ?? 6)) addBuff(ctx, ally, 'heal', perSecond, duration, 'kraeutertee');
        }
        ctx.state.events.push({ type: 'effect', kind: 'tea', pos: { ...h.pos }, radius: ability.radius ?? 6, heroId: h.id });
        return true;
      }
      case 3:
        // Mein Garten!: Dornenhecke als Ring hält Zombies fest
        addZone(ctx, {
          kind: 'hedge',
          ownerId: h.id,
          pos: { ...target },
          radius: ability.radius ?? 4,
          ring: val(ctx, h, slot, 'ringWidth'),
          activeAt: t,
          until: t + val(ctx, h, slot, 'duration'),
          root: true,
          dps: val(ctx, h, slot, 'dps'),
        });
        return true;
    }
    return false;
  },

  onProjectileHit(ctx, h, z, p) {
    heroHit(ctx, h, z, p.damage);
    knockback(z, h.pos, val(ctx, h, 0, 'knockback'));
  },

  /** Sturschädel: zählt die Sekunden im Kampf (ohne Pause länger als combatWindow). */
  update(ctx, h) {
    const inCombat = ctx.state.time - h.lastCombatAt < passive(ctx, h, 'combatWindow');
    h.counters.stubborn = inCombat ? Math.min(passive(ctx, h, 'rampTime'), (h.counters.stubborn ?? 0) + DT) : 0;
  },
  regenBonus(ctx, h) {
    return ctx.state.time - h.lastCombatAt < passive(ctx, h, 'combatWindow') ? passive(ctx, h, 'regen') : 0;
  },
  damageReduction(ctx, h) {
    return (passive(ctx, h, 'maxReduction') * (h.counters.stubborn ?? 0)) / passive(ctx, h, 'rampTime');
  },
};

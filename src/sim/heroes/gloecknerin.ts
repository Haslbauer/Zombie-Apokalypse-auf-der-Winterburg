import { val, zombiesInCircle, zombiesInCone } from '../abilities';
import { heroHit } from '../combat';
import type { SimContext } from '../context';
import { healHero } from '../stats';
import { addBuff, fear, stun } from '../status';
import type { Hero } from '../types';
import { dist, type Vec2 } from '../vec';
import { type HeroKit, passive } from './kit';

/** Lebende Mitspieler (mit ihr selbst) im Umkreis r um p. */
function alliesNear(ctx: SimContext, h: Hero, p: Vec2, r: number): Hero[] {
  return ctx.state.heroes.filter((a) => a.alive && !a.benched && (a.team ?? 0) === (h.team ?? 0) && dist(a.pos, p) <= r + a.radius);
}

/**
 * Glöcknerin Hedwig – Support mit Glocken. Angriff: Schallwelle (Geschoss).
 * Passiv „Abendläuten“: Jeder dritte Treffer heilt den schwächsten Mitspieler
 * in der Nähe.
 */
export const gloecknerin: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    switch (slot) {
      case 0: {
        // Weckruf: Schallkegel, Schaden und kurze Betäubung
        for (const z of zombiesInCone(ctx, h, h.facing, ability.arc ?? 60, ability.range)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
          stun(ctx, z, val(ctx, h, slot, 'stun'));
        }
        ctx.state.events.push({ type: 'effect', kind: 'bellcone', pos: { ...h.pos }, radius: ability.range, facing: h.facing, arc: ability.arc ?? 60, heroId: h.id });
        return true;
      }
      case 1: {
        // Glockenschlag: heilt alle Mitspieler um den Zielpunkt
        const r = ability.radius ?? 4;
        for (const a of alliesNear(ctx, h, target, r)) healHero(ctx, a, val(ctx, h, slot, 'heal'), h);
        ctx.state.events.push({ type: 'effect', kind: 'bellheal', pos: { ...target }, radius: r, heroId: h.id });
        return true;
      }
      case 2: {
        // Schutzglocke: Schild auf Mitspieler um den Zielpunkt
        const r = ability.radius ?? 2.5;
        for (const a of alliesNear(ctx, h, target, r)) addBuff(ctx, a, 'shield', val(ctx, h, slot, 'shield'), val(ctx, h, slot, 'duration'), 'schutzglocke', h.id);
        ctx.state.events.push({ type: 'effect', kind: 'bellshield', pos: { ...target }, radius: r, heroId: h.id });
        return true;
      }
      case 3: {
        // Sturmgeläut: großer Kreis um sie, Schaden und Furcht; Mitspieler werden schneller
        const r = ability.radius ?? 7;
        for (const z of zombiesInCircle(ctx, h.pos, r)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
          fear(ctx, z, h.pos, val(ctx, h, slot, 'fear'));
        }
        for (const a of alliesNear(ctx, h, h.pos, r)) addBuff(ctx, a, 'haste', val(ctx, h, slot, 'haste'), val(ctx, h, slot, 'hasteTime'), 'sturmgelaeut', h.id);
        ctx.state.events.push({ type: 'effect', kind: 'bellstorm', pos: { ...h.pos }, radius: r, heroId: h.id });
        return true;
      }
    }
    return false;
  },

  /** Abendläuten: jeder dritte Treffer heilt den schwächsten Mitspieler in der Nähe. */
  onBasicHit(ctx, h) {
    h.counters.chime = ((h.counters.chime ?? 0) + 1) % 3;
    if (h.counters.chime !== 0) return;
    const range = passive(ctx, h, 'range');
    const hurt = alliesNear(ctx, h, h.pos, range).filter((a) => a.hp < a.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!hurt) return;
    healHero(ctx, hurt, passive(ctx, h, 'heal') + passive(ctx, h, 'healPerLevel') * (h.level - 1), h);
    ctx.state.events.push({ type: 'effect', kind: 'bellchime', pos: { ...hurt.pos }, radius: 1, heroId: hurt.id });
  },
};

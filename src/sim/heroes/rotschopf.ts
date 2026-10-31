import { startDash, val, zombiesInCircle, zombiesInCone } from '../abilities';
import { heroHit } from '../combat';
import { randomInt, nextRandom } from '../rng';
import { addBuff, knockback, stun } from '../status';
import { type HeroKit, passive } from './kit';

/** Rotschopf – Nahkampf-Berserker. Zufall kommt aus dem geseedeten Generator der Simulation. */
export const rotschopf: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    switch (slot) {
      case 0: {
        // Wuchtschlag: 0 = Betäubung, 1 = doppelter Schaden, 2 = Rückstoß
        const effect = randomInt(ctx.state, 3);
        const kind = ['stun', 'double', 'knockback'][effect];
        ctx.state.events.push({ type: 'effect', kind: `slam-${kind}`, pos: { ...h.pos }, radius: ability.range, facing: h.facing, arc: ability.arc, heroId: h.id });
        for (const z of zombiesInCone(ctx, h, h.facing, ability.arc ?? 140, ability.range)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage') * (effect === 1 ? 2 : 1));
          if (effect === 0) stun(ctx, z, val(ctx, h, slot, 'stun'));
          if (effect === 2) knockback(z, h.pos, val(ctx, h, slot, 'knockback'));
        }
        return true;
      }
      case 1: {
        // Wutanfall: zufälliger Buff
        const duration = val(ctx, h, slot, 'duration');
        const effect = randomInt(ctx.state, 3);
        if (effect === 0) addBuff(ctx, h, 'haste', val(ctx, h, slot, 'haste'), duration, 'wutanfall');
        if (effect === 1) addBuff(ctx, h, 'shield', val(ctx, h, slot, 'shield'), duration, 'wutanfall');
        if (effect === 2) addBuff(ctx, h, 'heal', (val(ctx, h, slot, 'healPct') * h.maxHp) / duration, duration, 'wutanfall', h.id);
        ctx.state.events.push({ type: 'effect', kind: `rage-${['haste', 'shield', 'heal'][effect]}`, pos: { ...h.pos }, radius: 1, heroId: h.id });
        return true;
      }
      case 2: {
        // Ungezielter Sprung: Landepunkt weicht zufällig ab
        const dev = val(ctx, h, slot, 'deviation') * nextRandom(ctx.state);
        const angle = nextRandom(ctx.state) * Math.PI * 2;
        startDash(ctx, h, { x: target.x + Math.cos(angle) * dev, y: target.y + Math.sin(angle) * dev }, 14, 2.2, 'jump');
        return true;
      }
      case 3: {
        const duration = val(ctx, h, slot, 'duration');
        addBuff(ctx, h, 'unstoppable', 1, duration, 'amok');
        addBuff(ctx, h, 'damageMult', val(ctx, h, slot, 'damageMult'), duration, 'amok');
        return true;
      }
    }
    return false;
  },

  onDashEnd(ctx, h, dash) {
    if (dash.tag !== 'jump') return;
    const radius = ctx.heroDefs.get(h.defId)!.abilities[2].radius ?? 2.5;
    ctx.state.events.push({ type: 'effect', kind: 'quake', pos: { ...h.pos }, radius, heroId: h.id });
    for (const z of zombiesInCircle(ctx, h.pos, radius)) heroHit(ctx, h, z, val(ctx, h, 2, 'damage'));
  },

  /** Jähzorn: je weniger Leben, desto schneller die Schläge. */
  attackSpeedBonus(ctx, h) {
    return passive(ctx, h, 'maxAttackSpeed') * (1 - h.hp / h.maxHp);
  },
};

import { startDash, val, zombiesInCircle, zombiesInCone } from '../abilities';
import { applyDamage, heroHit } from '../combat';
import { nextRandom } from '../rng';
import { blind, knockback } from '../status';
import { addZone } from '../zones';
import { type HeroKit, passive } from './kit';

/**
 * Schornsteinfeger Kasimir – Fernkampf-Schaden mit Ruß. Rußwolke (Kegel,
 * blendet), Kaminsprung (Sprung, Flächenschaden bei der Landung),
 * Besenwirbel (Rückstoß um ihn) und Funkenflug (große Brandzone).
 * Passiv „Glücksbringer“: Grundangriffe treffen manchmal doppelt.
 */
export const schornsteinfeger: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0: {
        // Rußwolke: Kegel nach vorn, Schaden und Blenden
        for (const z of zombiesInCone(ctx, h, h.facing, ability.arc ?? 55, ability.range)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
          blind(ctx, z, val(ctx, h, slot, 'blind'));
        }
        ctx.state.events.push({ type: 'effect', kind: 'soot', pos: { ...h.pos }, radius: ability.range, facing: h.facing, arc: ability.arc ?? 55, heroId: h.id });
        return true;
      }
      case 1:
        // Kaminsprung: hoher Sprung zum Ziel
        startDash(ctx, h, target, 15, 2.4, 'chimney');
        return true;
      case 2: {
        // Besenwirbel: Schaden und Rückstoß um ihn
        const r = ability.radius ?? 3;
        for (const z of zombiesInCircle(ctx, h.pos, r)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
          knockback(z, h.pos, val(ctx, h, slot, 'push'));
        }
        ctx.state.events.push({ type: 'effect', kind: 'broom', pos: { ...h.pos }, radius: r, heroId: h.id });
        return true;
      }
      case 3: {
        // Funkenflug: große Brandzone
        const r = ability.radius ?? 4.5;
        addZone(ctx, { kind: 'sparks', ownerId: h.id, pos: { ...target }, radius: r, activeAt: t, until: t + val(ctx, h, slot, 'duration'), dps: val(ctx, h, slot, 'dps') });
        ctx.state.events.push({ type: 'effect', kind: 'sparks', pos: { ...target }, radius: r, heroId: h.id });
        return true;
      }
    }
    return false;
  },

  /** Kaminsprung: bei der Landung Flächenschaden. */
  onDashEnd(ctx, h, dash) {
    if (dash.tag !== 'chimney') return;
    const r = ctx.heroDefs.get(h.defId)!.abilities[1].radius ?? 2.2;
    for (const z of zombiesInCircle(ctx, h.pos, r)) heroHit(ctx, h, z, val(ctx, h, 1, 'damage'));
    ctx.state.events.push({ type: 'effect', kind: 'chimney', pos: { ...h.pos }, radius: r, heroId: h.id });
  },

  /** Glücksbringer: mit chance doppelter Schaden (der zweite Teil kommt obendrauf). */
  onBasicHit(ctx, h, z, dealt) {
    if (dealt <= 0 || z.hp <= 0) return;
    if (nextRandom(ctx.state) >= passive(ctx, h, 'chance')) return;
    applyDamage(ctx, z, dealt, h);
    ctx.state.events.push({ type: 'effect', kind: 'lucky', pos: { ...z.pos }, radius: 0.8, heroId: h.id });
  },
};

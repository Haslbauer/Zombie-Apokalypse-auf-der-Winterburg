import { val, zombiesInCircle, zombiesOnLine } from '../abilities';
import { applyDamage, heroHit } from '../combat';
import { healHero } from '../stats';
import { addBuff, blind, slow, stun } from '../status';
import { direction, type HeroKit, passive } from './kit';

/**
 * Bäckerin Frieda – Nahkampf-Schaden mit Nudelholz. Brezelwurf (Linie mit
 * Durchschlag), Mehlstaub (blendet und verlangsamt), Ofenhitze (schneller)
 * und das große Backblech (Warnung, dann Schaden und Betäubung im Kreis).
 * Passiv „Frisch aus dem Ofen“: alle paar Sekunden ein verstärkter Hieb,
 * der sie heilt.
 */
export const baeckerin: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0: {
        // Brezelwurf: trifft alle auf der Linie
        const d = direction(h.pos, target, h.facing);
        const end = { x: h.pos.x + d.x * ability.range, y: h.pos.y + d.y * ability.range };
        for (const z of zombiesOnLine(ctx, h.pos, end, (ability.width ?? 0.8) / 2)) heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
        ctx.state.events.push({ type: 'effect', kind: 'pretzel', pos: { ...h.pos }, to: end, radius: (ability.width ?? 0.8) / 2, heroId: h.id });
        return true;
      }
      case 1: {
        // Mehlstaub: Wolke am Ziel, blendet und verlangsamt
        const r = ability.radius ?? 3;
        for (const z of zombiesInCircle(ctx, target, r)) {
          blind(ctx, z, val(ctx, h, slot, 'blind'));
          slow(ctx, z, val(ctx, h, slot, 'slow'), val(ctx, h, slot, 'blind'));
        }
        ctx.state.events.push({ type: 'effect', kind: 'flour', pos: { ...target }, radius: r, heroId: h.id });
        return true;
      }
      case 2: {
        // Ofenhitze: schneller zuschlagen und laufen
        const dur = val(ctx, h, slot, 'duration');
        addBuff(ctx, h, 'attackSpeed', val(ctx, h, slot, 'attackSpeed'), dur, 'ofenhitze', h.id);
        addBuff(ctx, h, 'haste', val(ctx, h, slot, 'haste'), dur, 'ofenhitze', h.id);
        ctx.state.events.push({ type: 'effect', kind: 'oven', pos: { ...h.pos }, radius: 1.4, heroId: h.id });
        return true;
      }
      case 3: {
        // Großes Backblech: Warnung, dann Schlag im Kreis
        const r = ability.radius ?? 4;
        ctx.state.delayed.push({ at: t + val(ctx, h, slot, 'delay'), ownerId: h.id, tag: 'tray', pos: { ...target }, targetIds: [], value: r });
        ctx.state.events.push({ type: 'effect', kind: 'tray-warn', pos: { ...target }, radius: r, heroId: h.id });
        return true;
      }
    }
    return false;
  },

  onDelayed(ctx, h, d) {
    if (d.tag !== 'tray') return;
    for (const z of zombiesInCircle(ctx, d.pos, d.value)) {
      heroHit(ctx, h, z, val(ctx, h, 3, 'damage'));
      stun(ctx, z, val(ctx, h, 3, 'stun'));
    }
    ctx.state.events.push({ type: 'effect', kind: 'tray', pos: { ...d.pos }, radius: d.value, heroId: h.id });
  },

  /** Frisch aus dem Ofen: verstärkter Hieb mit Heilung, dann Abklingzeit. */
  onBasicHit(ctx, h, z, dealt) {
    const t = ctx.state.time;
    if (dealt <= 0 || t < (h.counters.ovenReady ?? 0)) return;
    h.counters.ovenReady = t + passive(ctx, h, 'cooldown');
    if (z.hp > 0) applyDamage(ctx, z, dealt * passive(ctx, h, 'bonus'), h);
    healHero(ctx, h, passive(ctx, h, 'heal') + passive(ctx, h, 'healPerLevel') * (h.level - 1), h);
    ctx.state.events.push({ type: 'effect', kind: 'fresh', pos: { ...z.pos }, radius: 1, heroId: h.id });
  },
};

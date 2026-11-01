import { val, zombiesInCircle, zombiesOnLine } from '../abilities';
import { heroHit } from '../combat';
import { addBuff, knockback, root, slow, stun } from '../status';
import { direction, type HeroKit, passive } from './kit';

/**
 * Förster Bruno – Tank mit Axt. Baumstamm (Linie mit Rückstoß), Lockruf
 * (Zombies greifen ihn an, er bekommt einen Schild), Wurzelwerk (festhalten)
 * und „Holz fällen“: Nach kurzem Ausholen fällt ein Baum in Blickrichtung.
 */
export const foerster: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0: {
        // Baumstamm: rollt geradeaus, Schaden, Rückstoß und Verlangsamung
        const d = direction(h.pos, target, h.facing);
        const end = { x: h.pos.x + d.x * ability.range, y: h.pos.y + d.y * ability.range };
        for (const z of zombiesOnLine(ctx, h.pos, end, (ability.width ?? 1.2) / 2)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
          knockback(z, h.pos, val(ctx, h, slot, 'push'));
          slow(ctx, z, val(ctx, h, slot, 'slow'), 2);
        }
        ctx.state.events.push({ type: 'effect', kind: 'log', pos: { ...h.pos }, to: end, radius: (ability.width ?? 1.2) / 2, heroId: h.id });
        return true;
      }
      case 1: {
        // Lockruf: alle Zombies im Umkreis greifen ihn an; Schild je Zombie
        const r = ability.radius ?? 5;
        const zs = zombiesInCircle(ctx, h.pos, r);
        for (const z of zs) {
          z.targetId = h.id;
          z.st.provokedBy = h.id;
          z.st.provokedUntil = t + val(ctx, h, slot, 'duration');
        }
        const shield = val(ctx, h, slot, 'shield') + Math.min(8, zs.length) * val(ctx, h, slot, 'shieldPerZombie');
        addBuff(ctx, h, 'shield', shield, val(ctx, h, slot, 'duration'), 'lockruf', h.id);
        ctx.state.events.push({ type: 'effect', kind: 'lure', pos: { ...h.pos }, radius: r, heroId: h.id });
        return true;
      }
      case 2: {
        // Wurzelwerk: Wurzeln halten Zombies im Kreis fest
        const r = ability.radius ?? 3;
        for (const z of zombiesInCircle(ctx, target, r)) {
          root(ctx, z, val(ctx, h, slot, 'root'));
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
        }
        ctx.state.events.push({ type: 'effect', kind: 'roots', pos: { ...target }, radius: r, heroId: h.id });
        return true;
      }
      case 3: {
        // Holz fällen: Warnung, nach delay fällt der Baum in Blickrichtung
        const d = direction(h.pos, target, h.facing);
        const angle = Math.atan2(d.y, d.x);
        const delay = val(ctx, h, slot, 'delay');
        ctx.state.delayed.push({ at: t + delay, ownerId: h.id, tag: 'timber', pos: { ...h.pos }, targetIds: [], value: angle });
        const end = { x: h.pos.x + d.x * ability.range, y: h.pos.y + d.y * ability.range };
        ctx.state.events.push({ type: 'effect', kind: 'timber-warn', pos: { ...h.pos }, to: end, radius: (ability.width ?? 3) / 2, heroId: h.id });
        return true;
      }
    }
    return false;
  },

  onDelayed(ctx, h, dl) {
    if (dl.tag !== 'timber') return;
    const ability = ctx.heroDefs.get(h.defId)!.abilities[3];
    const end = { x: dl.pos.x + Math.cos(dl.value) * ability.range, y: dl.pos.y + Math.sin(dl.value) * ability.range };
    for (const z of zombiesOnLine(ctx, dl.pos, end, (ability.width ?? 3) / 2)) {
      heroHit(ctx, h, z, val(ctx, h, 3, 'damage'));
      stun(ctx, z, val(ctx, h, 3, 'stun'));
    }
    ctx.state.events.push({ type: 'effect', kind: 'timber', pos: { ...dl.pos }, to: end, radius: (ability.width ?? 3) / 2, heroId: h.id });
  },

  /** Dickes Fell: weniger Schaden, bei wenig Leben noch weniger. */
  damageReduction(ctx, h) {
    const low = h.hp / h.maxHp < passive(ctx, h, 'lowHp');
    return passive(ctx, h, 'reduction') + (low ? passive(ctx, h, 'lowBonus') : 0);
  },
};

import { val, zombiesInCircle, zombiesOnLine } from '../abilities';
import { fireProjectile, heroHit } from '../combat';
import { resolveObstacles } from '../grid';
import { addBuff, knockback, slow, stun } from '../status';
import { dist } from '../vec';
import { direction, type HeroKit, passive } from './kit';

/**
 * Taucher „Kapitän Tiefe“ – Tank: Harpune zieht heran, Luftblase schützt,
 * Tauchgang (unverwundbar, taucht mit Betäubung auf), Flutwelle spült zurück.
 */
export const taucher: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0:
        fireProjectile(ctx, h, direction(h.pos, target, h.facing), { speed: val(ctx, h, slot, 'speed'), damage: val(ctx, h, slot, 'damage'), radius: 0.3, range: ability.range, tag: 'harpune', look: 'harpoon' });
        return true;
      case 1: {
        const r = ability.radius ?? 5;
        for (const a of ctx.state.heroes) {
          if (!a.alive || (a.team ?? 0) !== (h.team ?? 0) || dist(a.pos, h.pos) > r) continue;
          addBuff(ctx, a, 'shield', val(ctx, h, slot, 'shield'), val(ctx, h, slot, 'duration'), 'luftblase', h.id);
        }
        ctx.state.events.push({ type: 'effect', kind: 'bubble', pos: { ...h.pos }, radius: r, heroId: h.id });
        return true;
      }
      case 2: {
        // Abtauchen: kurz unverwundbar und unsichtbar, kann nicht laufen; Auftauchen per verzögerter Wirkung
        const dive = val(ctx, h, slot, 'dive');
        addBuff(ctx, h, 'invulnerable', 1, dive, 'tauchgang');
        addBuff(ctx, h, 'invisible', 1, dive, 'tauchgang');
        addBuff(ctx, h, 'rooted', 1, dive, 'tauchgang');
        ctx.state.delayed.push({ at: t + dive, ownerId: h.id, tag: 'surface', pos: { ...target }, targetIds: [], value: 0 });
        ctx.state.events.push({ type: 'effect', kind: 'dive', pos: { ...h.pos }, radius: 1.2, heroId: h.id });
        return true;
      }
      case 3: {
        // Flutwelle: breite Welle in Blickrichtung
        const dir = direction(h.pos, target, h.facing);
        const end = { x: h.pos.x + dir.x * ability.range, y: h.pos.y + dir.y * ability.range };
        for (const z of zombiesOnLine(ctx, h.pos, end, (ability.width ?? 4) / 2)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
          knockback(z, h.pos, val(ctx, h, slot, 'push'));
          resolveObstacles(z.pos, z.radius, ctx.arena);
          slow(ctx, z, val(ctx, h, slot, 'slow'), val(ctx, h, slot, 'duration'));
        }
        ctx.state.events.push({ type: 'effect', kind: 'tidalwave', pos: { ...h.pos }, radius: ability.range, facing: Math.atan2(dir.y, dir.x), arc: 30, heroId: h.id });
        return true;
      }
    }
    return false;
  },

  onProjectileHit(ctx, h, z, p) {
    heroHit(ctx, h, z, p.damage);
    if (p.tag !== 'harpune') return;
    const rank = ctx.zombieDefs.get(z.defId)?.rank;
    // Heranziehen (außer Bosse und Neutrale), dann kurz betäuben
    if (rank !== 'boss' && !z.neutral) {
      const d = dist(z.pos, h.pos) || 1;
      const keep = h.radius + z.radius + 0.4;
      z.pos = { x: h.pos.x + ((z.pos.x - h.pos.x) / d) * keep, y: h.pos.y + ((z.pos.y - h.pos.y) / d) * keep };
      resolveObstacles(z.pos, z.radius, ctx.arena);
    }
    stun(ctx, z, val(ctx, h, 0, 'stun'));
  },

  onDelayed(ctx, h, d) {
    if (d.tag !== 'surface' || !h.alive) return;
    h.pos = { ...d.pos };
    resolveObstacles(h.pos, h.radius, ctx.arena);
    const ability = ctx.heroDefs.get(h.defId)!.abilities[2];
    for (const z of zombiesInCircle(ctx, h.pos, ability.radius ?? 2.5)) {
      heroHit(ctx, h, z, val(ctx, h, 2, 'damage'));
      stun(ctx, z, val(ctx, h, 2, 'stun'));
    }
    ctx.state.events.push({ type: 'effect', kind: 'surface', pos: { ...h.pos }, radius: ability.radius ?? 2.5, heroId: h.id });
  },

  /** Druckanzug: viel Rüstung. */
  damageReduction(ctx, h) {
    return passive(ctx, h, 'armor');
  },
};

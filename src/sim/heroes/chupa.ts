import { startDash, val, zombieNearAim, zombiesInCircle, zombiesOnLine } from '../abilities';
import { edgeDistance, heroHit } from '../combat';
import { addBuff, fear, isMarked, mark, root } from '../status';
import type { Hero, Zombie } from '../types';
import { dist } from '../vec';
import { type HeroKit, passive } from './kit';

/** Biss-Heilung: stärker, je weniger Leben Chupa hat (Passiv Wittern). */
function bite(ctx: Parameters<HeroKit['cast']>[0], h: Hero, z: Zombie, base: number, healShare: number): void {
  const dealt = heroHit(ctx, h, z, base);
  h.hp = Math.min(h.maxHp, h.hp + dealt * healShare * (1 + passive(ctx, h, 'lowHpBonus') * (1 - h.hp / h.maxHp)));
}

/** Chupa – kleiner weißer Hund, Nahkampf-Jäger. */
export const chupa: HeroKit = {
  cast(ctx, h, slot, target, aim) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0: {
        // Sprungbiss: Sprung in Zielrichtung, stoppt am ersten Zombie auf der Bahn
        const onPath = zombiesOnLine(ctx, h.pos, target, 0.5).sort((a, b) => dist(h.pos, a.pos) - dist(h.pos, b.pos))[0];
        if (onPath) {
          const d = dist(h.pos, onPath.pos) - onPath.radius - h.radius;
          const k = Math.max(0, d) / Math.max(dist(h.pos, onPath.pos), 1e-6);
          startDash(ctx, h, { x: h.pos.x + (onPath.pos.x - h.pos.x) * k, y: h.pos.y + (onPath.pos.y - h.pos.y) * k }, 18, 1, 'leap', onPath.id);
        } else {
          startDash(ctx, h, target, 18, 1, 'leap');
        }
        return true;
      }
      case 1: {
        // Fährte: verwundete Zombies markieren
        const duration = val(ctx, h, slot, 'duration');
        const threshold = val(ctx, h, slot, 'threshold');
        for (const z of zombiesInCircle(ctx, h.pos, ability.radius ?? 10)) {
          if (z.hp / z.maxHp < threshold) mark(ctx, z, duration);
        }
        h.counters.huntUntil = t + duration;
        return true;
      }
      case 2: {
        // Heulen: erst weniger Schaden, dann fliehen die Zombies
        const duration = val(ctx, h, slot, 'duration');
        addBuff(ctx, h, 'damageReduction', val(ctx, h, slot, 'reduction'), duration, 'heulen');
        ctx.state.delayed.push({ at: t + duration, ownerId: h.id, tag: 'howl', pos: { ...h.pos }, targetIds: [], value: val(ctx, h, slot, 'fear') });
        return true;
      }
      case 3: {
        // Hetzjagd: Sprung zu einem Ziel (Elite/Boss bevorzugt), festhalten und beißen
        const prey = zombieNearAim(ctx, h, aim, ability.range, (z) => (ctx.zombieDefs.get(z.defId)?.rank ?? 'normal') !== 'normal');
        if (!prey) return false;
        const d = dist(h.pos, prey.pos);
        const k = Math.max(0, d - prey.radius - h.radius) / Math.max(d, 1e-6);
        startDash(ctx, h, { x: h.pos.x + (prey.pos.x - h.pos.x) * k, y: h.pos.y + (prey.pos.y - h.pos.y) * k }, 20, 2, 'hunt', prey.id);
        return true;
      }
    }
    return false;
  },

  onDashEnd(ctx, h, dash) {
    const z = ctx.state.zombies.find((x) => x.id === dash.targetId && x.hp > 0);
    if (!z || edgeDistance(h, z) > 1) return;
    if (dash.tag === 'leap') bite(ctx, h, z, val(ctx, h, 0, 'damage'), val(ctx, h, 0, 'heal'));
    if (dash.tag === 'hunt') {
      const duration = val(ctx, h, 3, 'duration');
      root(ctx, z, duration, h.id);
      h.channel = { until: ctx.state.time + duration, tag: 'hold', cancelOnMove: false };
      h.counters.holdTarget = z.id;
      h.counters.holdTick = 0;
    }
  },

  onDelayed(ctx, h, d) {
    if (d.tag !== 'howl' || !h.alive) return;
    const radius = ctx.heroDefs.get(h.defId)!.abilities[2].radius ?? 6;
    ctx.state.events.push({ type: 'effect', kind: 'howl', pos: { ...h.pos }, radius, heroId: h.id });
    for (const z of zombiesInCircle(ctx, h.pos, radius)) fear(ctx, z, h.pos, d.value);
  },

  update(ctx, h) {
    // Hetzjagd: alle 0,5 s beißen, solange festgehalten wird
    if (h.channel?.tag !== 'hold') return;
    const z = ctx.state.zombies.find((x) => x.id === h.counters.holdTarget && x.hp > 0);
    if (!z) {
      h.channel = null;
      return;
    }
    h.counters.holdTick = (h.counters.holdTick ?? 0) - 1 / 20;
    if (h.counters.holdTick <= 0) {
      h.counters.holdTick += 0.5;
      bite(ctx, h, z, val(ctx, h, 3, 'dps') * 0.5, val(ctx, h, 3, 'heal'));
    }
  },

  onChannelEnd(ctx, h, tag) {
    if (tag !== 'hold') return;
    const z = ctx.state.zombies.find((x) => x.id === h.counters.holdTarget);
    if (z && z.st.heldBy === h.id) {
      z.st.rootUntil = ctx.state.time;
      z.st.heldBy = null;
    }
  },

  /** Wittern: Biss heilt, stärker bei wenig eigenem Leben. */
  onBasicHit(ctx, h, _z, dealt) {
    h.hp = Math.min(h.maxHp, h.hp + dealt * passive(ctx, h, 'lifesteal') * (1 + passive(ctx, h, 'lowHpBonus') * (1 - h.hp / h.maxHp)));
  },

  /** Fährte: schneller Richtung markierter Beute. */
  moveSpeedFactor(ctx, h) {
    if ((h.counters.huntUntil ?? 0) <= ctx.state.time) return 1;
    const { move } = h.input;
    const prey = ctx.state.zombies.some((z) => {
      if (z.hp <= 0 || !isMarked(ctx, z)) return false;
      const d = dist(h.pos, z.pos) || 1;
      return ((z.pos.x - h.pos.x) * move.x + (z.pos.y - h.pos.y) * move.y) / d > 0.5;
    });
    return prey ? 1 + val(ctx, h, 1, 'haste') : 1;
  },

  /** Fährte: schnellere Bisse gegen markierte Zombies in Reichweite. */
  attackSpeedBonus(ctx, h) {
    if ((h.counters.huntUntil ?? 0) <= ctx.state.time) return 0;
    const range = ctx.heroDefs.get(h.defId)!.attack.range + 0.5;
    return ctx.state.zombies.some((z) => z.hp > 0 && isMarked(ctx, z) && edgeDistance(h, z) <= range) ? val(ctx, h, 1, 'attackSpeed') : 0;
  },
};

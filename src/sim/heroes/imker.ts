import { val, zombiesInCircle, zombiesInCone } from '../abilities';
import { applyDamage } from '../combat';
import type { SimContext } from '../context';
import { healHero } from '../stats';
import { addBuff, blind, slow } from '../status';
import { DT, type Hero, type Zombie } from '../types';
import { dist, type Vec2 } from '../vec';
import { addZone } from '../zones';
import { type HeroKit, passive } from './kit';

/** Stiche ticken alle so viele Sekunden. */
const STING_TICK = 0.5;

/** Heilfaktor: nahe am Bienenstock heilt der Imker stärker (Passiv „Mein Volk“). */
function healFactor(ctx: SimContext, h: Hero): number {
  const hive = ctx.state.objectives.find((o) => o.kind === 'hive' && !o.destroyed);
  return hive && dist(hive.pos, h.pos) <= passive(ctx, h, 'hiveRange') ? 1 + passive(ctx, h, 'healBonus') : 1;
}

/** Stich hinzufügen (bis maxStings), Dauer auffrischen. */
export function addSting(ctx: SimContext, h: Hero, z: Zombie, n = 1): void {
  const max = passive(ctx, h, 'maxStings');
  const cur = z.st.stings && z.st.stings.until > ctx.state.time ? z.st.stings.n : 0;
  z.st.stings = { n: Math.min(max, cur + n), until: ctx.state.time + passive(ctx, h, 'stingTime'), by: h.id };
}

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
 * Imker – Support mit Bienen. Angriff: kleiner Schwarm (Geschoss), jeder
 * Treffer hinterlässt einen Stich (Schaden über Zeit, stapelbar).
 */
export const imker: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0: {
        // Honigtopf: heilt Mitspieler in der Fläche, Zombies kleben fest
        const r = ability.radius ?? 3.5;
        const heal = val(ctx, h, slot, 'heal') * healFactor(ctx, h);
        for (const a of ctx.state.heroes) {
          if (a.alive && (a.team ?? 0) === (h.team ?? 0) && dist(a.pos, target) <= r + a.radius) healHero(ctx, a, heal, h);
        }
        addZone(ctx, { kind: 'honey', ownerId: h.id, pos: { ...target }, radius: r, activeAt: t, until: t + val(ctx, h, slot, 'duration'), slow: val(ctx, h, slot, 'slow') });
        ctx.state.events.push({ type: 'effect', kind: 'honey', pos: { ...target }, radius: r, heroId: h.id });
        return true;
      }
      case 1: {
        // Smoker: Rauchkegel blendet und verlangsamt
        const duration = val(ctx, h, slot, 'duration');
        for (const z of zombiesInCone(ctx, h, h.facing, ability.arc ?? 70, ability.range)) {
          blind(ctx, z, duration);
          slow(ctx, z, val(ctx, h, slot, 'slow'), duration);
        }
        ctx.state.events.push({ type: 'effect', kind: 'smokecone', pos: { ...h.pos }, radius: ability.range, facing: h.facing, arc: ability.arc ?? 70, heroId: h.id });
        return true;
      }
      case 2: {
        // Wachbienen auf den Mitspieler am Zeiger (oder ihn selbst)
        const ally = allyNear(ctx, h, target, ability.range);
        addBuff(ctx, ally, 'thorns', val(ctx, h, slot, 'damage') * (1 + (h.level - 1) * 0.04), val(ctx, h, slot, 'duration'), 'wachbienen', h.id);
        ctx.state.events.push({ type: 'effect', kind: 'guardbees', pos: { ...ally.pos }, radius: 1.2, heroId: ally.id });
        return true;
      }
      case 3: {
        // Schwarm: großer Schwarm über einer Fläche
        addZone(ctx, { kind: 'swarm', ownerId: h.id, pos: { ...target }, radius: ability.radius ?? 4.5, activeAt: t, until: t + val(ctx, h, slot, 'duration'), dps: val(ctx, h, slot, 'dps') });
        ctx.state.events.push({ type: 'effect', kind: 'swarm', pos: { ...target }, radius: ability.radius ?? 4.5, heroId: h.id });
        return true;
      }
    }
    return false;
  },

  onBasicHit(ctx, h, z) {
    addSting(ctx, h, z);
  },

  /** Passiv: Stiche ticken, Schwarm füllt Stiche und reinigt Mitspieler; Stock heilt schneller. */
  update(ctx, h) {
    const { state } = ctx;
    if (h.benched) return;
    const every = Math.round(STING_TICK / DT);
    if (state.tick % every === 0) {
      const dps = passive(ctx, h, 'stingDps') + passive(ctx, h, 'stingDpsPerLevel') * (h.level - 1);
      for (const z of state.zombies) {
        const s = z.st.stings;
        if (!s || s.by !== h.id || z.hp <= 0) continue;
        if (s.until <= state.time) {
          z.st.stings = null;
          continue;
        }
        applyDamage(ctx, z, dps * s.n * STING_TICK, h);
      }
    }
    for (const zone of state.zones) {
      if (zone.kind !== 'swarm' || zone.ownerId !== h.id || state.time < zone.activeAt) continue;
      for (const z of zombiesInCircle(ctx, zone.pos, zone.radius)) addSting(ctx, h, z, passive(ctx, h, 'maxStings'));
      for (const a of state.heroes) if (a.alive && a.plague && (a.team ?? 0) === (h.team ?? 0) && dist(a.pos, zone.pos) <= zone.radius) a.plague = null;
    }
    if (h.alive) {
      const hive = state.objectives.find((o) => o.kind === 'hive' && !o.destroyed);
      if (hive && hive.hp < hive.maxHp) hive.hp = Math.min(hive.maxHp, hive.hp + passive(ctx, h, 'hiveRegen') * DT);
    }
  },
};


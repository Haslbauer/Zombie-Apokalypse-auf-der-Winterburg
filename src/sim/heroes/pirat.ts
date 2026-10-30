import { startDash, val, zombiesInCircle, zombiesInCone } from '../abilities';
import { heroHit } from '../combat';
import { addBuff, blind, stun } from '../status';
import { dist } from '../vec';
import { addZone, inZone } from '../zones';
import { type HeroKit, passive } from './kit';

/** Pirat (Qualm) – Kontrolle mit Rauch, wirft einen Enterhaken. */
export const pirat: HeroKit = {
  cast(ctx, h, slot, target) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0:
        // Qualmstoß: Rauchkegel, wenig Schaden, kurz benommen
        ctx.state.events.push({ type: 'effect', kind: 'smokecone', pos: { ...h.pos }, radius: ability.range, facing: h.facing, arc: ability.arc, heroId: h.id });
        for (const z of zombiesInCone(ctx, h, h.facing, ability.arc ?? 60, ability.range)) {
          heroHit(ctx, h, z, val(ctx, h, slot, 'damage'));
          stun(ctx, z, val(ctx, h, slot, 'stun'));
        }
        return true;
      case 1:
        // Rauchwolke: verlangsamt und blendet
        addZone(ctx, {
          kind: 'smoke',
          ownerId: h.id,
          pos: { ...target },
          radius: ability.radius ?? 3,
          activeAt: t,
          until: t + val(ctx, h, slot, 'duration'),
          slow: val(ctx, h, slot, 'slow'),
          blind: true,
        });
        return true;
      case 2: {
        // Nebelschritt: Sprung in eine eigene Wolke (dort unsichtbar), sonst kurzer Sprung
        const clouds = ctx.state.zones.filter((z) => z.ownerId === h.id && (z.kind === 'smoke' || z.kind === 'bigsmoke') && t >= z.activeAt);
        const hit = clouds.find((c) => inZone(c, target, 0));
        const near = hit ?? clouds.filter((c) => dist(h.pos, c.pos) <= ability.range + c.radius).sort((a, b) => dist(target, a.pos) - dist(target, b.pos))[0];
        if (near) {
          startDash(ctx, h, hit ? target : near.pos, 16, 1.5, 'mist-cloud');
        } else {
          const d = dist(h.pos, target);
          const reach = Math.min(d, val(ctx, h, slot, 'fallback'));
          const k = d > 0 ? reach / d : 0;
          startDash(ctx, h, { x: h.pos.x + (target.x - h.pos.x) * k, y: h.pos.y + (target.y - h.pos.y) * k }, 16, 1.5, 'mist');
        }
        return true;
      }
      case 3: {
        // Dicke Luft: große Wolke, erst betäubt, danach geblendet
        const radius = ability.radius ?? 7;
        const stunTime = val(ctx, h, slot, 'stun');
        addZone(ctx, { kind: 'bigsmoke', ownerId: h.id, pos: { ...target }, radius, activeAt: t, until: t + stunTime });
        for (const z of zombiesInCircle(ctx, target, radius)) {
          stun(ctx, z, stunTime);
          blind(ctx, z, stunTime + val(ctx, h, slot, 'blind'));
        }
        return true;
      }
    }
    return false;
  },

  onDashEnd(ctx, h, dash) {
    if (dash.tag === 'mist-cloud') addBuff(ctx, h, 'invisible', 1, val(ctx, h, 2, 'invisible'), 'nebelschritt');
  },

  /** Pulverdampf: jeder n-te Treffer blendet den Zombie. */
  onBasicHit(ctx, h, z) {
    h.counters.hits = (h.counters.hits ?? 0) + 1;
    if (h.counters.hits % passive(ctx, h, 'every') !== 0 || z.hp <= 0) return;
    blind(ctx, z, passive(ctx, h, 'blind'));
    ctx.state.events.push({ type: 'effect', kind: 'puff', pos: { ...z.pos }, radius: 1, heroId: h.id });
  },
};

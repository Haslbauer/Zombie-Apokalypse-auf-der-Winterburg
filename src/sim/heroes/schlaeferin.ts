import { startDash, val, zombieNearAim, zombiesInCircle, zombiesInCone } from '../abilities';
import { healHero } from '../stats';
import { addBuff, sleep, slow } from '../status';
import { dist } from '../vec';
import { type HeroKit, passive } from './kit';

/** Schläferin – Magierin mit Kristallstab, Kontrolle über Schlaf. */
export const schlaeferin: HeroKit = {
  cast(ctx, h, slot, target, aim) {
    const ability = ctx.heroDefs.get(h.defId)!.abilities[slot];
    const t = ctx.state.time;
    switch (slot) {
      case 0: {
        // Berührung: Antritt zum Zombie am Mauszeiger, er schläft sofort ein
        const z = zombieNearAim(ctx, h, aim, ability.range);
        if (!z) return false;
        const d = dist(h.pos, z.pos);
        const k = Math.max(0, d - z.radius - h.radius) / Math.max(d, 1e-6);
        startDash(ctx, h, { x: h.pos.x + (z.pos.x - h.pos.x) * k, y: h.pos.y + (z.pos.y - h.pos.y) * k }, 16, 0, 'touch', z.id);
        return true;
      }
      case 1: {
        // Gähnen: Kegel verlangsamt, nach kurzer Zeit schlafen die Getroffenen ein
        const delay = val(ctx, h, slot, 'delay');
        const hit = zombiesInCone(ctx, h, h.facing, ability.arc ?? 70, ability.range);
        for (const z of hit) slow(ctx, z, val(ctx, h, slot, 'slow'), delay);
        ctx.state.events.push({ type: 'effect', kind: 'yawn', pos: { ...h.pos }, radius: ability.range, facing: h.facing, arc: ability.arc, heroId: h.id });
        ctx.state.delayed.push({ at: t + delay, ownerId: h.id, tag: 'yawn', pos: { ...h.pos }, targetIds: hit.map((z) => z.id), value: val(ctx, h, slot, 'sleep') });
        return true;
      }
      case 2:
        // Powernap: stillstehen, danach Heilung und Tempo
        h.channel = { until: t + val(ctx, h, slot, 'channel'), tag: 'nap', cancelOnMove: true };
        return true;
      case 3: {
        const radius = ability.radius ?? 8;
        ctx.state.events.push({ type: 'effect', kind: 'goodnight', pos: { ...target }, radius, heroId: h.id });
        for (const z of zombiesInCircle(ctx, target, radius)) sleep(ctx, z, val(ctx, h, slot, 'sleep'));
        return true;
      }
    }
    return false;
  },

  onDashEnd(ctx, h, dash) {
    if (dash.tag !== 'touch') return;
    const z = ctx.state.zombies.find((x) => x.id === dash.targetId && x.hp > 0);
    if (z) sleep(ctx, z, val(ctx, h, 0, 'sleep'));
  },

  onDelayed(ctx, _h, d) {
    if (d.tag !== 'yawn') return;
    for (const z of ctx.state.zombies) if (z.hp > 0 && d.targetIds.includes(z.id)) sleep(ctx, z, d.value);
  },

  onChannelEnd(ctx, h, tag, completed) {
    if (tag !== 'nap' || !completed) return;
    healHero(ctx, h, val(ctx, h, 2, 'heal'), h);
    addBuff(ctx, h, 'haste', val(ctx, h, 2, 'haste'), val(ctx, h, 2, 'hasteDuration'), 'powernap');
    ctx.state.events.push({ type: 'effect', kind: 'nap', pos: { ...h.pos }, radius: 1.5, heroId: h.id });
  },

  /** Mondlicht: Treffer stapeln Schläfrigkeit, bei genug Stapeln schläft der Zombie ein. */
  onBasicHit(ctx, h, z) {
    if (z.hp <= 0) return;
    const t = ctx.state.time;
    if (t >= z.st.drowsyUntil) z.st.drowsy = 0;
    z.st.drowsy++;
    z.st.drowsyUntil = t + passive(ctx, h, 'window');
    if (z.st.drowsy >= passive(ctx, h, 'stacks')) {
      z.st.drowsy = 0;
      z.st.drowsyUntil = 0;
      sleep(ctx, z, passive(ctx, h, 'sleep'));
    }
  },
};

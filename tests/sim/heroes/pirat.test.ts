import { describe, expect, it } from 'vitest';
import { hasBuff, isBlind } from '../../../src/sim/status';
import { dist } from '../../../src/sim/vec';
import { heroSim, placeZombie, run } from '../helpers';

describe('Pirat', () => {
  it('Qualmstoß: Schaden und kurz benommen', () => {
    const { sim, h, zombie, cast, value } = heroSim('pirat');
    const z = zombie(h.pos.x + 3, h.pos.y);
    cast(0, { x: h.pos.x + 6, y: h.pos.y });
    expect(z.hp).toBe(1000 - value(0, 'damage'));
    expect(sim.state.time < z.st.stunUntil).toBe(true);
  });

  it('Rauchwolke: Zombies darin sind geblendet und langsamer', () => {
    const { sim, h, zombie, cast } = heroSim('pirat');
    const spot = { x: h.pos.x + 6, y: h.pos.y };
    const z = zombie(spot.x, spot.y);
    cast(1, spot);
    sim.step();
    expect(isBlind(sim, z)).toBe(true);
    expect(sim.state.time < z.st.slowUntil).toBe(true);
  });

  it('Nebelschritt: in die eigene Wolke springen macht unsichtbar, Zombies verlieren das Ziel', () => {
    const { sim, h, cast } = heroSim('pirat');
    const spot = { x: h.pos.x + 6, y: h.pos.y };
    const z = placeZombie(sim, 'walker', h.pos.x - 2, h.pos.y, 1000);
    z.damage = 0;
    sim.step();
    expect(z.targetId).toBe(h.id);
    cast(1, spot);
    cast(2, spot);
    run(sim, 10);
    expect(hasBuff(h, 'invisible')).toBe(true);
    expect(dist(h.pos, spot)).toBeLessThan(1);
    sim.step();
    expect(z.targetId).toBe(null);
  });

  it('Nebelschritt ohne Wolke: kurzer Sprung ohne Unsichtbarkeit', () => {
    const { sim, h, cast, value } = heroSim('pirat');
    const start = { ...h.pos };
    cast(2, { x: h.pos.x + 8, y: h.pos.y });
    run(sim, 10);
    expect(dist(start, h.pos)).toBeCloseTo(value(2, 'fallback'), 1);
    expect(hasBuff(h, 'invisible')).toBe(false);
  });

  it('Dicke Luft: erst betäubt, danach geblendet', () => {
    const { sim, h, zombie, cast, value } = heroSim('pirat');
    const center = { x: h.pos.x + 7, y: h.pos.y };
    const z = zombie(center.x + 3, center.y);
    cast(3, center);
    expect(sim.state.time < z.st.stunUntil).toBe(true);
    run(sim, value(3, 'stun') * 20 + 2);
    expect(sim.state.time < z.st.stunUntil).toBe(false);
    expect(isBlind(sim, z)).toBe(true);
  });

  it('Pulverdampf: jeder 4. Treffer blendet', () => {
    const { sim, h, zombie, attack } = heroSim('pirat');
    const z = zombie(h.pos.x + 3, h.pos.y);
    let hits = 0;
    for (let i = 0; i < 100 && hits < 4; i++) {
      attack(z.pos);
      hits += sim.state.events.filter((e) => e.type === 'hit' && e.targetId === z.id).length;
      if (hits < 4) expect(isBlind(sim, z)).toBe(false);
    }
    expect(hits).toBe(4);
    expect(isBlind(sim, z)).toBe(true);
  });
});

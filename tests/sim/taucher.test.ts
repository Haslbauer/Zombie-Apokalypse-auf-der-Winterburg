import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { heroCC } from '../../src/sim/status';
import { arenaData, noWaves, placeZombie, run } from './helpers';

function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['taucher', 'grimm'], startLevel: 6 });
  const [t, ally] = sim.state.heroes;
  for (const h of [t, ally]) {
    h.maxHp = h.hp = 1000;
    h.ranks = [1, 1, 1, 1];
    h.cooldowns = [0, 0, 0, 0];
  }
  t.pos = { x: 20, y: 20 };
  ally.pos = { x: 22, y: 20 };
  const cast = (slot: number, aim: { x: number; y: number }) => sim.step([{ heroId: t.id, type: 'cast', slot, aim }]);
  return { sim, t, ally, cast };
}

describe('Taucher Kapitän Tiefe', () => {
  it('Druckanzug: mehr Rüstung, kein Rückstoß', () => {
    const { sim, t, ally } = setup();
    expect(applyDamage(sim, t, 100)).toBeLessThan(applyDamage(sim, ally, 100) * 0.9);
    const before = { ...t.pos };
    heroCC(sim, t, 'stunned', 0.5, { from: { x: 18, y: 20 }, distance: 3 });
    expect(t.pos).toEqual(before);
  });

  it('Harpune zieht heran und betäubt', () => {
    const { sim, t, cast } = setup();
    const z = placeZombie(sim, 'brute', 27, 20, 5000);
    cast(0, z.pos);
    run(sim, 10);
    expect(Math.hypot(z.pos.x - t.pos.x, z.pos.y - t.pos.y)).toBeLessThan(2.5);
    expect(z.st.stunUntil).toBeGreaterThan(sim.state.time - 0.6);
    expect(z.hp).toBeLessThan(5000);
  });

  it('Luftblase schützt ihn und Mitspieler in der Nähe', () => {
    const { t, ally, cast } = setup();
    cast(1, t.pos);
    for (const h of [t, ally]) expect(h.buffs.some((b) => b.kind === 'shield' && b.source === 'luftblase')).toBe(true);
  });

  it('Tauchgang: unverwundbar, taucht am Ziel auf und betäubt dort', () => {
    const { sim, t, cast } = setup();
    const z = placeZombie(sim, 'walker', 25.5, 20);
    cast(2, { x: 25, y: 20 });
    expect(applyDamage(sim, t, 100)).toBe(0);
    run(sim, 20);
    expect(Math.hypot(t.pos.x - 25, t.pos.y - 20)).toBeLessThan(1.5);
    expect(z.st.stunUntil).toBeGreaterThan(sim.state.time);
  });

  it('Flutwelle: Schaden, spült zurück, verlangsamt', () => {
    const { sim, t, cast } = setup();
    const z = placeZombie(sim, 'brute', 24, 20, 5000);
    cast(3, { x: 30, y: 20 });
    expect(z.pos.x).toBeGreaterThan(27);
    expect(z.st.slowUntil).toBeGreaterThan(sim.state.time);
    expect(t.stats!.damage).toBeGreaterThan(0);
  });
});

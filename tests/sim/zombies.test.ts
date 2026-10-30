import { describe, expect, it } from 'vitest';
import { dist } from '../../src/sim/vec';
import { makeSim, noWaves, placeZombie, testData } from './helpers';

function setup() {
  const sim = makeSim('nahkampf', 1, testData(noWaves));
  const h = sim.state.heroes[0];
  h.maxHp = h.hp = 1e9;
  return { sim, h };
}

describe('Zombie-Verhalten', () => {
  it('jagt einen Helden in Aggro-Reichweite, ignoriert ihn außerhalb', () => {
    const { sim, h } = setup();
    // Offene Fläche im Süden des Gartens.
    h.pos = { x: 30, y: 60 };
    const near = placeZombie(sim, 'walker', 34, 60, 1e6);
    const far = placeZombie(sim, 'walker', 30, 45, 1e6);
    sim.step();
    expect(near.targetId).toBe(h.id);
    expect(far.targetId).toBe(null);
    const before = dist(near.pos, h.pos);
    for (let i = 0; i < 10; i++) sim.step();
    expect(dist(near.pos, h.pos)).toBeLessThan(before);
  });

  it('läuft auf dem Hang im Osten halb so schnell', () => {
    const { sim, h } = setup();
    h.pos = { x: 33.5, y: 20.5 };
    const onSlope = placeZombie(sim, 'walker', 60, 33.25, 1e6);
    const onFlat = placeZombie(sim, 'walker', 37, 50, 1e6);
    const a = { ...onSlope.pos };
    const b = { ...onFlat.pos };
    sim.step();
    expect(dist(a, onSlope.pos)).toBeCloseTo(onSlope.speed / 20 / 2, 5);
    expect(dist(b, onFlat.pos)).toBeCloseTo(onFlat.speed / 20, 5);
  });
});

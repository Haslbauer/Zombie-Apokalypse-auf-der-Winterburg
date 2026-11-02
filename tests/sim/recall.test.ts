import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { RECALL_TIME } from '../../src/sim/recall';
import { applyDamage } from '../../src/sim/combat';
import { noWaves, run, testData } from './helpers';

function setup() {
  const sim = new Simulation(testData(noWaves), { seed: 1, heroes: ['rotschopf'] });
  const h = sim.state.heroes[0];
  h.pos = { x: 10, y: 30 };
  const idle = { heroId: h.id, type: 'input' as const, move: { x: 0, y: 0 }, aim: { x: 11, y: 30 }, attack: false };
  return { sim, h, idle };
}

describe('Rückruf zur Basis', () => {
  it('nach RECALL_TIME Sekunden stillhalten steht der Held an der Basis', () => {
    const { sim, h, idle } = setup();
    sim.step([{ heroId: h.id, type: 'recall' }]);
    expect(h.recall).toBeTruthy();
    for (let i = 0; i < (RECALL_TIME - 0.2) * 20; i++) sim.step([idle]);
    expect(h.pos.x).toBeCloseTo(10, 0);
    run(sim, 10);
    expect(h.recall).toBeNull();
    const start = sim.data.arena.heroStart;
    expect(Math.hypot(h.pos.x - start.x, h.pos.y - start.y)).toBeLessThan(3);
  });

  it('Laufen, Angreifen und Schaden brechen ab', () => {
    const { sim, h, idle } = setup();
    sim.step([{ heroId: h.id, type: 'recall' }]);
    sim.step([{ ...idle, move: { x: 1, y: 0 } }]);
    expect(h.recall).toBeNull();
    sim.step([idle, { heroId: h.id, type: 'recall' }]);
    sim.step([{ ...idle, attack: true }]);
    expect(h.recall).toBeNull();
    sim.step([idle, { heroId: h.id, type: 'recall' }]);
    applyDamage(sim, h, 5);
    expect(h.recall).toBeNull();
    expect(sim.state.events.some((e) => e.type === 'recall' && e.phase === 'cancel')).toBe(true);
  });
});

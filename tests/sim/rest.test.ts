import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { isResting } from '../../src/sim/hero';
import { run, testData } from './helpers';

function setup() {
  const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'] });
  const h = sim.state.heroes[0];
  const food = sim.state.objectives.find((o) => o.kind === 'food')!;
  return { sim, h, food };
}

describe('Rasten am Vorrat', () => {
  it('in der Pause nahe am Vorrat heilt man schnell, weiter weg nur normal', () => {
    const { sim, h, food } = setup();
    expect(sim.state.wave.phase).toBe('pause');
    sim.state.wave.timer = 999;
    h.pos = { x: food.pos.x + 2, y: food.pos.y };
    h.hp = h.maxHp * 0.3;
    expect(isResting(sim, h)).toBe(true);
    run(sim, 20 * 3);
    const near = h.hp;
    expect(near).toBeGreaterThan(h.maxHp * 0.3 + h.maxHp * 0.2);
    // weit weg: nur die normale Regeneration
    const far = setup();
    far.sim.state.wave.timer = 999;
    far.h.pos = { x: far.food.pos.x + 15, y: far.food.pos.y + 10 };
    far.h.hp = far.h.maxHp * 0.3;
    expect(isResting(far.sim, far.h)).toBe(false);
    run(far.sim, 20 * 3);
    expect(far.h.hp).toBeLessThan(far.h.maxHp * 0.36);
  });

  it('nicht während der Welle und nicht mit zerstörtem Vorrat', () => {
    const { sim, h, food } = setup();
    h.pos = { x: food.pos.x + 2, y: food.pos.y };
    sim.state.wave.phase = 'wave';
    expect(isResting(sim, h)).toBe(false);
    sim.state.wave.phase = 'pause';
    food.destroyed = true;
    expect(isResting(sim, h)).toBe(false);
  });
});

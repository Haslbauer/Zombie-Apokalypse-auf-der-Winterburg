import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { arenaData, noWaves, run } from './helpers';

function setup(helper = 'rotschopf') {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['grimm', helper] });
  const [down, help] = sim.state.heroes;
  down.pos = { x: 20, y: 20 };
  help.pos = { x: 30, y: 20 };
  applyDamage(sim, down, 99999);
  return { sim, down, help };
}

describe('Wiederbeleben', () => {
  it('Mitspieler daneben belebt in 3 s wieder (40 % Leben, an Ort und Stelle)', () => {
    const { sim, down, help } = setup();
    expect(down.alive).toBe(false);
    help.pos = { x: 21.5, y: 20 };
    run(sim, 20 * 2);
    expect(down.alive).toBe(false);
    expect(down.reviveProgress).toBeGreaterThan(0.5);
    run(sim, 25);
    expect(down.alive).toBe(true);
    expect(down.hp / down.maxHp).toBeCloseTo(0.4, 1);
    expect(down.pos).toEqual({ x: 20, y: 20 });
    expect(sim.state.events.some((e) => e.type === 'revive') || down.alive).toBe(true);
  });

  it('Supports beleben schneller', () => {
    const { sim, down, help } = setup('gaertnerin');
    help.pos = { x: 21.5, y: 20 };
    run(sim, 20 * 2 + 2);
    expect(down.alive).toBe(true);
  });

  it('Ohne Helfer: nach 10 s keine Wiederbelebung mehr, normaler Respawn', () => {
    const { sim, down, help } = setup();
    run(sim, 20 * 11);
    help.pos = { x: 21.5, y: 20 };
    run(sim, 20 * 4);
    expect(down.alive).toBe(down.respawnAt <= sim.state.time);
    expect((down.downUntil ?? 0) <= sim.state.time).toBe(true);
  });
});

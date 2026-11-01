import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { waveElites } from '../../src/sim/waves';
import { arenaData, noWaves, placeZombie, testData } from './helpers';

function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['foerster'] });
  const h = sim.state.heroes[0];
  h.maxHp = h.hp = 5000;
  h.pos = { x: 20, y: 20 };
  sim.state.wave.number = 10;
  return { sim, h };
}

describe('Neue Zwischenbosse', () => {
  it('Vogelscheuche und Frostriese sind Elites mit Team-Buff und kommen in der Rotation vor', () => {
    const data = testData();
    for (const id of ['vogelscheuche', 'frostriese']) {
      const def = data.zombies.find((z) => z.id === id)!;
      expect(def.rank).toBe('elite');
      expect(def.teamBuff).toBeDefined();
      expect(def.abilities!.length).toBe(3);
    }
    const seen = new Set<string>();
    for (let n = 3; n <= 30; n++) for (const e of waveElites(n, data.waves)) seen.add(e);
    expect(seen.has('vogelscheuche')).toBe(true);
    expect(seen.has('frostriese')).toBe(true);
  });

  it('Frosthauch verlangsamt getroffene Helden', () => {
    const { sim, h } = setup();
    const z = placeZombie(sim, 'frostriese', 22, 20, 100000);
    z.abil = { timers: [99, 0, 99], cast: null };
    for (let i = 0; i < 40; i++) {
      h.input = { move: { x: 0, y: 0 }, aim: z.pos, attack: false };
      sim.step();
    }
    expect(h.hp).toBeLessThan(5000);
    expect(h.buffs.some((b) => b.kind === 'haste' && b.value < 0 && b.source.startsWith('frost'))).toBe(true);
  });

  it('Saat der Toten beschwört Zombies', () => {
    const { sim, h } = setup();
    const z = placeZombie(sim, 'vogelscheuche', 22, 20, 100000);
    z.abil = { timers: [99, 99, 0], cast: null };
    const before = sim.state.zombies.length;
    for (let i = 0; i < 40; i++) {
      h.input = { move: { x: 0, y: 0 }, aim: z.pos, attack: false };
      sim.step();
    }
    expect(sim.state.zombies.filter((x) => x.defId === 'walker').length).toBe(2);
    expect(sim.state.zombies.length).toBeGreaterThan(before);
  });
});

import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { arenaData, noWaves, placeZombie, run, testData } from './helpers';

function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['baeckerin'], startLevel: 6 });
  const f = sim.state.heroes[0];
  f.maxHp = f.hp = 1000;
  f.ranks = [1, 1, 1, 1];
  f.cooldowns = [0, 0, 0, 0];
  f.pos = { x: 20, y: 20 };
  const cast = (slot: number, aim: { x: number; y: number }) => sim.step([{ heroId: f.id, type: 'cast', slot, aim }]);
  return { sim, f, cast };
}

describe('Bäckerin Frieda', () => {
  it('ist Schaden-Heldin mit vier Fähigkeiten', () => {
    const data = testData();
    expect(data.heroes.find((h) => h.id === 'baeckerin')!.abilities).toHaveLength(4);
    expect(data.bots.heroes.baeckerin.teamRole).toBe('dmg');
  });

  it('Brezelwurf trifft alle auf der Linie', () => {
    const { sim, cast } = setup();
    const a = placeZombie(sim, 'brute', 23, 20, 5000);
    const b = placeZombie(sim, 'brute', 26, 20, 5000);
    cast(0, { x: 28, y: 20 });
    expect(a.hp).toBeLessThan(5000);
    expect(b.hp).toBeLessThan(5000);
  });

  it('Mehlstaub blendet, Ofenhitze macht schneller', () => {
    const { sim, f, cast } = setup();
    const z = placeZombie(sim, 'walker', 24, 20, 5000);
    cast(1, z.pos);
    expect(z.st.blindUntil).toBeGreaterThan(sim.state.time);
    cast(2, f.pos);
    expect(f.buffs.some((b) => b.kind === 'attackSpeed' && b.value > 0)).toBe(true);
  });

  it('Großes Backblech: erst Warnung, dann Schaden und Betäubung', () => {
    const { sim, cast } = setup();
    const z = placeZombie(sim, 'brute', 25, 20, 5000);
    cast(3, z.pos);
    expect(z.hp).toBe(5000);
    run(sim, 20);
    expect(z.hp).toBeLessThan(5000);
    expect(z.st.stunUntil).toBeGreaterThan(sim.state.time);
  });

  it('Frisch aus dem Ofen: verstärkter Hieb heilt sie, dann Abklingzeit', () => {
    const { sim, f } = setup();
    f.hp = 500;
    const z = placeZombie(sim, 'brute', 21.5, 20, 100000);
    let fresh = 0;
    for (let i = 0; i < 60; i++) {
      sim.step([{ heroId: f.id, type: 'input', move: { x: 0, y: 0 }, aim: z.pos, attack: true }]);
      fresh += sim.state.events.filter((e) => e.type === 'effect' && e.kind === 'fresh').length;
    }
    expect(fresh).toBe(1); // 3 s: nur einmal (Abklingzeit 6 s)
    expect(f.hp).toBeGreaterThan(500 + 25);
  });
});

import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { arenaData, noWaves, placeZombie, run, testData } from './helpers';

function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['schornsteinfeger'], startLevel: 6 });
  const k = sim.state.heroes[0];
  k.maxHp = k.hp = 1000;
  k.ranks = [1, 1, 1, 1];
  k.cooldowns = [0, 0, 0, 0];
  k.pos = { x: 20, y: 20 };
  const cast = (slot: number, aim: { x: number; y: number }) => sim.step([{ heroId: k.id, type: 'cast', slot, aim }]);
  return { sim, k, cast };
}

describe('Schornsteinfeger Kasimir', () => {
  it('ist Schaden-Held mit vier Fähigkeiten', () => {
    const data = testData();
    expect(data.heroes.find((h) => h.id === 'schornsteinfeger')!.abilities).toHaveLength(4);
    expect(data.bots.heroes.schornsteinfeger.teamRole).toBe('dmg');
  });

  it('Rußwolke blendet Zombies im Kegel', () => {
    const { sim, k, cast } = setup();
    const z = placeZombie(sim, 'brute', 23, 20, 5000);
    k.facing = 0;
    const hp = z.hp;
    cast(0, z.pos);
    expect(z.hp).toBeLessThan(hp);
    expect(z.st.blindUntil).toBeGreaterThan(sim.state.time);
  });

  it('Kaminsprung: springt und trifft bei der Landung', () => {
    const { sim, k, cast } = setup();
    const z = placeZombie(sim, 'brute', 26.5, 20, 5000);
    const hp = z.hp;
    cast(1, { x: 26, y: 20 });
    run(sim, 20);
    expect(k.pos.x).toBeGreaterThan(24);
    expect(z.hp).toBeLessThan(hp);
  });

  it('Besenwirbel stößt zurück, Funkenflug brennt', () => {
    const { sim, cast } = setup();
    const z = placeZombie(sim, 'brute', 21.5, 20, 5000);
    cast(2, { x: 20, y: 20 });
    expect(z.pos.x).toBeGreaterThan(22);
    const far = placeZombie(sim, 'brute', 26, 24, 5000);
    const hp = far.hp;
    cast(3, far.pos);
    run(sim, 20);
    expect(far.hp).toBeLessThan(hp);
  });

  it('Glücksbringer: manche Grundangriffe treffen doppelt', () => {
    const { sim, k } = setup();
    const z = placeZombie(sim, 'brute', 26, 20, 100000);
    let lucky = 0;
    for (let i = 0; i < 400; i++) {
      sim.step([{ heroId: k.id, type: 'input', move: { x: 0, y: 0 }, aim: z.pos, attack: true }]);
      lucky += sim.state.events.filter((e) => e.type === 'effect' && e.kind === 'lucky').length;
    }
    expect(lucky).toBeGreaterThan(0);
  });
});

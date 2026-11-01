import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { shieldAmount } from '../../src/sim/status';
import { arenaData, noWaves, placeZombie, run, testData } from './helpers';

function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['foerster', 'gloecknerin'], startLevel: 6 });
  const [br, ally] = sim.state.heroes;
  for (const h of [br, ally]) {
    h.maxHp = 1000;
    h.hp = 1000;
    h.ranks = [1, 1, 1, 1];
    h.cooldowns = [0, 0, 0, 0];
  }
  br.pos = { x: 20, y: 20 };
  ally.pos = { x: 20, y: 26 };
  const cast = (slot: number, aim: { x: number; y: number }) => sim.step([{ heroId: br.id, type: 'cast', slot, aim }]);
  return { sim, br, ally, cast };
}

describe('Förster Bruno', () => {
  it('ist ein Tank mit vier Fähigkeiten', () => {
    const data = testData();
    expect(data.heroes.find((h) => h.id === 'foerster')!.abilities).toHaveLength(4);
    expect(data.bots.heroes.foerster.teamRole).toBe('tank');
  });

  it('Baumstamm trifft auf der Linie und stößt zurück', () => {
    const { sim, cast } = setup();
    const z = placeZombie(sim, 'brute', 23, 20, 5000);
    const hp = z.hp;
    cast(0, { x: 28, y: 20 });
    expect(z.hp).toBeLessThan(hp);
    expect(z.pos.x).toBeGreaterThan(23.5);
  });

  it('Lockruf: Zombies greifen ihn an, Schild wächst mit der Zahl', () => {
    const { sim, br, ally, cast } = setup();
    const zs = [placeZombie(sim, 'walker', 22, 21), placeZombie(sim, 'walker', 18, 19), placeZombie(sim, 'walker', 21, 23)];
    for (const z of zs) z.targetId = ally.id;
    cast(1, br.pos);
    expect(zs.every((z) => z.targetId === br.id)).toBe(true);
    const base = sim.heroDefs.get('foerster')!.abilities[1].values.shield as number[];
    expect(shieldAmount(br)).toBeGreaterThan(base[0]);
  });

  it('Wurzelwerk hält fest', () => {
    const { sim, cast } = setup();
    const z = placeZombie(sim, 'walker', 25, 20, 5000);
    cast(2, z.pos);
    expect(z.st.rootUntil).toBeGreaterThan(sim.state.time);
  });

  it('Holz fällen: erst Warnung, dann Schaden und Betäubung auf der Linie', () => {
    const { sim, cast } = setup();
    const z = placeZombie(sim, 'brute', 26, 20, 5000);
    const hp = z.hp;
    cast(3, { x: 30, y: 20 });
    expect(z.hp).toBe(hp);
    run(sim, 20);
    expect(z.hp).toBeLessThan(hp);
    expect(z.st.stunUntil).toBeGreaterThan(sim.state.time);
  });

  it('Dickes Fell: weniger Schaden, bei wenig Leben noch weniger', () => {
    const { sim, br } = setup();
    const full = applyDamage(sim, br, 100);
    br.hp = 300;
    const low = applyDamage(sim, br, 100);
    expect(full).toBeLessThan(85); // Passiv 10 % plus Tank-Rolle
    expect(low).toBeLessThan(full);
  });
});

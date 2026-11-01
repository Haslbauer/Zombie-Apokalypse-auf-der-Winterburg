import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { shieldAmount } from '../../src/sim/status';
import { arenaData, noWaves, placeZombie, testData } from './helpers';

function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['gloecknerin', 'rotschopf'], startLevel: 6 });
  const [hw, ally] = sim.state.heroes;
  for (const h of [hw, ally]) {
    h.maxHp = 1000;
    h.hp = 1000;
    h.ranks = [1, 1, 1, 1];
    h.cooldowns = [0, 0, 0, 0];
  }
  hw.pos = { x: 20, y: 20 };
  ally.pos = { x: 23, y: 20 };
  const cast = (slot: number, aim: { x: number; y: number }) => sim.step([{ heroId: hw.id, type: 'cast', slot, aim }]);
  return { sim, hw, ally, cast };
}

describe('Glöcknerin Hedwig', () => {
  it('ist ein Support mit Daten, Bot-Hinweisen und vier Fähigkeiten', () => {
    const data = testData();
    const def = data.heroes.find((h) => h.id === 'gloecknerin')!;
    expect(def.abilities).toHaveLength(4);
    expect(data.bots.heroes.gloecknerin.teamRole).toBe('support');
  });

  it('Weckruf betäubt Zombies im Kegel', () => {
    const { sim, hw, cast } = setup();
    const z = placeZombie(sim, 'brute', 23, 20, 5000);
    hw.facing = 0;
    const hp = z.hp;
    cast(0, z.pos);
    expect(z.hp).toBeLessThan(hp);
    expect(z.st.stunUntil).toBeGreaterThan(sim.state.time);
  });

  it('Glockenschlag heilt, Schutzglocke schirmt Mitspieler ab', () => {
    const { ally, cast } = setup();
    ally.hp = 500;
    cast(1, ally.pos);
    expect(ally.hp).toBeGreaterThan(500);
    cast(2, ally.pos);
    expect(shieldAmount(ally)).toBeGreaterThan(0);
  });

  it('Sturmgeläut: Furcht für Zombies, Tempo für Mitspieler', () => {
    const { sim, ally, cast } = setup();
    const z = placeZombie(sim, 'walker', 24, 22, 5000);
    cast(3, { x: 20, y: 20 });
    expect(z.st.fearUntil).toBeGreaterThan(sim.state.time);
    expect(ally.buffs.some((b) => b.kind === 'haste' && b.value > 0)).toBe(true);
  });

  it('Abendläuten: jeder dritte Treffer heilt den schwächsten Mitspieler', () => {
    const { sim, hw, ally } = setup();
    ally.hp = 400;
    const z = placeZombie(sim, 'brute', 26, 20, 50000);
    for (let i = 0; i < 100; i++) sim.step([{ heroId: hw.id, type: 'input', move: { x: 0, y: 0 }, aim: z.pos, attack: true }]);
    expect(ally.hp).toBeGreaterThan(400 + 25);
  });
});

import { describe, expect, it } from 'vitest';
import { Simulation, heroPushShare } from '../../src/sim/game';
import { arenaData, noWaves, placeZombie, testData } from './helpers';

/** Held läuft 2 s gegen einen stehenden Gegner; wie weit wurde der Gegner verschoben? */
function shove(defId: string): { moved: number; heroX: number } {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['rotschopf'] });
  const h = sim.state.heroes[0];
  h.pos = { x: 20, y: 20 };
  const z = placeZombie(sim, defId, 21.2, 20, 1e6);
  z.speed = 0; // steht still (z. B. betäubt)
  z.st.stunUntil = 1e9;
  const start = z.pos.x;
  for (let i = 0; i < 40; i++) sim.step([{ heroId: h.id, type: 'input', move: { x: 1, y: 0 }, aim: { x: 30, y: 20 }, attack: false }]);
  return { moved: z.pos.x - start, heroX: h.pos.x };
}

describe('Helden schieben Zombies nicht einfach weg', () => {
  it('Anteil nach Gewicht: Bosse fast gar nicht, kleine Gegner leicht', () => {
    const data = testData();
    const def = (id: string) => data.zombies.find((z) => z.id === id);
    const hero = { radius: 0.45 };
    expect(heroPushShare(def('schlaechter'), hero, { radius: 1 })).toBeGreaterThan(0.9);
    expect(heroPushShare(def('walker'), hero, { radius: 0.45 })).toBeCloseTo(0.75);
    expect(heroPushShare(def('ratte'), hero, { radius: 0.25 })).toBeLessThan(0.5);
  });

  it('Ein Held läuft nicht durch einen Zombie und schiebt ihn nur ein Stück', () => {
    const walker = shove('walker');
    // früher wurde der Zombie in 2 s etwa 10 m weit geschoben
    expect(walker.moved).toBeLessThan(3.5);
    const boss = shove('schlaechter');
    expect(boss.moved).toBeLessThan(0.8);
    expect(boss.heroX).toBeLessThan(21);
  });
});

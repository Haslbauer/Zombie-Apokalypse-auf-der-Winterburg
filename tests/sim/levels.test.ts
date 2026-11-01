import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { spawnZombieAt, waveQueue } from '../../src/sim/waves';
import { testData } from './helpers';

describe('Schwierigkeitsstufen', () => {
  it('Albtraum: mehr Zombies, Bosse zäher, mehr Schaden; Entspannt umgekehrt', () => {
    const cfg = testData().waves;
    const count = (level: 'entspannt' | 'normal' | 'albtraum') => waveQueue({ rng: 7, level }, 8, cfg).filter((e) => !e.startsWith('pack:') && !e.startsWith('elite:')).length;
    expect(count('albtraum')).toBeGreaterThan(count('normal'));
    expect(count('entspannt')).toBeLessThan(count('normal'));
    const stats = (level: 'entspannt' | 'normal' | 'albtraum') => {
      const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'], level });
      const boss = spawnZombieAt(sim, sim.zombieDefs.get('schlaechter')!, { x: 10, y: 10 });
      const walker = spawnZombieAt(sim, sim.zombieDefs.get('walker')!, { x: 12, y: 10 });
      return { bossHp: boss.maxHp, walkerHp: walker.maxHp, dmg: walker.damage };
    };
    const n = stats('normal');
    const a = stats('albtraum');
    const e = stats('entspannt');
    expect(a.bossHp).toBeCloseTo(n.bossHp * 1.35, -1);
    expect(a.walkerHp).toBe(n.walkerHp);
    expect(a.dmg).toBeCloseTo(n.dmg * 1.3, 6);
    expect(e.dmg).toBeCloseTo(n.dmg * 0.75, 6);
  });
});

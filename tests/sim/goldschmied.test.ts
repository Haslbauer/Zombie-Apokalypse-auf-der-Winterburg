import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { heroDamage } from '../../src/sim/progression';
import { arenaData, noWaves, placeZombie, run } from './helpers';

function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['goldschmied', 'rotschopf'], startLevel: 6 });
  const [au, ally] = sim.state.heroes;
  for (const h of [au, ally]) {
    h.maxHp = h.hp = 1000;
    h.ranks = [1, 1, 1, 1];
    h.cooldowns = [0, 0, 0, 0];
  }
  au.pos = { x: 20, y: 20 };
  ally.pos = { x: 24, y: 20 };
  au.gold = 0;
  const cast = (slot: number, aim: { x: number; y: number }) => sim.step([{ heroId: au.id, type: 'cast', slot, aim }]);
  return { sim, au, ally, cast };
}

describe('Goldschmied Aurelius', () => {
  it('Feingold: mehr Gold pro Kill, Schaden steigt mit getragenem Gold (gedeckelt)', () => {
    const { sim, au } = setup();
    const z = placeZombie(sim, 'walker', 22, 20, 10);
    applyDamage(sim, z, 100, au);
    expect(au.gold).toBe(Math.round(sim.zombieDefs.get('walker')!.gold * 1.15));
    au.gold = 0;
    const base = heroDamage(sim, au, 100);
    au.gold = 1000;
    expect(heroDamage(sim, au, 100)).toBeCloseTo(base * 1.1, 6);
    au.gold = 100000;
    expect(heroDamage(sim, au, 100)).toBeCloseTo(base * 1.25, 6);
  });

  it('Goldnugget schlägt 1 Ziel dahinter durch', () => {
    const { sim, au } = setup();
    const a = placeZombie(sim, 'brute', 23, 20, 5000);
    const b = placeZombie(sim, 'brute', 25, 20, 5000);
    const c = placeZombie(sim, 'brute', 27, 20, 5000);
    au.facing = 0;
    sim.step([{ heroId: au.id, type: 'input', move: { x: 0, y: 0 }, aim: { x: 30, y: 20 }, attack: true }]);
    sim.step([{ heroId: au.id, type: 'input', move: { x: 0, y: 0 }, aim: { x: 30, y: 20 }, attack: false }]);
    run(sim, 15);
    expect(a.hp).toBeLessThan(5000);
    expect(b.hp).toBeLessThan(5000);
    expect(c.hp).toBe(5000);
  });

  it('Lötflamme setzt in Brand, Blattgold schützt den Mitspieler, Schmelztiegel verlangsamt', () => {
    const { sim, au, ally, cast } = setup();
    au.facing = 0;
    const z = placeZombie(sim, 'brute', 22.5, 20, 5000);
    cast(0, { x: 25, y: 20 });
    expect(z.st.burnUntil).toBeGreaterThan(sim.state.time);
    cast(1, ally.pos);
    expect(ally.buffs.some((b) => b.kind === 'shield' && b.source === 'blattgold')).toBe(true);
    const w = placeZombie(sim, 'walker', 18, 25);
    cast(2, w.pos);
    run(sim, 3);
    expect(w.st.slowUntil).toBeGreaterThan(sim.state.time);
  });

  it('Goldrausch: Schaden und doppeltes Gold beim Tod', () => {
    const { sim, ally, cast } = setup();
    const z = placeZombie(sim, 'walker', 22, 22, 5000);
    cast(3, z.pos);
    expect(z.hp).toBeLessThan(5000);
    expect(z.st.goldUntil).toBeGreaterThan(sim.state.time);
    const before = ally.gold;
    z.hp = 1;
    applyDamage(sim, z, 10, ally);
    expect(ally.gold - before).toBe(sim.zombieDefs.get('walker')!.gold * 2);
  });
});

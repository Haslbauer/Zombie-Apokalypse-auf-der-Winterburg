import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { blind, fear, root, sleep, slow, stun } from '../../src/sim/status';
import { dist } from '../../src/sim/vec';
import { arenaData, makeSim, noWaves, placeZombie, run } from './helpers';

/** Held in der Mitte (unverwundbar), Walker 1,5 m östlich. */
function setup() {
  const sim = makeSim('rotschopf', 1, arenaData(noWaves));
  const h = sim.state.heroes[0];
  h.maxHp = h.hp = 1e9;
  const z = placeZombie(sim, 'walker', h.pos.x + 4, h.pos.y, 1000);
  return { sim, h, z };
}

describe('Zustände', () => {
  it('schlafende Zombies bewegen sich nicht; Schaden weckt mit Bonus', () => {
    const { sim, z } = setup();
    const start = { ...z.pos };
    sleep(sim, z, 5);
    run(sim, 20);
    expect(z.pos).toEqual(start);
    expect(applyDamage(sim, z, 100)).toBe(150);
    expect(z.st.sleepUntil).toBe(0);
    expect(applyDamage(sim, z, 100)).toBe(100);
    run(sim, 5);
    expect(dist(z.pos, start)).toBeGreaterThan(0);
  });

  it('betäubte Zombies bewegen sich nicht, danach wieder', () => {
    const { sim, z } = setup();
    const start = { ...z.pos };
    stun(sim, z, 1);
    run(sim, 19);
    expect(z.pos).toEqual(start);
    run(sim, 5);
    expect(dist(z.pos, start)).toBeGreaterThan(0);
  });

  it('verlangsamte Zombies laufen langsamer', () => {
    const { sim, z } = setup();
    slow(sim, z, 0.5, 5);
    const start = { ...z.pos };
    sim.step();
    expect(dist(z.pos, start)).toBeCloseTo((z.speed / 20) * 0.5, 5);
  });

  it('verängstigte Zombies laufen weg', () => {
    const { sim, h, z } = setup();
    fear(sim, z, h.pos, 2);
    const before = dist(z.pos, h.pos);
    run(sim, 10);
    expect(dist(z.pos, h.pos)).toBeGreaterThan(before);
  });

  it('festgehaltene Zombies bewegen sich nicht, greifen aber an', () => {
    const { sim, h, z } = setup();
    z.pos = { x: h.pos.x + 1.2, y: h.pos.y };
    root(sim, z, 5);
    const start = { ...z.pos };
    const hp = h.hp;
    run(sim, 30);
    expect(dist(z.pos, start)).toBeLessThan(0.01);
    expect(h.hp).toBeLessThan(hp);
  });

  it('geblendete Zombies verlieren ihr Ziel und verfehlen oft', () => {
    const { sim, h, z } = setup();
    z.pos = { x: h.pos.x + 1.2, y: h.pos.y };
    z.attackTimer = 0;
    blind(sim, z, 1e6);
    let attacks = 0;
    let hits = 0;
    for (let i = 0; i < 20 * 60; i++) {
      z.pos = { x: h.pos.x + 1.2, y: h.pos.y };
      sim.step();
      attacks += sim.state.events.filter((e) => e.type === 'attack' && e.id === z.id).length;
      hits += sim.state.events.filter((e) => e.type === 'hit' && e.targetId === h.id).length;
    }
    expect(attacks).toBeGreaterThan(20);
    expect(hits).toBeLessThan(attacks * 0.75);
    expect(hits).toBeGreaterThan(attacks * 0.25);
  });
});

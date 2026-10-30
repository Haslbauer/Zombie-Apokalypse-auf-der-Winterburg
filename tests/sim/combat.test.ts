import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { makeSim, noWaves, placeZombie, run, testData } from './helpers';

describe('Kampf', () => {
  it('Schaden zieht Leben ab, Tod zählt einen Kill und entfernt den Zombie', () => {
    const sim = makeSim('nahkampf', 1, testData(noWaves));
    const z = placeZombie(sim, 'walker', 5, 5, 50);
    expect(applyDamage(sim, z, 20)).toBe(false);
    expect(z.hp).toBe(30);
    expect(applyDamage(sim, z, 100)).toBe(true);
    expect(z.hp).toBe(0);
    expect(sim.state.kills).toBe(1);
    // Ein toter Zombie nimmt keinen weiteren Schaden.
    expect(applyDamage(sim, z, 10)).toBe(false);
    sim.step();
    expect(sim.state.zombies).toHaveLength(0);
  });

  it('Nahkampf trifft sofort und hält die Abklingzeit ein', () => {
    const sim = makeSim('nahkampf', 1, testData(noWaves));
    const h = sim.state.heroes[0];
    const z = placeZombie(sim, 'brute', h.pos.x + 1.5, h.pos.y, 1000);
    z.speed = 0;
    sim.step([{ heroId: h.id, type: 'attack', targetId: z.id }]);
    const def = sim.heroDefs.get('nahkampf')!.attack;
    expect(z.hp).toBe(1000 - def.damage);
    // 2 Sekunden: Erster Schlag sofort, danach einer pro Abklingzeit.
    run(sim, 40);
    const hits = Math.round((1000 - z.hp) / def.damage);
    expect(hits).toBe(1 + Math.floor(2 / def.cooldown));
  });

  it('Fernkampf: Projektil fliegt zum Ziel, trifft und verschwindet', () => {
    const sim = makeSim('fernkampf', 1, testData(noWaves));
    const h = sim.state.heroes[0];
    const z = placeZombie(sim, 'brute', h.pos.x + 6, h.pos.y, 1000);
    z.speed = 0;
    sim.step([{ heroId: h.id, type: 'attack', targetId: z.id }]);
    expect(sim.state.projectiles).toHaveLength(1);
    expect(z.hp).toBe(1000);
    run(sim, 6);
    expect(z.hp).toBe(1000 - sim.heroDefs.get('fernkampf')!.attack.damage);
    expect(sim.state.projectiles.length).toBeLessThanOrEqual(1);
    expect(sim.state.projectiles.every((p) => p.pos.x < z.pos.x)).toBe(true);
  });

  it('Held läuft zu einem weit entfernten Ziel und greift dann an', () => {
    const sim = makeSim('nahkampf', 1, testData(noWaves));
    const h = sim.state.heroes[0];
    const z = placeZombie(sim, 'walker', 32, 22, 1000);
    z.speed = 0;
    sim.step([{ heroId: h.id, type: 'attack', targetId: z.id }]);
    run(sim, 60);
    expect(z.hp).toBeLessThan(1000);
  });

  it('Stehender Held greift Zombies in Reichweite selbst an', () => {
    const sim = makeSim('fernkampf', 1, testData(noWaves));
    const h = sim.state.heroes[0];
    const z = placeZombie(sim, 'walker', h.pos.x, h.pos.y - 5, 1000);
    z.speed = 0;
    run(sim, 20);
    expect(z.hp).toBeLessThan(1000);
  });

  it('Zombies greifen den Helden an, bei 0 Leben ist das Spiel vorbei', () => {
    const sim = makeSim('nahkampf', 1, testData(noWaves));
    const h = sim.state.heroes[0];
    h.hp = 20;
    placeZombie(sim, 'brute', h.pos.x + 1.25, h.pos.y, 1e6);
    let over = false;
    for (let t = 0; t < 100 && !over; t++) {
      sim.step();
      over = sim.state.gameOver;
    }
    expect(over).toBe(true);
    expect(h.alive).toBe(false);
    expect(h.hp).toBe(0);
    const tick = sim.state.tick;
    sim.step();
    expect(sim.state.tick).toBe(tick);
  });
});

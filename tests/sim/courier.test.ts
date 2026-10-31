import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { applyDamage } from '../../src/sim/combat';
import { courierGold } from '../../src/sim/economy';
import { spawnCourier } from '../../src/sim/waves';
import { noWaves, run, testData } from './helpers';

/** Zwei Helden auf der Winterburg ohne Wellen, Welle 4 läuft (ohne Spawns). */
function courierSim() {
  const sim = new Simulation(testData(noWaves), { seed: 3, heroes: ['rotschopf', 'gaertnerin'] });
  Object.assign(sim.state.wave, { number: 4, phase: 'wave', queue: ['walker'], spawnTimer: 1e9 });
  const z = spawnCourier(sim)!;
  return { sim, z, def: sim.zombieDefs.get('postbote')! };
}

describe('Sidequest Zombie-Postbote', () => {
  it('erscheint ab Welle 3 in jeder dritten Welle, 20 s nach Wellenbeginn', () => {
    const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'] });
    const cfg = sim.data.waves.courier!;
    sim.state.wave.timer = 0;
    sim.step(); // Welle 1 beginnt
    expect(sim.state.wave.courierAt).toBeNull();
    sim.state.wave.phase = 'pause';
    sim.state.wave.number = 2;
    sim.state.wave.timer = 0;
    sim.step();
    expect(sim.state.wave.courierAt).toBeNull();
    sim.state.wave.phase = 'pause';
    sim.state.wave.number = 3;
    sim.state.wave.timer = 0;
    sim.step();
    expect(sim.state.wave.courierAt! - sim.state.time).toBeGreaterThan(cfg.delay - 0.2);
    expect(sim.state.wave.courierAt! - sim.state.time).toBeLessThanOrEqual(cfg.delay);
    run(sim, cfg.delay * 20 + 2);
    const courier = sim.state.zombies.find((z) => z.courier);
    expect(courier).toBeDefined();
    // Er steht im Gelände außerhalb des Gartens
    const g = sim.data.arena.garden!;
    expect(Math.abs(courier!.pos.x - g.x) > g.w / 2 || Math.abs(courier!.pos.y - g.y) > g.h / 2).toBe(true);
  });

  it('läuft seine Runde, zählt nicht zur Welle und greift nicht an', () => {
    const { sim, z } = courierSim();
    const start = { ...z.pos };
    sim.state.wave.queue = [];
    sim.state.zombies = [z];
    sim.data.arena.camps = [];
    run(sim, 20 * 5);
    expect(Math.hypot(z.pos.x - start.x, z.pos.y - start.y)).toBeGreaterThan(5);
    // Welle ist geschafft, obwohl der Postbote noch unterwegs ist
    expect(sim.state.wave.phase).toBe('pause');
    expect(sim.state.zombies).toContain(z);
  });

  it('angegriffen schlägt er zurück, entkommt man ihm, kehrt er um und heilt sich', () => {
    const { sim, z, def } = courierSim();
    const h = sim.state.heroes[0];
    h.pos = { x: z.pos.x + 1.2, y: z.pos.y };
    const hp = h.hp;
    applyDamage(sim, z, 500, h);
    run(sim, 20 * 3);
    expect(z.targetId).toBe(h.id);
    expect(h.hp).toBeLessThan(hp);
    // Held flieht weit weg (in den Innenhof): Postbote kehrt um und ist wieder voll
    h.pos = { ...sim.data.arena.heroStart };
    run(sim, 20 * 10);
    expect(z.targetId).toBeNull();
    expect(z.hp).toBe(z.maxHp);
    expect(def.neutral!.leash).toBeGreaterThan(5);
  });

  it('ist ab Welle 3 stark: allein dauert es lange', () => {
    const { z } = courierSim();
    expect(z.maxHp).toBeGreaterThan(5000);
  });

  it('erwischt: alle Helden bekommen Gold, auch weit weg', () => {
    const { sim, z, def } = courierSim();
    const [a, b] = sim.state.heroes;
    b.pos = { x: 30, y: 60 };
    const gold = courierGold(sim, def);
    const before = [a.gold, b.gold];
    applyDamage(sim, z, z.hp + 1, a);
    // a hat ihn erlegt: dazu Boss-Gold (Kill + Erstes Blut, siehe bosses.test.ts)
    const boss = sim.state.events.find((e) => e.type === 'bossKill');
    expect(boss).toMatchObject({ killerId: a.id });
    expect(a.gold).toBe(before[0] + gold + (boss?.type === 'bossKill' ? boss.gold : 0));
    expect(b.gold).toBe(before[1] + gold);
    expect(sim.state.events).toContainEqual(expect.objectContaining({ type: 'courier', phase: 'caught', gold }));
  });

  it('nach seiner Zeit ist er weg, ohne Belohnung', () => {
    const { sim, z, def } = courierSim();
    const gold = sim.state.heroes[0].gold;
    run(sim, def.courier!.stay * 20 + 2);
    expect(sim.state.zombies).not.toContain(z);
    expect(sim.state.heroes[0].gold).toBe(gold);
  });
});

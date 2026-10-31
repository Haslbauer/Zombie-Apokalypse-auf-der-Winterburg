import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { applyDamage } from '../../src/sim/combat';
import { courierGold } from '../../src/sim/economy';
import { spawnCourier } from '../../src/sim/waves';
import { noWaves, run, testData } from './helpers';

/** Zwei Helden auf der Winterburg ohne Wellen, Welle 6 läuft (ohne Spawns). */
function courierSim() {
  const sim = new Simulation(testData(noWaves), { seed: 3, heroes: ['rotschopf', 'gaertnerin'] });
  Object.assign(sim.state.wave, { number: 6, phase: 'wave', queue: ['walker'], spawnTimer: 1e9 });
  const z = spawnCourier(sim)!;
  return { sim, z, def: sim.zombieDefs.get('postbote')! };
}

describe('Sidequest Zombie-Postbote', () => {
  /** Pause beenden und Welle n beginnen lassen. */
  const startWave = (sim: Simulation, n: number) => {
    sim.state.wave.phase = 'pause';
    sim.state.wave.number = n;
    sim.state.wave.timer = 0;
    sim.step();
  };

  it('erscheint erst ab Welle 6, 20 s nach Wellenbeginn, und bleibt, bis er getötet wird', () => {
    const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'] });
    const cfg = sim.data.waves.courier!;
    expect(cfg.firstWave).toBe(6);
    for (const n of [1, 3, 5]) {
      startWave(sim, n);
      expect(sim.state.wave.courierAt ?? null, `Welle ${n}`).toBeNull();
    }
    startWave(sim, 6);
    expect(sim.state.wave.courierAt! - sim.state.time).toBeGreaterThan(cfg.delay - 0.2);
    run(sim, cfg.delay * 20 + 2);
    const courier = sim.state.zombies.find((z) => z.courier)!;
    expect(courier).toBeDefined();
    const g = sim.data.arena.garden!;
    expect(Math.abs(courier.pos.x - g.x) > g.w / 2 || Math.abs(courier.pos.y - g.y) > g.h / 2).toBe(true);
    // Er verschwindet nicht von selbst, auch nach Minuten nicht; solange er lebt, kommt kein zweiter
    for (let i = 0; i < 20 * 300; i++) sim.step([{ heroId: sim.state.heroes[0].id, type: 'input', move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: i % 2 === 0 }]);
    expect(sim.state.zombies).toContain(courier);
    startWave(sim, 9);
    expect(sim.state.zombies.filter((z) => z.courier).length).toBe(1);
  });

  it('nach seinem Tod kommt 3 Wellen später ein neuer, stärkerer Postbote', () => {
    const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'] });
    startWave(sim, 6);
    run(sim, sim.data.waves.courier!.delay * 20 + 2);
    const first = sim.state.zombies.find((z) => z.courier)!;
    applyDamage(sim, first, first.hp + 1, sim.state.heroes[0]);
    expect(sim.state.wave.courierWave).toBe(9);
    startWave(sim, 7);
    expect(sim.state.wave.courierAt ?? null).toBeNull();
    startWave(sim, 9);
    run(sim, sim.data.waves.courier!.delay * 20 + 2);
    const second = sim.state.zombies.find((z) => z.courier && z.hp > 0)!;
    expect(second).toBeDefined();
    expect(second.maxHp).toBeGreaterThan(first.maxHp);
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

  it('angegriffen schlägt er zurück, entkommt man ihm, kehrt er um (ohne sich zu heilen)', () => {
    const { sim, z, def } = courierSim();
    const h = sim.state.heroes[0];
    h.pos = { x: z.pos.x + 1.2, y: z.pos.y };
    const hp = h.hp;
    applyDamage(sim, z, 500, h);
    run(sim, 20 * 3);
    expect(z.targetId).toBe(h.id);
    expect(h.hp).toBeLessThan(hp);
    // Held flieht weit weg (in den Innenhof): Postbote kehrt um, der Schaden bleibt
    // (im Team soll man ihn auch über mehrere Anläufe schaffen)
    h.pos = { ...sim.data.arena.heroStart };
    run(sim, 20 * 10);
    expect(z.targetId).toBeNull();
    expect(z.hp).toBeLessThan(z.maxHp);
    expect(def.neutral!.leash).toBeGreaterThan(5);
  });

  it('ist in Welle 6 auf Level-6-Helden abgestimmt: viel Leben, harte Treffer, Paketwurf', () => {
    const { z } = courierSim();
    expect(z.maxHp).toBeGreaterThan(5000);
    expect(z.maxHp).toBeLessThan(6500);
    expect(z.damage).toBeGreaterThan(50);
    expect(z.damage).toBeLessThan(75);
  });

  it('Paketwurf: im Kampf landet ein Paket mit Warnzeit auf einem Helden', () => {
    const { sim, z } = courierSim();
    const [h] = sim.state.heroes;
    h.maxHp = h.hp = 1e6;
    h.pos = { x: z.pos.x + 5, y: z.pos.y };
    applyDamage(sim, z, 10, h);
    z.specialTimer = 0;
    let warned = false;
    let landed = false;
    for (let i = 0; i < 40; i++) {
      sim.step();
      if (sim.state.events.some((e) => e.type === 'parcel')) warned = true;
      if (sim.state.events.some((e) => e.type === 'effect' && e.kind === 'parcelLand')) landed = true;
    }
    expect(warned).toBe(true);
    expect(landed).toBe(true);
    expect(h.hp).toBeLessThan(1e6);
  });

  it('erwischt: alle Beteiligten bekommen das Paket-Gold, wer nicht mitgekämpft hat nichts', () => {
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
    expect(b.gold).toBe(before[1]);
    expect(sim.state.events).toContainEqual(expect.objectContaining({ type: 'courier', phase: 'caught', gold }));
  });

});

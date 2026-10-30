import { describe, expect, it } from 'vitest';
import { damageObjective } from '../../src/sim/objectives';
import { makeSim, noWaves, placeZombie, run, testData } from './helpers';

/** Winterburg ohne Wellen, Held weit weg im Nordosten geparkt und unverwundbar. */
function setup() {
  const sim = makeSim('gaertnerin', 1, testData(noWaves));
  const h = sim.state.heroes[0];
  h.pos = { x: 48, y: 8 };
  h.maxHp = h.hp = 1e9;
  const heart = sim.state.objectives.find((o) => o.id === 'heart')!;
  const hive = sim.state.objectives.find((o) => o.id === 'hive')!;
  return { sim, h, heart, hive };
}

describe('Ziele: Herz und Bienenstock', () => {
  it('Zombie vom Bunker läuft durch den Durchgang zum Herz und greift es an (Durchbruch)', () => {
    const { sim, heart } = setup();
    const z = placeZombie(sim, 'runner', 22.8, 53.5, 1e6);
    z.objectiveId = 'heart';
    let breach = false;
    for (let t = 0; t < 20 * 40 && heart.hp === heart.maxHp; t++) {
      sim.step();
      breach ||= sim.state.events.some((e) => e.type === 'breach');
    }
    expect(heart.hp).toBeLessThan(heart.maxHp);
    expect(breach).toBe(true);
  });

  it('Zombie läuft zum Bienenstock und beschädigt ihn, die Bienen werden wütend', () => {
    const { sim, hive } = setup();
    const z = placeZombie(sim, 'brute', 22.8, 53.5, 1e6);
    z.objectiveId = 'hive';
    let angry = false;
    for (let t = 0; t < 20 * 60 && hive.hp === hive.maxHp; t++) {
      sim.step();
      angry ||= sim.state.events.some((e) => e.type === 'beesAngry');
    }
    expect(hive.hp).toBeLessThan(hive.maxHp);
    expect(angry).toBe(true);
  });

  it('Herz auf 0 bedeutet Game Over', () => {
    const { sim, heart } = setup();
    damageObjective(sim, heart, heart.maxHp);
    expect(heart.destroyed).toBe(true);
    expect(sim.state.gameOver).toBe(true);
    expect(sim.state.events).toContainEqual(expect.objectContaining({ type: 'gameOver', reason: 'Herz ist gefallen' }));
  });

  it('Herz regeneriert in der Pause schneller als während der Welle', () => {
    const { sim, heart } = setup();
    heart.hp = 1000;
    run(sim, 20);
    const pauseGain = heart.hp - 1000;
    sim.state.wave.phase = 'wave';
    sim.state.wave.queue = ['walker']; // Welle läuft weiter
    sim.state.wave.spawnTimer = 1e9;
    heart.hp = 1000;
    run(sim, 20);
    const waveGain = heart.hp - 1000;
    expect(pauseGain).toBeCloseTo(10, 5);
    expect(waveGain).toBeCloseTo(2, 5);
  });

  it('ruhige Bienen stechen Zombies, aber keine Helden', () => {
    const { sim, h, hive } = setup();
    h.pos = { x: 22, y: 12 };
    h.hp = 100;
    h.maxHp = 100;
    const z = placeZombie(sim, 'walker', 26, 8.5, 1000);
    z.speed = 0;
    z.damage = 0;
    z.objectiveId = 'heart';
    run(sim, 20);
    expect(z.hp).toBeLessThan(1000);
    expect(h.hp).toBe(100);
    expect(hive.aggroUntil).toBe(0);
  });

  it('nach Schaden am Stock stechen die Bienen auch Helden und beruhigen sich wieder', () => {
    const { sim, h, hive } = setup();
    const bees = sim.data.arena.objectives.find((o) => o.id === 'hive')!.bees!;
    h.pos = { x: 22, y: 12 };
    h.maxHp = h.hp = 1000;
    damageObjective(sim, hive, 10);
    run(sim, 20);
    expect(h.hp).toBeLessThan(1000);
    run(sim, bees.aggroDuration * 20);
    const hp = h.hp;
    run(sim, 20);
    // Wieder ruhig: kein weiterer Schaden (nur Regeneration).
    expect(h.hp).toBeGreaterThanOrEqual(hp);
  });

  it('zerstörter Bienenstock ist kein Game Over, seine Zombies laufen dann zum Herz', () => {
    const { sim, hive } = setup();
    const z = placeZombie(sim, 'walker', 22, 30, 1e6);
    z.objectiveId = 'hive';
    damageObjective(sim, hive, hive.maxHp);
    expect(hive.destroyed).toBe(true);
    expect(sim.state.gameOver).toBe(false);
    sim.step();
    expect(z.objectiveId).toBe('heart');
  });
});

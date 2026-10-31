import { describe, expect, it } from 'vitest';
import { damageObjective, harvest } from '../../src/sim/objectives';
import { spawnZombieAt } from '../../src/sim/waves';
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
    expect(sim.state.events).toContainEqual(expect.objectContaining({ type: 'gameOver', reason: 'Der Lebensmittelvorrat ist geplündert' }));
  });

  it('Vorrat regeneriert nicht von selbst, die Ernte der Hochbeete füllt ihn auf', () => {
    const { sim, heart } = setup();
    heart.hp = 1000;
    run(sim, 40);
    expect(heart.hp).toBe(1000);
    const beds = sim.state.objectives.filter((o) => o.kind === 'bed');
    const def = sim.data.arena.objectives.find((o) => o.kind === 'bed')!;
    beds[0].hp = beds[0].maxHp / 2; // angefressen: halbe Ernte
    harvest(sim);
    expect(heart.hp).toBeCloseTo(1000 + def.harvest! * (beds.length - 0.5), 5);
    expect(sim.state.events).toContainEqual(expect.objectContaining({ type: 'harvest' }));
  });

  it('zerstörtes Hochbeet erntet nichts und wächst nach zwei Wellen nach', () => {
    const { sim, heart } = setup();
    const beds = sim.state.objectives.filter((o) => o.kind === 'bed');
    for (const b of beds) damageObjective(sim, b, b.maxHp);
    expect(sim.state.gameOver).toBe(false);
    heart.hp = 1000;
    harvest(sim); // 1. Welle danach
    expect(heart.hp).toBe(1000);
    expect(beds.every((b) => b.destroyed)).toBe(true);
    harvest(sim); // 2. Welle: nachgewachsen
    expect(beds.every((b) => !b.destroyed && b.hp === b.maxHp)).toBe(true);
    expect(sim.state.events.filter((e) => e.type === 'regrow')).toHaveLength(beds.length);
  });

  it('ohne Bienenstock wachsen zerstörte Beete nicht mehr nach', () => {
    const { sim } = setup();
    const beds = sim.state.objectives.filter((o) => o.kind === 'bed');
    const hive = sim.state.objectives.find((o) => o.kind === 'hive')!;
    damageObjective(sim, hive, hive.maxHp);
    damageObjective(sim, beds[0], beds[0].maxHp);
    for (let i = 0; i < 5; i++) harvest(sim);
    expect(beds[0].destroyed).toBe(true);
    expect(beds.slice(1).every((b) => !b.destroyed)).toBe(true);
  });

  it('Zombies wählen den Vorrat, Ratten Beete oder Stock, Hornissen den Stock', () => {
    const sim = makeSim('rotschopf', 4, testData());
    const pick = (type: string) => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < 200; i++) {
        const z = spawnZombieAt(sim, sim.zombieDefs.get(type)!, { x: 30, y: 50 });
        counts[z.objectiveId] = (counts[z.objectiveId] ?? 0) + 1;
      }
      sim.state.zombies = [];
      return counts;
    };
    expect(Object.keys(pick('walker'))).toEqual(['heart']);
    expect(Object.keys(pick('hornisse'))).toEqual(['hive']);
    const rats = pick('ratte');
    expect(rats.bed).toBeGreaterThan(rats.hive);
    expect(rats.hive).toBeGreaterThan(10);
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

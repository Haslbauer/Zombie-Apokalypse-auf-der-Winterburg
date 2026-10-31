import { describe, expect, it } from 'vitest';
import { enrageFactor } from '../../src/sim/bossabilities';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import type { GameEvent } from '../../src/sim/types';
import { arenaData, noWaves, placeZombie } from './helpers';

function setup(heroes = ['grimm']) {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes });
  sim.state.heroes.forEach((h, i) => {
    h.maxHp = h.hp = 5000;
    h.pos = { x: 20, y: 20 + i * 3 };
  });
  return sim;
}
/** Ticks laufen lassen und alle Ereignisse sammeln. */
function collect(sim: Simulation, ticks: number, each?: () => void): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    each?.();
    sim.step();
    all.push(...sim.state.events);
  }
  return all;
}

describe('Zwischenbosse', () => {
  it('Hackbeil: erst Warnung am Ziel, wer stehen bleibt, wird getroffen', () => {
    const sim = setup();
    const h = sim.state.heroes[0];
    const z = placeZombie(sim, 'schlaechter', 21.6, 20, 100000);
    z.abil = { timers: [0, 99, 99], cast: null };
    z.specialTimer = 99; // kein Anlauf
    const events = collect(sim, 30, () => (h.input = { move: { x: 0, y: 0 }, aim: z.pos, attack: false }));
    const cast = events.find((e) => e.type === 'bossCast');
    expect(cast).toMatchObject({ kind: 'slam', name: 'Hackbeil' });
    expect(events.some((e) => e.type === 'bossHit')).toBe(true);
    expect(h.hp).toBeLessThan(5000 - 80);
  });

  it('Hackbeil: wer aus der Warnung läuft, weicht aus', () => {
    const sim = setup();
    const h = sim.state.heroes[0];
    const z = placeZombie(sim, 'schlaechter', 21.6, 20, 100000);
    z.abil = { timers: [0, 99, 99], cast: null };
    z.specialTimer = 99;
    sim.step();
    expect(z.abil.cast).not.toBeNull();
    // weglaufen
    const events = collect(sim, 24, () => (h.input = { move: { x: -1, y: 0 }, aim: { x: 0, y: 20 }, attack: false }));
    const hit = events.find((e) => e.type === 'bossHit');
    expect(hit).toBeDefined();
    expect(sim.state.heroes[0].stats!.damageTaken).toBeLessThan(80);
  });

  it('Wut nach 40 s: mehr Schaden, angezeigt', () => {
    const sim = setup();
    const z = placeZombie(sim, 'daemon', 30, 30);
    z.bornAt = sim.state.time;
    expect(enrageFactor(sim, z)).toBe(1);
    sim.state.time += 60;
    const f = enrageFactor(sim, z);
    expect(f).toBeCloseTo(1 + 20 * sim.data.waves.bossEnrage!.perSecond, 6);
    expect(z.st.enrageUntil).toBeGreaterThan(sim.state.time);
  });

  it('Boss erlegt: Team-Buff für alle lebenden Helden', () => {
    const sim = setup(['grimm', 'rotschopf', 'gaertnerin']);
    const [a, b, c] = sim.state.heroes;
    c.alive = false;
    const z = placeZombie(sim, 'schlaechter', 22, 20, 10);
    applyDamage(sim, z, 100, a);
    const ev = sim.state.events.find((e) => e.type === 'teamBuff');
    expect(ev).toMatchObject({ defId: 'schlaechter', name: 'Blutrausch' });
    for (const h of [a, b]) expect(h.buffs.find((x) => x.source === 'team-schlaechter')).toMatchObject({ kind: 'damageMult', value: 1.2 });
    expect(c.buffs.some((x) => x.source === 'team-schlaechter')).toBe(false);
  });
});

describe('Endgegner Bauamt', () => {
  it('kommt ab Welle 15 in jeder Welle, vorher nicht', async () => {
    const { waveQueue } = await import('../../src/sim/waves');
    const { testData } = await import('./helpers');
    const cfg = testData().waves;
    const has = (n: number) => waveQueue({ rng: 3 }, n, cfg).includes('elite:bauamt');
    expect(has(14)).toBe(false);
    expect(has(15)).toBe(true);
    expect(has(18)).toBe(true);
    expect(has(20)).toBe(true);
  });

  it('Sieg in der letzten Welle erst, wenn das Bauamt fällt', async () => {
    const { testData, placeZombie: place } = await import('./helpers');
    const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'] });
    const last = sim.data.waves.victoryWave!;
    Object.assign(sim.state.wave, { number: last, phase: 'wave', queue: [] });
    sim.state.zombies = sim.state.zombies.filter((z) => z.neutral);
    const boss = place(sim, 'bauamt', 5, 5, 10);
    sim.step();
    expect(sim.state.gameOver).toBe(false);
    applyDamage(sim, boss, 1000, sim.state.heroes[0]);
    sim.step();
    expect(sim.state.victory).toBe(true);
    const over = sim.state.events.find((e) => e.type === 'gameOver');
    expect(over).toMatchObject({ reason: expect.stringContaining('Bauamt') });
  });
});

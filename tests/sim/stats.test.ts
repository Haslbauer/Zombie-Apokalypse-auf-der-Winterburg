import { describe, expect, it } from 'vitest';
import { encodeSnapshot } from '../../src/net/protocol';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { damageObjective } from '../../src/sim/objectives';
import { DEFAULT_MVP, finalStats, mvpScore, statsOf } from '../../src/sim/stats';
import type { GameEvent } from '../../src/sim/types';
import { arenaData, noWaves, placeZombie, run, testData } from './helpers';

function setup(heroes = ['rotschopf', 'gaertnerin']) {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes, startLevel: 5 });
  for (const h of sim.state.heroes) {
    h.maxHp = h.hp = 1000;
    h.pos = { x: 20, y: 20 };
  }
  return sim;
}
const gameOverOf = (events: GameEvent[]) => events.find((e) => e.type === 'gameOver') as Extract<GameEvent, { type: 'gameOver' }> | undefined;

describe('Endstatistik', () => {
  it('zählt Schaden, erlittenen Schaden, Tode und Serien', () => {
    const sim = setup();
    const [a, b] = sim.state.heroes;
    sim.state.wave.number = 3;
    const z1 = placeZombie(sim, 'walker', 22, 20, 100);
    const z2 = placeZombie(sim, 'walker', 22, 21, 100);
    applyDamage(sim, z1, 60, a);
    applyDamage(sim, z1, 60, a); // nur noch 40 Leben übrig
    applyDamage(sim, z2, 500, a);
    expect(statsOf(a).damage).toBeCloseTo(200);
    expect(statsOf(a).killsPerWave).toEqual([0, 0, 2]);
    expect(statsOf(a).bestStreak).toBe(2);
    // Held stirbt: Tod gezählt, Serie endet, beste Serie bleibt
    applyDamage(sim, a, 400);
    expect(statsOf(a).damageTaken).toBeCloseTo(400);
    applyDamage(sim, a, 5000);
    expect(statsOf(a).deaths).toBe(1);
    expect(statsOf(a).streak).toBe(0);
    expect(statsOf(a).bestStreak).toBe(2);
    expect(statsOf(b).damage).toBe(0);
  });

  it('Heilung zählt für den Heiler (Heilen-Zauber, Kräutertee), nicht über das Maximum', () => {
    const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['rotschopf', 'gaertnerin'], spells: [['heilen', 'geist']], startLevel: 6 });
    const [a, g] = sim.state.heroes;
    for (const h of sim.state.heroes) {
      h.maxHp = 1000;
      h.pos = { x: 20, y: 20 };
    }
    a.hp = 400;
    g.hp = 990;
    sim.step([{ heroId: a.id, type: 'spell', slot: 0, aim: a.pos }]);
    // Rotschopf heilt sich voll, die Gärtnerin nur um 10 (fast voll)
    const healed = statsOf(a).healing;
    expect(healed).toBeGreaterThan(0);
    expect(g.hp).toBe(1000);
    expect(healed).toBeCloseTo(a.hp - 400 + 10, 0);
    // Kräutertee der Gärtnerin (Fähigkeit 3) heilt über Zeit
    a.hp = 300;
    g.ranks[2] = Math.max(1, g.ranks[2]);
    g.cooldowns[2] = 0;
    sim.step([{ heroId: g.id, type: 'cast', slot: 2, aim: g.pos }]);
    run(sim, 40);
    expect(statsOf(g).healing).toBeGreaterThan(0);
    expect(statsOf(g).casts).toBeGreaterThanOrEqual(1);
  });

  it('Wertung: Bosse und Kills zählen, Tode ziehen ab, nie unter 0', () => {
    const base = { kills: 0, bosses: 0, assists: 0, gold: 0 };
    const s = { damage: 0, damageTaken: 0, healing: 0, deaths: 0, streak: 0, bestStreak: 0, killsPerWave: [], casts: 0, goldSpent: 0 };
    expect(mvpScore({ ...base, bosses: 1 }, s)).toBeGreaterThan(mvpScore({ ...base, kills: 4 }, s));
    expect(mvpScore({ ...base, kills: 10 }, { ...s, deaths: 3 })).toBe(7);
    expect(mvpScore(base, { ...s, deaths: 5 })).toBe(0);
    expect(mvpScore(base, { ...s, damage: 4000 }, DEFAULT_MVP)).toBe(10);
  });

  it('Niederlage: gameOver bringt Statistik aller Helden (nach Wertung) und Teamwerte', () => {
    const sim = new Simulation(testData(noWaves), { seed: 1, heroes: ['gaertnerin', 'rotschopf'] });
    const [, a] = sim.state.heroes;
    const z = placeZombie(sim, 'walker', 22, 20, 50);
    applyDamage(sim, z, 100, a);
    const lose = sim.state.objectives.find((o) => sim.data.arena.objectives.find((d) => d.id === o.id)?.loseOnDestroy)!;
    damageObjective(sim, lose, lose.hp + 10);
    const e = gameOverOf(sim.state.events);
    expect(e).toBeDefined();
    expect(e!.victory).toBeFalsy();
    expect(e!.stats).toHaveLength(2);
    expect(e!.stats![0].heroId).toBe(a.id); // Rotschopf mit Kill vorne
    expect(e!.stats![0].score.kills).toBe(1);
    expect(e!.stats![0].stats.damage).toBe(50);
    expect(e!.team!.kills).toBe(1);
  });

  it('Sieg: gameOver mit Statistik; im Netz nur im Ereignis, nicht im Schnappschuss', () => {
    const sim = new Simulation(testData(), { seed: 1, heroes: ['rotschopf'] });
    Object.assign(sim.state.wave, { number: sim.data.waves.victoryWave!, phase: 'wave', queue: [] });
    sim.state.zombies = sim.state.zombies.filter((z) => z.neutral);
    sim.step();
    const e = gameOverOf(sim.state.events)!;
    expect(e.victory).toBe(true);
    expect(e.stats![0]).toMatchObject({ defId: 'rotschopf', bot: false });
    expect(e.team!.wave).toBe(sim.data.waves.victoryWave);
    const snap = JSON.parse(encodeSnapshot(sim.state, sim.state.events, sim.data.zombies.map((z) => z.id)));
    expect(snap.heroes[0].stats).toBeUndefined();
    const sent = (snap.events as GameEvent[]).find((x) => x.type === 'gameOver') as typeof e;
    expect(sent.stats![0].score).toEqual(finalStats(sim)[0].score);
  });
});

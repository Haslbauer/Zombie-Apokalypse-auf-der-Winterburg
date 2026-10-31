import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { addXp, canRankUp } from '../../src/sim/progression';
import { arenaData, heroSim, makeSim, noWaves, placeZombie, run } from './helpers';

describe('Level, XP und Skillpunkte', () => {
  it('XP nach Leistung: Killer voll, Zuschauer in der Nähe ein Viertel, weit weg nichts', () => {
    const data = arenaData(noWaves);
    const sim = new Simulation(data, { seed: 1, heroes: ['rotschopf', 'gaertnerin', 'pirat'] });
    const [a, b, far] = sim.state.heroes;
    far.pos = { x: 2, y: 2 };
    const z = placeZombie(sim, 'walker', a.pos.x + 1, a.pos.y, 1);
    // Tötet den Zombie direkt über die Kampflogik.
    a.input = { move: { x: 0, y: 0 }, aim: z.pos, attack: true };
    sim.step();
    const xp = data.zombies.find((d) => d.id === 'walker')!.xp;
    expect(a.xp).toBeCloseTo(xp * data.economy.rewards.xpKiller, 5);
    expect(b.xp).toBeCloseTo(xp * data.economy.rewards.xpNearby, 5);
    expect(far.xp).toBe(0);
  });

  it('Level-up erhöht Leben und gibt einen Skillpunkt', () => {
    const sim = makeSim('rotschopf', 1, arenaData(noWaves));
    const h = sim.state.heroes[0];
    const def = sim.heroDefs.get('rotschopf')!;
    expect(h.level).toBe(1);
    expect(h.skillPoints).toBe(1);
    addXp(sim, h, sim.data.progression.xpToNext[0]);
    expect(h.level).toBe(2);
    expect(h.skillPoints).toBe(2);
    expect(h.maxHp).toBe(def.hp + def.hpPerLevel);
    // Viele XP auf einmal: mehrere Level, höchstens bis 18
    addXp(sim, h, 1e9);
    expect(h.level).toBe(18);
    expect(h.skillPoints).toBe(18);
  });

  it('Skillpunkt-Regeln wie in LoL: Rang höchstens Level/2, Ultimate ab 6, 11, 16', () => {
    const sim = makeSim('rotschopf', 1, arenaData(noWaves));
    const h = sim.state.heroes[0];
    const levelUp = (slot: number) => sim.step([{ heroId: h.id, type: 'levelUp', slot }]);
    levelUp(0);
    expect(h.ranks).toEqual([1, 0, 0, 0]);
    expect(h.skillPoints).toBe(0);
    levelUp(1); // kein Punkt mehr
    expect(h.ranks).toEqual([1, 0, 0, 0]);

    addXp(sim, h, sim.data.progression.xpToNext[0]); // Level 2
    expect(canRankUp(sim, h, 0)).toBe(false); // Rang 2 erst ab Level 3
    expect(canRankUp(sim, h, 3)).toBe(false);
    levelUp(1);
    expect(h.ranks).toEqual([1, 1, 0, 0]);

    while (h.level < 5) addXp(sim, h, sim.data.progression.xpToNext[h.level - 1]);
    expect(canRankUp(sim, h, 3)).toBe(false);
    addXp(sim, h, sim.data.progression.xpToNext[h.level - 1]); // Level 6
    expect(canRankUp(sim, h, 3)).toBe(true);
    levelUp(3);
    expect(h.ranks[3]).toBe(1);
    expect(canRankUp(sim, h, 3)).toBe(false); // Rang 2 erst ab Level 11
  });

  it('Fähigkeiten gehen erst nach dem Lernen und haben eine Abklingzeit', () => {
    const { sim, h, cast, east } = heroSim('rotschopf');
    h.ranks = [0, 0, 0, 0];
    cast(1, east);
    expect(h.cooldowns[1]).toBe(0);
    expect(h.buffs).toHaveLength(0);
    h.ranks[1] = 1;
    cast(1, east);
    expect(h.cooldowns[1]).toBeGreaterThan(15);
    expect(h.buffs.length).toBe(1);
    const buffs = h.buffs.length;
    cast(1, east); // noch in Abklingzeit
    expect(h.buffs.length).toBe(buffs);
    run(sim, 1);
  });

  it('Entwicklermodus: Startlevel setzen', () => {
    const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['pirat'], startLevel: 6 });
    expect(sim.state.heroes[0].level).toBe(6);
    expect(sim.state.heroes[0].skillPoints).toBe(6);
  });
});

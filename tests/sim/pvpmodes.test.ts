import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { spawnZombieAt } from '../../src/sim/waves';
import type { BotDifficulty, PvpGoal } from '../../src/sim/types';
import { run, testData } from './helpers';

function pvp(heroes: string[], teams: number[], opt: { goal?: PvpGoal; zombies?: boolean; bots?: (BotDifficulty | null)[] } = {}) {
  return new Simulation(testData(), { seed: 2, heroes, bots: opt.bots, pvp: { teams, goal: opt.goal, zombies: opt.zombies } });
}

describe('PvP: Kiste erobern', () => {
  it('allein an der Kiste sammelt Punkte, zu zweit umkämpft, Sieg bei toWin', () => {
    const sim = pvp(['grimm', 'rotschopf'], [0, 1], { goal: 'kiste' });
    const crate = sim.state.pvp!.crate!;
    expect(crate).toBeDefined();
    const [a, b] = sim.state.heroes;
    a.pos = { ...crate.pos };
    run(sim, 20 * 5);
    expect(crate.points[0]).toBeCloseTo(5, 0);
    expect(crate.holder).toBe(0);
    expect(sim.state.events.length).toBeGreaterThanOrEqual(0);
    // Gegner kommt dazu: umkämpft, keine Punkte
    b.pos = { x: crate.pos.x + 1, y: crate.pos.y };
    const before = crate.points[0];
    run(sim, 20 * 3);
    expect(crate.contested).toBe(true);
    expect(crate.points[0]).toBeCloseTo(before, 1);
    expect(crate.points[1]).toBe(0);
    // b weg, a hält bis zum Sieg
    b.pos = { ...sim.data.economy.pvp!.spawns[1] };
    crate.points[0] = crate.toWin - 1;
    run(sim, 20 * 2);
    expect(sim.state.gameOver).toBe(true);
    expect(sim.state.pvp!.winner).toBe(0);
  });

  it('im Kistenmodus beenden Kills das Spiel nicht', () => {
    const sim = pvp(['grimm', 'rotschopf'], [0, 1], { goal: 'kiste' });
    sim.state.pvp!.killsToWin = 1;
    const [g, r] = sim.state.heroes;
    sim.step();
    applyDamage(sim, r, 1e6, g);
    expect(sim.state.pvp!.score[0]).toBe(1);
    expect(sim.state.gameOver).toBe(false);
  });
});

describe('PvP: Zombies nebenbei', () => {
  it('Gruppen erscheinen, greifen beide Teams an, Kills bringen Gold, Zombie-Tode keinen Punkt', () => {
    const sim = pvp(['grimm', 'rotschopf'], [0, 1], { zombies: true });
    const roam = () => sim.state.zombies.filter((z) => z.avatarOf === undefined);
    expect(roam()).toHaveLength(0);
    run(sim, 20 * (sim.data.economy.pvp!.roamers!.first + 1));
    expect(roam().length).toBeGreaterThanOrEqual(sim.data.economy.pvp!.roamers!.min);
    expect(roam().every((z) => z.roam)).toBe(true);
    // ein Zombie neben jedem Helden: beide nehmen Schaden
    const [g, r] = sim.state.heroes;
    for (const h of [g, r]) {
      spawnZombieAt(sim, sim.zombieDefs.get('brute')!, { x: h.pos.x + 1, y: h.pos.y }, 'none').roam = { ...h.pos };
    }
    const hp = [g.hp, r.hp];
    run(sim, 20 * 3);
    expect(g.hp).toBeLessThan(hp[0]);
    expect(r.hp).toBeLessThan(hp[1]);
    // Held erlegt einen Zombie: Gold
    const z = roam()[0];
    const gold = g.gold;
    applyDamage(sim, z, 1e6, g);
    expect(g.gold).toBeGreaterThan(gold);
    // Held fällt durch Zombies: kein Punkt
    applyDamage(sim, r, 1e6);
    expect(sim.state.pvp!.score).toEqual([0, 0]);
  });

  it('Angriffe der Helden treffen auch die Zombies', () => {
    const sim = pvp(['pirat', 'rotschopf'], [0, 1], { zombies: true });
    const [p] = sim.state.heroes;
    const z = spawnZombieAt(sim, sim.zombieDefs.get('brute')!, { x: p.pos.x + 3, y: p.pos.y }, 'none');
    const hp = z.hp;
    for (let i = 0; i < 40; i++) sim.step([{ heroId: p.id, type: 'input', move: { x: 0, y: 0 }, aim: z.pos, attack: true }]);
    expect(z.hp).toBeLessThan(hp);
  });
});

describe('PvP: Bots auf leeren Plätzen', () => {
  it('Bots kämpfen gegeneinander und erobern die Kiste', () => {
    const sim = pvp(['rotschopf', 'grimm', 'pirat', 'libero'], [0, 1, 0, 1], { goal: 'kiste', bots: ['mittel', 'mittel', 'mittel', 'mittel'] });
    run(sim, 20 * 120);
    const crate = sim.state.pvp!.crate!;
    expect(crate.points[0] + crate.points[1]).toBeGreaterThan(5);
    const dmg = sim.state.heroes.reduce((n, h) => n + (h.stats?.damageTaken ?? 0), 0);
    expect(dmg).toBeGreaterThan(0);
  });

  it('Bots holen im Kills-Modus Punkte', () => {
    const sim = pvp(['rotschopf', 'grimm'], [0, 1], { bots: ['schwer', 'schwer'] });
    run(sim, 20 * 180);
    expect(sim.state.pvp!.score[0] + sim.state.pvp!.score[1]).toBeGreaterThan(0);
  });
});

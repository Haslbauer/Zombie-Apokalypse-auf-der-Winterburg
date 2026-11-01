import { describe, expect, it } from 'vitest';
import { fillTeam } from '../../src/sim/bots/team';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import { addPlague, missingRoles, threatTarget } from '../../src/sim/roles';
import { arenaData, noWaves, placeZombie, run, testData } from './helpers';

function setup(heroes: string[]) {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes });
  sim.state.heroes.forEach((h, i) => {
    h.maxHp = h.hp = 1000;
    h.pos = { x: 15 + i * 2, y: 20 };
  });
  return sim;
}

describe('Rollen', () => {
  it('Tank nimmt weniger Schaden, Schaden-Rolle trifft Bosse härter (normale Zombies nicht)', () => {
    const sim = setup(['rotschopf', 'grimm']);
    const [tank, dmg] = sim.state.heroes;
    const r = sim.data.economy.roles!;
    expect(applyDamage(sim, tank, 100)).toBeCloseTo(100 * (1 - r.tank.damageReduction), 6);
    expect(applyDamage(sim, dmg, 100)).toBeCloseTo(100, 6);
    const boss = placeZombie(sim, 'schlaechter', 30, 20, 10000);
    const walker = placeZombie(sim, 'walker', 30, 25, 10000);
    expect(applyDamage(sim, boss, 100, dmg)).toBeCloseTo(100 * (1 + r.dmg.bossDamage), 6);
    expect(applyDamage(sim, walker, 100, dmg)).toBeCloseTo(100, 6);
    expect(applyDamage(sim, boss, 100, tank)).toBeCloseTo(100, 6);
  });

  it('Bosse gehen auf den Tank in der Nähe, normale Zombies nicht', () => {
    const sim = setup(['grimm', 'rotschopf']);
    const [dmg, tank] = sim.state.heroes;
    dmg.pos = { x: 24, y: 20 };
    tank.pos = { x: 20, y: 20 };
    const boss = placeZombie(sim, 'schlaechter', 26, 20);
    const walker = placeZombie(sim, 'walker', 26, 21);
    expect(threatTarget(sim, boss, sim.state.heroes)?.id).toBe(tank.id);
    expect(threatTarget(sim, walker, sim.state.heroes)).toBeNull();
  });

  it('Seuche schadet über Zeit; ein Support in der Nähe reinigt und heilt', () => {
    const lonely = setup(['grimm']);
    const g = lonely.state.heroes[0];
    addPlague(lonely, g, 4);
    run(lonely, 40); // 2 s
    expect(g.hp).toBeLessThan(1000 - 4 * lonely.data.economy.plague!.dpsPerStack * 1.5);
    expect(g.plague?.stacks).toBe(4);

    const team = setup(['grimm', 'gaertnerin']);
    const [h, sup] = team.state.heroes;
    sup.pos = { x: h.pos.x + 2, y: h.pos.y };
    h.hp = 800;
    addPlague(team, h, 4);
    run(team, 80); // 4 s: Reinigung alle 3 s
    expect(h.plague).toBeNull();
    expect(h.hp).toBeGreaterThan(800 - 4 * team.data.economy.plague!.dpsPerStack * 3);
    expect(sup.stats!.healing).toBeGreaterThan(0);
  });

  it('fehlende Rollen; Bots füllen sie zuerst auf', () => {
    const d = testData();
    const ctx = { data: d } as Parameters<typeof missingRoles>[0];
    expect(missingRoles(ctx, ['grimm', 'pirat'])).toEqual(['tank', 'support']);
    expect(missingRoles(ctx, ['rotschopf', 'grimm', 'gaertnerin'])).toEqual([]);
    const team = fillTeam(d.bots, ['grimm', 'pirat'], ['libero', 'rotschopf', 'schlaeferin', 'gaertnerin'], 4);
    expect(team.slice(0, 2)).toEqual(['grimm', 'pirat']);
    expect(new Set(team.map((id) => d.bots.heroes[id].teamRole))).toEqual(new Set(['tank', 'dmg', 'support']));
  });
});

describe('Rollen-Kombos', () => {
  it('Schaden-Rolle trifft betäubte Ziele härter', () => {
    const sim = setup(['grimm']);
    const g = sim.state.heroes[0];
    const c = sim.data.economy.roles!.combos!;
    const a = placeZombie(sim, 'walker', 30, 20, 10000);
    const b = placeZombie(sim, 'walker', 32, 20, 10000);
    b.st.stunUntil = sim.state.time + 2;
    expect(applyDamage(sim, b, 100, g) / applyDamage(sim, a, 100, g)).toBeCloseTo(1 + c.controlledBonus, 6);
  });

  it('Support-Heilung und -Schild wirken auf dem Tank stärker', async () => {
    const { healHero } = await import('../../src/sim/stats');
    const { addBuff } = await import('../../src/sim/status');
    const sim = setup(['gaertnerin', 'rotschopf', 'grimm']);
    const [sup, tank, dmg] = sim.state.heroes;
    const c = sim.data.economy.roles!.combos!;
    tank.hp = dmg.hp = 100;
    expect(healHero(sim, tank, 100, sup)).toBeCloseTo(100 * (1 + c.supportOnTank), 6);
    expect(healHero(sim, dmg, 100, sup)).toBeCloseTo(100, 6);
    addBuff(sim, tank, 'shield', 100, 3, 'test', sup.id);
    expect(tank.buffs.find((x) => x.source === 'test')!.value).toBeCloseTo(100 * (1 + c.supportOnTank), 6);
  });

  it('Ping „Brauche Heilung“: nur Support-Bots kommen', async () => {
    const { orderBots } = await import('../../src/sim/bots/brain');
    const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['grimm', 'gaertnerin', 'rotschopf'], bots: [null, 'mittel', 'mittel'] });
    const [me, sup, tank] = sim.state.heroes;
    orderBots(sim, me, 'heal', me.pos);
    expect(sup.bot!.order?.kind).toBe('help');
    expect(tank.bot!.order).toBeFalsy();
  });
});

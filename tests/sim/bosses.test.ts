import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat';
import { Simulation } from '../../src/sim/game';
import type { GameEvent } from '../../src/sim/types';
import { arenaData, noWaves, placeZombie } from './helpers';

/** Drei Helden, keine Wellen; Boss-Gold aus data/economy.json. */
function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['rotschopf', 'pirat', 'libero'] });
  const [a, b, c] = sim.state.heroes;
  for (const h of sim.state.heroes) {
    h.maxHp = h.hp = 1e9;
    h.pos = { x: 40, y: 50 };
  }
  sim.state.wave.number = 4;
  const cfg = sim.data.economy.boss;
  return { sim, a, b, c, cfg, base: cfg.gold + cfg.goldPerWave * 4 };
}

function bossKills(sim: Simulation): Extract<GameEvent, { type: 'bossKill' }>[] {
  return sim.state.events.filter((e): e is Extract<GameEvent, { type: 'bossKill' }> => e.type === 'bossKill');
}

describe('Boss-Kills', () => {
  it('Kill, Assist und Erstes Blut bringen Gold und zählen mit', () => {
    const { sim, a, b, c, cfg, base } = setup();
    const z = placeZombie(sim, 'schlaechter', 60, 50, 100);
    const gold = sim.state.heroes.map((h) => h.gold);
    sim.state.events = [];
    applyDamage(sim, z, 40, b); // Assist
    applyDamage(sim, z, 100, a); // letzter Treffer
    const [e] = bossKills(sim);
    expect(e).toMatchObject({ killerId: a.id, assists: [b.id], firstBlood: true, gold: base + cfg.firstBlood });
    // Killer: Kill-Gold des Schlächters plus Boss-Gold; Mitkämpfer: Anteile von beidem; Zuschauer: nichts
    const killGold = sim.zombieDefs.get('schlaechter')!.gold;
    const rw = sim.data.economy.rewards;
    expect(a.gold - gold[0]).toBe(killGold + base + cfg.firstBlood);
    expect(b.gold - gold[1]).toBe(Math.round(killGold * rw.assistGold) + Math.round(base * cfg.assistShare));
    expect(c.gold).toBe(gold[2]);
    expect(a.score).toMatchObject({ kills: 1, bosses: 1, assists: 0, gold: killGold + base + cfg.firstBlood });
    expect(b.score).toMatchObject({ kills: 0, bosses: 0, assists: 1 });

    // Zweiter Boss: kein Erstes Blut mehr
    const z2 = placeZombie(sim, 'rattenkoenig', 60, 50, 10);
    sim.state.events = [];
    applyDamage(sim, z2, 50, c);
    expect(bossKills(sim)[0]).toMatchObject({ killerId: c.id, firstBlood: false, gold: base });
    expect(c.score.bosses).toBe(1);
  });

  it('Beteiligung verfällt nach dem Assist-Fenster', () => {
    const { sim, a, b, cfg } = setup();
    const z = placeZombie(sim, 'schlaechter', 60, 50, 100);
    applyDamage(sim, z, 10, b);
    sim.state.time += cfg.assistWindow + 1;
    sim.state.events = [];
    applyDamage(sim, z, 100, a);
    expect(bossKills(sim)[0].assists).toEqual([]);
    expect(b.score.assists).toBe(0);
  });

  it('normale Zombies zählen als Kill, aber nicht als Boss', () => {
    const { sim, a } = setup();
    const z = placeZombie(sim, 'walker', 41, 50, 10);
    sim.state.events = [];
    applyDamage(sim, z, 50, a);
    expect(bossKills(sim)).toEqual([]);
    expect(a.score).toMatchObject({ kills: 1, bosses: 0 });
    expect(z.contrib?.map((c) => c.id)).toEqual([a.id]);
  });
});

import { describe, expect, it } from 'vitest';
import { defaultTeam } from '../../src/sim/bots/team';
import { Simulation } from '../../src/sim/game';
import { addXp } from '../../src/sim/progression';
import type { BotDifficulty } from '../../src/sim/types';
import { dist } from '../../src/sim/vec';
import { noWaves, placeZombie, run, testData } from './helpers';

/** Ein einzelner Bot auf der Winterburg, ohne Wellen. */
function botSim(heroId: string, difficulty: BotDifficulty = 'schwer', seed = 1) {
  const data = testData(noWaves);
  const sim = new Simulation(data, { seed, heroes: [heroId], bots: [difficulty] });
  const h = sim.state.heroes[0];
  const wave = () => {
    // Welle läuft (ohne Spawns), damit der Bot kämpft statt einzukaufen
    sim.state.wave.phase = 'wave';
    sim.state.wave.queue = ['walker'];
    sim.state.wave.spawnTimer = 1e9;
  };
  return { sim, h, data, wave };
}

describe('Bots', () => {
  it('Team: drei verschiedene Helden mit den Rollen Nahkampf, Fernkampf, Kontrolle', () => {
    const bots = testData().bots;
    for (const player of Object.keys(bots.heroes)) {
      const team = defaultTeam(bots, player);
      expect(team).toHaveLength(3);
      expect(new Set(team).size).toBe(3);
      expect(team).not.toContain(player);
      expect(new Set(team.map((id) => bots.heroes[id].role))).toEqual(new Set(['melee', 'ranged', 'control']));
    }
    expect(defaultTeam(bots, null)).toHaveLength(4);
  });

  it('läuft zu einem Zombie am Herz und greift ihn an', () => {
    const { sim, h, wave } = botSim('rotschopf');
    wave();
    h.pos = { x: 31.3, y: 37 };
    const z = placeZombie(sim, 'brute', 39, 19, 1e6);
    z.speed = 0;
    z.damage = 0;
    run(sim, 20 * 15);
    expect(dist(h.pos, z.pos)).toBeLessThan(4);
    expect(z.hp).toBeLessThan(1e6);
  });

  it('Fernkampf-Bot hält Abstand und schießt', () => {
    const { sim, h, wave } = botSim('gaertnerin');
    wave();
    h.pos = { x: 30, y: 50 };
    const z = placeZombie(sim, 'walker', 31.5, 50, 1e6);
    z.damage = 0;
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      sim.step();
      shots += sim.state.events.filter((e) => e.type === 'shot').length;
    }
    expect(shots).toBeGreaterThan(3);
    expect(dist(h.pos, z.pos)).toBeGreaterThan(2.5);
  });

  it('setzt Skillpunkte nach seiner Reihenfolge, Ultimate ab Level 6', () => {
    const { sim, h, data } = botSim('pirat');
    run(sim, 3);
    const order = data.bots.heroes.pirat.skillOrder;
    expect(h.ranks[order[0]]).toBe(1);
    while (h.level < 6) addXp(sim, h, data.progression.xpToNext[h.level - 1]);
    run(sim, 40);
    expect(h.skillPoints).toBe(0);
    expect(h.ranks[3]).toBe(1);
  });

  it('kauft in der Pause im Innenhof das erste Item seiner Liste', () => {
    const { sim, h, data } = botSim('chupa');
    h.pos = { x: 31.3, y: 37 };
    run(sim, 20 * 10);
    const first = data.bots.heroes.chupa.buy[0];
    expect(h.consumables.some((c) => c?.itemId === first)).toBe(true);
    // genug Gold für die erste Waffe
    h.gold = 1000;
    run(sim, 20 * 3);
    expect(h.inventory).toContain(data.bots.heroes.chupa.buy[1]);
  });

  it('zieht sich bei wenig Leben in den Innenhof zurück und trinkt einen Heiltrank', () => {
    const { sim, h, wave } = botSim('rotschopf');
    wave();
    h.consumables[0] = { itemId: 'heiltrank', count: 2 };
    h.pos = { x: 31.3, y: 40 };
    h.hp = h.maxHp * 0.1;
    run(sim, 20 * 2);
    expect(h.bot!.mode).toBe('retreat');
    expect(h.consumables[0]!.count).toBe(1);
    run(sim, 20 * 6);
    expect(dist(h.pos, sim.data.arena.heroStart)).toBeLessThan(dist({ x: 31.3, y: 40 }, sim.data.arena.heroStart));
  });

  it('nutzt eine Flächenfähigkeit, wenn genug Zombies zusammenstehen', () => {
    const { sim, h, wave } = botSim('gaertnerin');
    wave();
    h.ranks = [1, 1, 1, 0];
    h.pos = { x: 30, y: 50 };
    for (let i = 0; i < 4; i++) {
      const z = placeZombie(sim, 'walker', 36 + (i % 2), 50 + Math.floor(i / 2), 1e6);
      z.speed = 0;
      z.damage = 0;
    }
    let cast = false;
    for (let i = 0; i < 40 && !cast; i++) {
      sim.step();
      cast = sim.state.events.some((e) => e.type === 'cast' && e.slot === 1);
    }
    expect(cast).toBe(true);
  });

  it('Bot-Partien sind deterministisch und flott', () => {
    const play = () => {
      const data = testData();
      const team = defaultTeam(data.bots, null);
      const sim = new Simulation(data, { seed: 5, heroes: team, bots: team.map(() => 'mittel' as const) });
      const t0 = performance.now();
      run(sim, 20 * 90);
      return { json: JSON.stringify(sim.state), ms: (performance.now() - t0) / (20 * 90) };
    };
    const a = play();
    const b = play();
    expect(a.json).toBe(b.json);
    expect(a.ms).toBeLessThan(5);
  });
});

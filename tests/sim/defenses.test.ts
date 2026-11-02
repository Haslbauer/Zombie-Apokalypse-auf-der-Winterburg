import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/game';
import { buildReason, repairCost } from '../../src/sim/defenses';
import type { GameEvent } from '../../src/sim/types';
import { arenaData, noWaves, placeZombie, run, testData } from './helpers';

function setup() {
  const sim = new Simulation(arenaData(noWaves), { seed: 1, heroes: ['rotschopf'] });
  const h = sim.state.heroes[0];
  h.gold = 2000;
  h.pos = { x: 10, y: 10 };
  const build = (kind: 'stacheldraht' | 'barrikade' | 'feuerfass', pos: { x: number; y: number }, rot = 0) => {
    sim.step([{ heroId: h.id, type: 'build', kind, pos, rot }]);
    return sim.state.events.find((e) => e.type === 'defense') as Extract<GameEvent, { type: 'defense' }> | undefined;
  };
  return { sim, h, build };
}

describe('Verteidigungen', () => {
  it('Bauen kostet Gold, auch während der Welle, mit Höchstzahl und Abstand', () => {
    const { sim, h, build } = setup();
    const cost = sim.data.economy.defenses!.stacheldraht.cost;
    expect(build('stacheldraht', { x: 20, y: 20 })?.action).toBe('built');
    expect(h.gold).toBe(2000 - cost);
    expect(build('stacheldraht', { x: 20.5, y: 20 })?.reason).toMatch(/Zu nah/);
    const max = sim.data.economy.defenses!.feuerfass.max;
    // freie Plätze suchen
    const free: { x: number; y: number }[] = [];
    for (let y = 6; y < 36 && free.length <= max; y += 3) for (let x = 6; x < 36 && free.length <= max; x += 3) {
      const p = { x, y };
      if (!buildReason(sim, h, 'feuerfass', p, 0)) free.push(p);
    }
    for (let i = 0; i < max; i++) expect(build('feuerfass', free[i])?.action).toBe('built');
    expect(build('feuerfass', free[max])?.reason).toMatch(/Höchstens/);
    sim.state.wave.phase = 'wave';
    expect(buildReason(sim, h, 'stacheldraht', { x: 30, y: 20 }, 0)).toBeNull();
    // Barrikade nicht auf einen Zombie
    const spot = free.slice(max).concat(free).find((p) => !buildReason(sim, h, 'barrikade', p, 0))!;
    placeZombie(sim, 'walker', spot.x, spot.y, 100).speed = 0;
    expect(buildReason(sim, h, 'barrikade', spot, 0)).toMatch(/Zombie steht im Weg/);
  });

  it('Stacheldraht verlangsamt und verletzt, nutzt sich ab; Feuerfass setzt in Brand', () => {
    const { sim, build } = setup();
    build('stacheldraht', { x: 20, y: 20 });
    build('feuerfass', { x: 30, y: 20 });
    const a = placeZombie(sim, 'brute', 20, 20, 5000);
    const b = placeZombie(sim, 'brute', 30, 21, 5000);
    a.speed = b.speed = 0;
    run(sim, 20);
    expect(a.st.slowUntil).toBeGreaterThan(sim.state.time);
    expect(a.hp).toBeLessThan(5000);
    expect(b.st.burnUntil).toBeGreaterThan(sim.state.time);
    const wire = sim.state.defenses!.find((d) => d.kind === 'stacheldraht')!;
    expect(wire.hp).toBeLessThan(wire.maxHp);
    expect(repairCost(sim)).toBeGreaterThan(0);
  });

  it('Barrikade ist ein Hindernis; Zombies schlagen sie kaputt, danach ist der Weg frei', () => {
    const sim = new Simulation(testData(noWaves), { seed: 1, heroes: ['rotschopf'] });
    const h = sim.state.heroes[0];
    h.gold = 2000;
    const food = sim.state.objectives.find((o) => o.kind === 'food')!;
    // freier Platz 5–9 m vom Vorrat, Barrikade quer zur Richtung, ein Zombie dahinter
    h.pos = { x: 5, y: 5 };
    let pos = { x: 0, y: 0 };
    let rot = 0;
    let away = { x: 0, y: 1 };
    search: for (const d of [5, 6, 7, 8, 9]) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const p = { x: food.pos.x + Math.cos(a) * d, y: food.pos.y + Math.sin(a) * d };
        const r = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 1 : 0;
        if (!buildReason(sim, h, 'barrikade', p, r)) {
          pos = p;
          rot = r;
          away = { x: Math.cos(a), y: Math.sin(a) };
          break search;
        }
      }
    }
    sim.step([{ heroId: h.id, type: 'build', kind: 'barrikade', pos, rot }]);
    expect(sim.state.defenses).toHaveLength(1);
    expect(sim.grid.isBlocked(pos)).toBe(true);
    const bar = sim.state.defenses![0];
    bar.hp = 30;
    const z = placeZombie(sim, 'brute', pos.x + away.x * 1.3, pos.y + away.y * 1.3, 5000);
    z.objectiveId = food.id;
    run(sim, 100);
    expect(sim.state.defenses).toHaveLength(0);
    expect(sim.grid.isBlocked(pos)).toBe(false);
  });

  it('Reparieren stellt alles wieder her und kostet Gold', () => {
    const { sim, h, build } = setup();
    build('stacheldraht', { x: 20, y: 20 });
    const wire = sim.state.defenses![0];
    wire.hp = wire.maxHp / 2;
    const gold = h.gold;
    const cost = repairCost(sim);
    sim.step([{ heroId: h.id, type: 'repair' }]);
    expect(wire.hp).toBe(wire.maxHp);
    expect(h.gold).toBe(gold - cost);
  });
});

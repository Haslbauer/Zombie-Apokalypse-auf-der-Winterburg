import { describe, expect, it } from 'vitest';
import { isSleeping, sleep } from '../../src/sim/status';
import { ratPackCount, waveElites, waveQueue } from '../../src/sim/waves';
import { dist } from '../../src/sim/vec';
import { arenaData, makeSim, noWaves, placeZombie, run, testData } from './helpers';

const cfg = testData().waves;

function setup(heroId = 'rotschopf') {
  const sim = makeSim(heroId, 1, arenaData(noWaves));
  const h = sim.state.heroes[0];
  h.maxHp = h.hp = 1e9;
  return { sim, h };
}

describe('Neue Gegner und Elites', () => {
  it('Kriecher hält den Helden fest; unaufhaltsam schützt davor', () => {
    const { sim, h } = setup();
    const z = placeZombie(sim, 'kriecher', h.pos.x + 1.4, h.pos.y, 1e6);
    z.attackTimer = 0;
    for (let i = 0; i < 40 && !h.buffs.some((b) => b.kind === 'rooted'); i++) sim.step();
    expect(h.buffs.some((b) => b.kind === 'rooted')).toBe(true);
    const start = { ...h.pos };
    sim.step([{ heroId: h.id, type: 'input', move: { x: -1, y: 0 }, aim: start, attack: false }]);
    expect(h.pos.x).toBeCloseTo(start.x, 1);

    const b = setup();
    b.h.ranks[3] = 1;
    b.sim.step([{ heroId: b.h.id, type: 'cast', slot: 3, aim: b.h.pos }]); // Amok
    placeZombie(b.sim, 'kriecher', b.h.pos.x + 1.4, b.h.pos.y, 1e6);
    run(b.sim, 60);
    expect(b.h.buffs.some((x) => x.kind === 'rooted')).toBe(false);
  });

  it('Rattenrudel ab Welle 2, Elites in Welle 5 und 10', () => {
    expect(ratPackCount(1, cfg)).toBe(0);
    expect(ratPackCount(2, cfg)).toBe(1);
    expect(ratPackCount(8, cfg)).toBeGreaterThan(2);
    expect(waveElites(4, cfg)).toEqual([]);
    expect(waveElites(5, cfg)).toEqual(['rattenkoenig']);
    expect(waveElites(10, cfg)).toEqual(['schlaechter', 'rattenkoenig']);
    const q = waveQueue({ rng: 1 }, 5, cfg);
    expect(q.filter((e) => e.startsWith('elite:'))).toEqual(['elite:rattenkoenig']);
    expect(q.filter((e) => e.startsWith('pack:')).length).toBe(ratPackCount(5, cfg));
  });

  it('ein Rattenrudel erscheint gemeinsam an einem Spawnpunkt', () => {
    const sim = makeSim('rotschopf', 3, testData());
    sim.state.wave.number = 2;
    sim.state.wave.timer = 0;
    sim.step();
    sim.state.wave.queue = ['pack:ratte'];
    sim.state.wave.spawnTimer = 0;
    sim.step();
    const rats = sim.state.zombies.filter((z) => z.defId === 'ratte');
    expect(rats.length).toBeGreaterThanOrEqual(cfg.ratPacks!.minSize);
    expect(rats.length).toBeLessThanOrEqual(cfg.ratPacks!.maxSize);
    for (const r of rats) expect(dist(r.pos, rats[0].pos)).toBeLessThan(5);
  });

  it('Rattenkönig ruft Ratten herbei', () => {
    const { sim, h } = setup();
    h.pos = { x: 5, y: 5 };
    const king = placeZombie(sim, 'rattenkoenig', 30, 30, 1e6);
    king.speed = 0;
    run(sim, 20 * 10);
    expect(sim.state.zombies.filter((z) => z.defId === 'ratte').length).toBeGreaterThanOrEqual(4);
  });

  it('Schlächter: Anlauf betäubt den Helden und stößt ihn zurück', () => {
    const { sim, h } = setup();
    const butcher = placeZombie(sim, 'schlaechter', h.pos.x + 6, h.pos.y, 1e6);
    butcher.specialTimer = 0;
    let charged = false;
    let stunned = false;
    const start = { ...h.pos };
    for (let i = 0; i < 60 && !stunned; i++) {
      sim.step();
      charged ||= sim.state.events.some((e) => e.type === 'charge');
      stunned = h.buffs.some((b) => b.kind === 'stunned');
    }
    expect(charged).toBe(true);
    expect(stunned).toBe(true);
    expect(dist(h.pos, start)).toBeGreaterThan(1.5);
    // Betäubt: Angriff und Fähigkeiten gehen nicht
    h.attackTimer = 0;
    sim.step([{ heroId: h.id, type: 'input', move: { x: 0, y: 0 }, aim: butcher.pos, attack: true }]);
    expect(sim.state.events.some((e) => e.type === 'swing')).toBe(false);
  });

  it('Elites schlafen nur halb so lang', () => {
    const { sim } = setup();
    const walker = placeZombie(sim, 'walker', 5, 5);
    const king = placeZombie(sim, 'rattenkoenig', 8, 5);
    sleep(sim, walker, 4);
    sleep(sim, king, 4);
    run(sim, 2 * 20 + 2);
    expect(isSleeping(sim, walker)).toBe(true);
    expect(isSleeping(sim, king)).toBe(false);
  });
});

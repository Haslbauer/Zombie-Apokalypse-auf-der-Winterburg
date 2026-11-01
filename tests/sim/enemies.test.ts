import { describe, expect, it } from 'vitest';
import { isSleeping, sleep } from '../../src/sim/status';
import { packCount, packSize, waveElites, waveQueue } from '../../src/sim/waves';
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

  it('Rattenrudel ab Welle 2, Zwischenbosse ab Welle 3, immer mehr', () => {
    expect(packCount(1, cfg, 'ratte')).toBe(0);
    expect(packCount(2, cfg, 'ratte')).toBe(1);
    expect(packCount(8, cfg, 'ratte')).toBeGreaterThan(2);
    // Hornissen ab Welle 1: anfangs ein kleiner Schwarm, mit jeder Welle größer und mehr
    const hornets = cfg.packs!.find((p) => p.type === 'hornisse')!;
    expect(packCount(1, cfg, 'hornisse')).toBe(1);
    expect(packCount(9, cfg, 'hornisse')).toBe(3);
    expect(packSize(1, hornets, 0)).toBe(2);
    expect(packSize(1, hornets, 0.99)).toBe(3);
    expect(packSize(11, hornets, 0)).toBe(6);
    // Zwischenbosse: ab Welle 3 jede zweite Welle, ab Welle 10 jede Welle, alle 5 Wellen einer mehr
    expect(waveElites(1, cfg)).toEqual([]);
    expect(waveElites(2, cfg)).toEqual([]);
    expect(waveElites(3, cfg)).toHaveLength(1);
    expect(waveElites(4, cfg)).toEqual([]);
    expect(waveElites(5, cfg)).toHaveLength(1);
    expect(waveElites(7, cfg)).toHaveLength(1);
    expect(waveElites(8, cfg)).toEqual([]);
    expect(waveElites(9, cfg)).toHaveLength(2);
    expect(waveElites(10, cfg)).toHaveLength(2);
    expect(waveElites(11, cfg)).toHaveLength(2);
    expect(waveElites(13, cfg)).toHaveLength(3);
    expect(waveElites(20, cfg)).toHaveLength(4);
    // abwechselnd verschiedene Typen (drei verschiedene in Welle 13), über die Wellen alle sieben
    expect(new Set(waveElites(13, cfg)).size).toBe(3);
    const all = new Set<string>();
    for (let n = 3; n <= 20; n++) for (const t of waveElites(n, cfg)) all.add(t);
    expect(all).toEqual(new Set(['rattenkoenig', 'schlaechter', 'daemon', 'vogelscheuche', 'frostriese', 'totengraeber', 'moorhexe']));
    const q = waveQueue({ rng: 1 }, 5, cfg);
    expect(q.filter((e) => e.startsWith('elite:'))).toEqual(waveElites(5, cfg).map((t) => `elite:${t}`));
    expect(q.filter((e) => e.startsWith('pack:ratte')).length).toBe(packCount(5, cfg, 'ratte'));
    expect(q.filter((e) => e.startsWith('pack:hornisse')).length).toBe(packCount(5, cfg, 'hornisse'));
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
    const pack = cfg.packs!.find((p) => p.type === 'ratte')!;
    expect(rats.length).toBeGreaterThanOrEqual(pack.minSize);
    expect(rats.length).toBeLessThanOrEqual(pack.maxSize);
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

  it('Ratten ignorieren Helden ab 2 m, beißen aber zurück, wenn sie getroffen werden', () => {
    const sim = makeSim('gaertnerin', 1, testData(noWaves));
    const h = sim.state.heroes[0];
    h.pos = { x: 30, y: 50 };
    h.maxHp = h.hp = 1e9;
    const rat = placeZombie(sim, 'ratte', 34, 50, 1e6);
    rat.objectiveId = 'bed';
    rat.speed = 0; // nur die Zielwahl prüfen
    sim.step();
    expect(rat.targetId).toBeNull();
    // Getroffen: verfolgt den Helden
    sim.step([{ heroId: h.id, type: 'input', move: { x: 0, y: 0 }, aim: rat.pos, attack: true }]);
    run(sim, 10);
    expect(rat.targetId).toBe(h.id);
  });

  it('Ratten laufen zu einem Hochbeet und fressen es an', () => {
    const sim = makeSim('rotschopf', 1, testData(noWaves));
    sim.state.heroes[0].pos = { x: 50, y: 8 };
    const rat = placeZombie(sim, 'ratte', 22.8, 53.5, 1e6);
    rat.objectiveId = 'bed';
    const beds = sim.state.objectives.filter((o) => o.kind === 'bed');
    run(sim, 20 * 20);
    expect(beds.some((b) => b.hp < b.maxHp)).toBe(true);
  });

  it('Hornissen kommen meist aus dem Nordwesten, fliegen geradlinig über Hecken und greifen den Stock an', () => {
    const sim = makeSim('rotschopf', 2, testData(noWaves));
    sim.state.heroes[0].pos = { x: 50, y: 8 };
    const nw = sim.data.arena.spawnPoints.find((s) => s.id === 'nordwest')!;
    // Spawnpunkt-Verteilung
    let fromNw = 0;
    for (let i = 0; i < 100; i++) {
      sim.state.wave.queue = ['pack:hornisse'];
      sim.state.wave.phase = 'wave';
      sim.state.wave.spawnTimer = 0;
      sim.step();
      const h = sim.state.zombies.filter((z) => z.defId === 'hornisse');
      if (h.length > 0 && dist(h[0].pos, nw) < 4) fromNw++;
      sim.state.zombies = [];
    }
    expect(fromNw).toBeGreaterThan(70);
    // Geradeaus über die Nordhecke (x 29–51, y 2,5–4,5) zum Stock
    const hornet = placeZombie(sim, 'hornisse', 40, 1, 1e6);
    hornet.objectiveId = 'hive';
    const hive = sim.state.objectives.find((o) => o.id === 'hive')!;
    let angry = false;
    for (let i = 0; i < 20 * 10 && !angry; i++) {
      sim.step();
      angry = sim.state.events.some((e) => e.type === 'beesAngry');
    }
    expect(hive.hp).toBeLessThan(hive.maxHp);
    expect(angry).toBe(true);
  });

  it('Dämon: Höllensprung mit Warnzeit, Flächenschaden bei der Landung', () => {
    const { sim, h } = setup();
    const other = sim.state.heroes[0];
    const z = placeZombie(sim, 'daemon', h.pos.x + 7, h.pos.y, 1e6);
    z.specialTimer = 0;
    const def = sim.zombieDefs.get('daemon')!;
    const sp = def.special!;
    sim.step();
    expect(z.leap).toBeTruthy();
    const leapEvent = sim.state.events.find((e) => e.type === 'leap');
    expect(leapEvent).toMatchObject({ zombieId: z.id, radius: sp.radius });
    const target = { ...z.leap!.to };
    const hp = other.hp;
    // Während der Warnzeit steht er still
    const start = { ...z.pos };
    for (let i = 0; i < Math.floor((sp.windup as number) * 20) - 1; i++) sim.step();
    expect(dist(z.pos, start)).toBeLessThan(0.01);
    expect(other.hp).toBe(hp);
    run(sim, Math.ceil((sp.flight as number) * 20) + 3);
    expect(z.leap ?? null).toBeNull();
    expect(dist(z.pos, target)).toBeLessThan(2); // landet beim Helden (wird von ihm weggeschoben)
    expect(other.hp).toBeLessThan(hp);
  });

  it('Dämon: wer aus der Warnmarkierung läuft, bleibt heil', () => {
    const { sim, h } = setup();
    const z = placeZombie(sim, 'daemon', h.pos.x + 7, h.pos.y, 1e6);
    z.damage = 0;
    z.specialTimer = 0;
    sim.step();
    expect(z.leap).toBeTruthy();
    const hp = h.hp;
    h.pos = { x: z.leap!.to.x - 6, y: z.leap!.to.y };
    run(sim, 20 * 1.3);
    expect(h.hp).toBe(hp);
  });
});

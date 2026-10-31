import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/gameData';
import { Grid } from '../../src/sim/grid';
import { dist } from '../../src/sim/vec';
import { input, makeSim, noWaves, placeZombie, testData } from './helpers';

describe('Karte Winterburg', () => {
  const sim = makeSim();
  const arena = gameData.arena;

  it('hat Vorrat, Bienenstock, sechs Hochbeete und die Zugänge Bunker, Süd, Ost und Nordwest', () => {
    expect(arena.objectives.map((o) => o.kind)).toEqual(['food', 'hive', 'bed', 'bed', 'bed', 'bed', 'bed', 'bed']);
    expect(arena.spawnPoints.map((s) => s.id)).toEqual(['bunker', 'sued', 'ost', 'nordwest']);
    expect(sim.grid.isBlocked(arena.heroStart)).toBe(false);
  });

  it('alle Ziele sind von jedem Spawnpunkt erreichbar', () => {
    for (const o of arena.objectives) {
      const field = sim.objectiveFields.get(o.id)!;
      for (const s of arena.spawnPoints) {
        expect(sim.grid.isBlocked(s), s.id).toBe(false);
        expect(field[sim.grid.cellOf(s)], `${s.id} → ${o.id}`).toBeLessThan(Infinity);
      }
      expect(field[sim.grid.cellOf(arena.heroStart)]).toBeLessThan(Infinity);
    }
    expect(sim.objectiveFields.get('bed')![sim.grid.cellOf(arena.spawnPoints[3])]).toBeLessThan(Infinity);
  });

  it('der Innenhof ist nur über den Durchgang im Südwesten und den Nordeingang erreichbar', () => {
    // Durchgang zwischen Westflügel (x bis 30) und Südblock (ab x 32,7) und den Nordeingang (x 38,5–40,5) zumauern.
    const walled = {
      ...sim.arena,
      obstacles: [
        ...sim.arena.obstacles,
        { kind: 'rect' as const, x: 31.35, y: 31, w: 2.7, h: 1 },
        { kind: 'rect' as const, x: 39.5, y: 10.5, w: 2, h: 1 },
      ],
    };
    const grid = new Grid(walled);
    const field = grid.distanceFieldToShapes([{ kind: 'circle', x: arena.objectives[0].x, y: arena.objectives[0].y, r: arena.objectives[0].radius }], 0.9);
    for (const s of arena.spawnPoints) expect(field[grid.cellOf(s)], s.id).toBe(Infinity);
  });

  it('Spawnpunkte liegen außerhalb des Gartens (außer dem Bunker), der Garten ist nur durch Tore offen', () => {
    const g = arena.garden!;
    const inside = (p: { x: number; y: number }) => Math.abs(p.x - g.x) < g.w / 2 && Math.abs(p.y - g.y) < g.h / 2;
    for (const s of arena.spawnPoints) expect(inside(s), s.id).toBe(s.id === 'bunker');
    // Freie Zellen auf dem Gartenrand: nur in den Toren West, Süd und Ost
    const gates: { side: string; from: number; to: number }[] = [
      { side: 'west', from: 6, to: 12 },
      { side: 'south', from: 35.5, to: 39 },
      { side: 'east', from: 30.5, to: 36 },
    ];
    const open = (side: string, t: number) => gates.some((q) => q.side === side && t > q.from && t < q.to);
    for (let t = 0.25; t < 75; t += 0.5) {
      expect(sim.grid.isBlocked({ x: 0, y: t }) || open('west', t), `West y=${t}`).toBe(true);
      expect(sim.grid.isBlocked({ x: 66, y: t }) || open('east', t), `Ost y=${t}`).toBe(true);
    }
    for (let t = 0.25; t < 66; t += 0.5) {
      expect(sim.grid.isBlocked({ x: t, y: 0 }), `Nord x=${t}`).toBe(true);
      expect(sim.grid.isBlocked({ x: t, y: 75 }) || open('south', t), `Süd x=${t}`).toBe(true);
    }
  });

  it('Bunker unter der Erde: Luke begehbar, daneben die Hollywoodschaukel', () => {
    const spawn = arena.spawnPoints.find((s) => s.id === 'bunker')!;
    expect(sim.grid.isBlocked(spawn)).toBe(false);
    expect(arena.obstacles.some((o) => (o.look as string) === 'bunker')).toBe(false);
    const swing = arena.obstacles.find((o) => o.look === 'swing')!;
    expect(Math.hypot(swing.x - spawn.x, swing.y - spawn.y)).toBeLessThan(5);
  });

  it('Postboten-Runde, Lager und Verstecke liegen frei', () => {
    for (const p of arena.courierRoute!) expect(sim.grid.isBlocked(p), `Wegpunkt ${p.x}/${p.y}`).toBe(false);
    // Jede Strecke der Runde ist frei (der Postbote läuft geradeaus)
    const route = arena.courierRoute!;
    route.forEach((a, i) => {
      const b = route[(i + 1) % route.length];
      expect(sim.grid.lineOfSight(a, b), `Strecke ${i}`).toBe(true);
    });
    const field = sim.objectiveFields.get('heart')!;
    for (const c of arena.camps!) expect(field[sim.grid.cellOf(c)], c.id).toBeLessThan(Infinity);
    expect(arena.brush!.length).toBeGreaterThanOrEqual(15);
    // In jedem Versteck kann man stehen (Mittelpunkt begehbar, außer Schilf um den Teich)
    for (const b of arena.brush!.filter((x) => x.look !== 'reed')) expect(sim.grid.isBlocked(b), `${b.look} ${b.x}/${b.y}`).toBe(false);
  });

  it('keine schmalen Spalten zwischen Hindernissen und Kartenrand (dort blieben Zombies stecken)', () => {
    const x0 = arena.minX ?? 0;
    const y0 = arena.minY ?? 0;
    for (const o of arena.obstacles) {
      const [hw, hh] = o.kind === 'circle' ? [o.r, o.r] : [o.w / 2, o.h / 2];
      const gaps = [o.x - hw - x0, arena.width - (o.x + hw), o.y - hh - y0, arena.height - (o.y + hh)];
      for (const g of gaps) expect(g <= 0.05 || g >= 1.8, `${o.look} bei ${o.x}/${o.y}: Spalt ${g.toFixed(2)} m`).toBe(true);
    }
  });

  it('ein in eine gesperrte Zelle geschobener Zombie findet wieder heraus', () => {
    const field = sim.objectiveFields.get('heart')!;
    const stuck = { x: arena.width - 0.3, y: 30 };
    expect(sim.grid.isBlocked(stuck)).toBe(true);
    const next = sim.grid.downhill(field, stuck)!;
    expect(next).not.toBeNull();
    expect(sim.grid.isBlocked(next)).toBe(false);
  });
});

describe('Nordeingang zum Innenhof', () => {
  function sim() {
    const s = makeSim('rotschopf', 1, testData(noWaves));
    s.state.wave.phase = 'wave';
    s.state.wave.queue = ['walker'];
    s.state.wave.spawnTimer = 1e9;
    s.state.heroes[0].pos = { x: 10, y: 70 }; // weit weg
    return s;
  }
  const inGate = (p: { x: number; y: number }) => Math.abs(p.x - 39.5) < 1.1 && p.y > 9.8 && p.y < 11.2;

  it('Zombies laufen von Norden durch den Eingang zum Vorrat', () => {
    const s = sim();
    const walker = placeZombie(s, 'walker', 39.5, 6);
    walker.objectiveId = 'heart';
    let through = false;
    for (let i = 0; i < 20 * 10; i++) {
      s.step();
      if (inGate(walker.pos)) through = true;
    }
    expect(through).toBe(true);
    expect(dist(walker.pos, { x: 37.5, y: 19.5 })).toBeLessThan(3);
  });

  it('Helden gehen durch den Eingang hinaus nach Norden', () => {
    const s = sim();
    const h = s.state.heroes[0];
    h.pos = { x: 39.5, y: 13 };
    for (let i = 0; i < 20 * 3; i++) s.step([input(s, { x: 0, y: -1 }, { x: 39.5, y: 0 })]);
    expect(h.pos.y).toBeLessThan(9);
  });
});

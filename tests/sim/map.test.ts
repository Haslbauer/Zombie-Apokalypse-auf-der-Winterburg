import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/gameData';
import { Grid } from '../../src/sim/grid';
import { makeSim } from './helpers';

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

  it('der Innenhof ist nur über den Durchgang im Südwesten erreichbar', () => {
    // Durchgang zwischen Westflügel (x bis 30) und Südblock (ab x 32,7) zumauern.
    const walled = {
      ...sim.arena,
      obstacles: [...sim.arena.obstacles, { kind: 'rect' as const, x: 31.35, y: 31, w: 2.7, h: 1 }],
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

  it('der Bunker öffnet sich nach Norden', () => {
    const bunker = arena.obstacles.find((o) => o.look === 'bunker')!;
    const spawn = arena.spawnPoints.find((s) => s.id === 'bunker')!;
    expect(bunker.kind).toBe('rect');
    if (bunker.kind === 'rect') {
      expect(spawn.y).toBeLessThan(bunker.y - bunker.h / 2);
      expect(Math.abs(spawn.x - bunker.x)).toBeLessThan(bunker.w / 2);
    }
  });
});

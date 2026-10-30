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
});

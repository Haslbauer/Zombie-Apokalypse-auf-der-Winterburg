import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/gameData';
import { Grid } from '../../src/sim/grid';
import { makeSim } from './helpers';

describe('Karte Winterburg', () => {
  const sim = makeSim();
  const arena = gameData.arena;

  it('hat Herz, Bienenstock und die drei Zugänge Bunker, Süd und Ost', () => {
    expect(arena.objectives.map((o) => o.id)).toEqual(['heart', 'hive']);
    expect(arena.spawnPoints.map((s) => s.id)).toEqual(['bunker', 'sued', 'ost']);
    expect(sim.grid.isBlocked(arena.heroStart)).toBe(false);
  });

  it('Herz und Bienenstock sind von jedem Spawnpunkt erreichbar', () => {
    for (const o of arena.objectives) {
      const field = sim.objectiveFields.get(o.id)!;
      for (const s of arena.spawnPoints) {
        expect(sim.grid.isBlocked(s), s.id).toBe(false);
        expect(field[sim.grid.cellOf(s)], `${s.id} → ${o.id}`).toBeLessThan(Infinity);
      }
      expect(field[sim.grid.cellOf(arena.heroStart)]).toBeLessThan(Infinity);
    }
  });

  it('der Innenhof ist nur über den Durchgang im Südwesten erreichbar', () => {
    // Durchgang zwischen Westflügel (x bis 30) und Südblock (ab x 32,7) zumauern.
    const walled = {
      ...sim.arena,
      obstacles: [...sim.arena.obstacles, { kind: 'rect' as const, x: 31.35, y: 31, w: 2.7, h: 1 }],
    };
    const grid = new Grid(walled);
    const field = grid.distanceField([arena.objectives[0]], arena.objectives[0].radius + 0.9);
    for (const s of arena.spawnPoints) expect(field[grid.cellOf(s)], s.id).toBe(Infinity);
  });
});

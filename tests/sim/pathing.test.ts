import { describe, expect, it } from 'vitest';
import { distanceToObstacle, Grid } from '../../src/sim/grid';
import type { ArenaDef } from '../../src/sim/types';
import { dist } from '../../src/sim/vec';
import { input, makeSim, noWaves, testData } from './helpers';

const wallArena: ArenaDef = {
  width: 20,
  height: 20,
  cellSize: 0.5,
  heroStart: { x: 5, y: 10 },
  spawnPoints: [{ x: 1, y: 1 }],
  // Wand quer durch die Mitte, nur oben ein Durchgang.
  obstacles: [{ kind: 'rect', x: 10, y: 12, w: 1, h: 16 }],
};

describe('Pfadsuche', () => {
  it('findet einen Weg um eine Wand herum', () => {
    const grid = new Grid(wallArena);
    const path = grid.findPath({ x: 5, y: 10 }, { x: 15, y: 10 });
    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toEqual({ x: 15, y: 10 });
    // Der Weg muss über den Durchgang oben (y < 4) führen.
    expect(Math.min(...path.map((p) => p.y))).toBeLessThan(4);
    let prev = { x: 5, y: 10 };
    for (const p of path) {
      expect(grid.lineOfSight(prev, p)).toBe(true);
      prev = p;
    }
  });

  it('verschiebt ein Ziel im Hindernis auf die nächste freie Stelle', () => {
    const grid = new Grid(wallArena);
    const path = grid.findPath({ x: 5, y: 10 }, { x: 10, y: 12 });
    const end = path[path.length - 1];
    expect(grid.isBlocked(end)).toBe(false);
    expect(dist(end, { x: 10, y: 12 })).toBeLessThan(1.5);
  });

  it('Held läuft mit WASD gegen ein Hindernis und steckt nie darin fest', () => {
    const data = testData(noWaves);
    const sim = makeSim('nahkampf', 1, data);
    const h = sim.state.heroes[0];
    // Nach Norden laufen: Dort steht eine Hecke (x 20, y 15).
    sim.step([input(sim, { x: 0, y: -1 }, { x: 20, y: 0 })]);
    for (let t = 0; t < 100; t++) {
      sim.step();
      for (const o of data.arena.obstacles) {
        expect(distanceToObstacle(h.pos, o)).toBeGreaterThanOrEqual(h.radius - 1e-6);
      }
    }
    // Steht jetzt direkt südlich der Hecke.
    expect(h.pos.y).toBeCloseTo(15 + 0.6 + h.radius, 5);
    expect(h.facing).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('schräg laufen ist nicht schneller als gerade, Blick folgt der Maus', () => {
    const sim = makeSim('nahkampf', 1, testData(noWaves));
    const h = sim.state.heroes[0];
    const start = { ...h.pos };
    sim.step([input(sim, { x: 1, y: 1 }, { x: start.x - 10, y: start.y })]);
    const moved = dist(start, h.pos);
    expect(moved).toBeCloseTo(h.speed / 20, 6);
    // Läuft nach Südosten, schaut aber nach Westen zur Maus.
    expect(Math.abs(h.facing)).toBeCloseTo(Math.PI, 1);
  });
});

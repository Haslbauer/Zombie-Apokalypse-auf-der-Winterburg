import { describe, expect, it } from 'vitest';
import { canSee } from '../../src/sim/zombies';
import { makeSim, noWaves, placeZombie, run, testData } from './helpers';

/** Freie Fläche im Garten mit einem Busch (Kreis, r = 3) und einem zweiten Versteck daneben. */
function brushSim() {
  const data = testData((d) => {
    noWaves(d);
    d.arena.brush = [
      { kind: 'circle', x: 40, y: 50, r: 3, look: 'bush' },
      { kind: 'rect', x: 50, y: 50, w: 4, h: 4, look: 'grass' },
    ];
    d.arena.camps = [];
  });
  const sim = makeSim('gaertnerin', 1, data);
  const h = sim.state.heroes[0];
  h.pos = { x: 40, y: 50 };
  sim.step();
  return { sim, h };
}

describe('Verstecke (Gebüsch, hohes Gras)', () => {
  it('Held im Busch ist versteckt: Zombies sehen ihn erst aus nächster Nähe oder im selben Versteck', () => {
    const { sim, h } = brushSim();
    expect(h.brush).toBe(0);
    const far = placeZombie(sim, 'walker', 45, 50); // 5 m weg, außerhalb
    const near = placeZombie(sim, 'walker', 42.4, 50); // knapp am Busch, Rand zu Rand < 2,5 m
    const inside = placeZombie(sim, 'walker', 37.6, 51); // im selben Busch
    const other = placeZombie(sim, 'walker', 50, 50); // im anderen Versteck
    expect(canSee(sim, far, h)).toBe(false);
    expect(canSee(sim, near, h)).toBe(true);
    expect(canSee(sim, inside, h)).toBe(true);
    expect(canSee(sim, other, h)).toBe(false);
    // Außerhalb des Busches sieht man ihn wieder
    h.pos = { x: 40, y: 56 };
    sim.step();
    expect(h.brush).toBe(-1);
    expect(canSee(sim, far, h)).toBe(true);
  });

  it('Zombies laufen an einem versteckten Helden vorbei (keine Verfolgung)', () => {
    const { sim, h } = brushSim();
    const z = placeZombie(sim, 'walker', 44.5, 50);
    run(sim, 20);
    expect(z.targetId).not.toBe(h.id);
    expect(h.hp).toBe(h.maxHp);
  });

  it('Angreifen verrät: nach einem Schuss ist der Held 1,5 s sichtbar', () => {
    const { sim, h } = brushSim();
    const z = placeZombie(sim, 'walker', 45, 50);
    expect(canSee(sim, z, h)).toBe(false);
    sim.step([{ heroId: h.id, type: 'input', move: { x: 0, y: 0 }, aim: { x: 45, y: 50 }, attack: true }]);
    expect(canSee(sim, z, h)).toBe(true);
    run(sim, 20 * 2);
    sim.step([{ heroId: h.id, type: 'input', move: { x: 0, y: 0 }, aim: { x: 45, y: 50 }, attack: false }]);
    run(sim, 20 * 2);
    z.pos = { x: 45, y: 50 }; // der Zombie ist inzwischen weitergelaufen
    expect(canSee(sim, z, h)).toBe(false);
  });

  it('Verstecke sind begehbar und halten keine Schüsse auf', () => {
    const { sim } = brushSim();
    expect(sim.grid.isBlocked({ x: 40, y: 50 })).toBe(false);
    expect(sim.grid.lineOfSight({ x: 37, y: 50 }, { x: 43, y: 50 })).toBe(true);
  });
});

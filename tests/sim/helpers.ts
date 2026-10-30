import { gameData } from '../../src/gameData';
import testArena from '../fixtures/test-arena.json';
import { Simulation } from '../../src/sim/game';
import { emptyStatus } from '../../src/sim/status';
import type { Command, GameData, Zombie } from '../../src/sim/types';
import type { Vec2 } from '../../src/sim/vec';

/** Tiefe Kopie der echten Spieldaten, damit Tests sie gefahrlos anpassen können. */
export function testData(patch?: (d: GameData) => void): GameData {
  const d: GameData = structuredClone(gameData);
  patch?.(d);
  return d;
}

/** Spieldaten mit der kleinen M1-Testarena (40 × 40 m, keine Ziele) statt der Winterburg. */
export function arenaData(patch?: (d: GameData) => void): GameData {
  return testData((d) => {
    d.arena = structuredClone(testArena) as GameData['arena'];
    patch?.(d);
  });
}

export function makeSim(heroId = 'rotschopf', seed = 1, data = testData()): Simulation {
  return new Simulation(data, { seed, heroes: [heroId] });
}

export function run(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

/** Zombie direkt neben eine Position setzen (ohne Welle). */
export function placeZombie(sim: Simulation, defId: string, x: number, y: number, hp?: number) {
  const def = sim.zombieDefs.get(defId)!;
  const z: Zombie = {
    id: sim.state.nextId++,
    defId,
    pos: { x, y },
    radius: def.radius,
    hp: hp ?? def.hp,
    maxHp: hp ?? def.hp,
    speed: def.speed,
    facing: 0,
    attackTimer: 0,
    damage: def.damage,
    targetId: null,
    objectiveId: 'heart',
    st: emptyStatus(),
    wander: 0,
  };
  sim.state.zombies.push(z);
  return z;
}

/** Wellen anhalten, damit ein Test nur seine eigenen Zombies sieht. */
export function noWaves(d: GameData): void {
  d.waves.firstPauseDuration = 1e9;
}

/** Eingabe-Befehl für den ersten Helden. */
export function input(sim: Simulation, move: Vec2, aim: Vec2, attack = false): Command {
  return { heroId: sim.state.heroes[0].id, type: 'input', move, aim, attack };
}

/** Held mit allen Fähigkeiten auf Rang 1 in der Testarena, ohne Wellen. Zombies via zombie() stehen still und machen keinen Schaden. */
export function heroSim(heroId: string, seed = 1) {
  const sim = makeSim(heroId, seed, arenaData(noWaves));
  const h = sim.state.heroes[0];
  h.ranks = [1, 1, 1, 1];
  const zombie = (x: number, y: number, defId = 'walker', hp = 1000) => {
    const z = placeZombie(sim, defId, x, y, hp);
    z.speed = 0;
    z.damage = 0;
    return z;
  };
  const cast = (slot: number, aim: { x: number; y: number }) =>
    sim.step([{ heroId: h.id, type: 'cast', slot, aim }]);
  const attack = (aim: { x: number; y: number }, on = true) =>
    sim.step([{ heroId: h.id, type: 'input', move: { x: 0, y: 0 }, aim, attack: on }]);
  const value = (slot: number, key: string) => {
    const v = sim.heroDefs.get(heroId)!.abilities[slot].values[key];
    return typeof v === 'number' ? v : v[0];
  };
  return { sim, h, zombie, cast, attack, value, east: { x: h.pos.x + 10, y: h.pos.y } };
}

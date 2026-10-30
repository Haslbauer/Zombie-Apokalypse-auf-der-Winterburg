import { gameData } from '../../src/gameData';
import testArena from '../fixtures/test-arena.json';
import { Simulation } from '../../src/sim/game';
import type { Command, GameData } from '../../src/sim/types';
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

export function makeSim(heroId = 'nahkampf', seed = 1, data = testData()): Simulation {
  return new Simulation(data, { seed, heroes: [heroId] });
}

export function run(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

/** Zombie direkt neben eine Position setzen (ohne Welle). */
export function placeZombie(sim: Simulation, defId: string, x: number, y: number, hp?: number) {
  const def = sim.zombieDefs.get(defId)!;
  const z = {
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

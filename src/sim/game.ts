import { updateProjectiles } from './combat';
import { applyCommands } from './commands';
import type { SimContext } from './context';
import { Grid, resolveObstacles } from './grid';
import { updateHero } from './heroes';
import { pushApart } from './movement';
import { SpatialHash } from './spatial';
import { DT, type Command, type GameData, type GameState, type Hero, type Zombie } from './types';
import { updateWaves } from './waves';
import { updateZombies } from './zombies';

/** Das Distanzfeld der Zombies wird alle so viele Ticks neu berechnet. */
const FIELD_TICKS = 5;

export interface SimulationOptions {
  seed: number;
  /** Helden-Ids aus heroes.json, ein Eintrag pro Slot. */
  heroes: string[];
}

/**
 * Die komplette Spiellogik, tickbasiert und ohne Browser-Abhängigkeit.
 * Singleplayer: läuft im Browser. Mehrspieler (M6): dieselbe Klasse auf dem Server.
 */
export class Simulation implements SimContext {
  readonly grid: Grid;
  readonly heroDefs: Map<string, GameData['heroes'][number]>;
  readonly zombieDefs: Map<string, GameData['zombies'][number]>;
  state: GameState;
  private field: Float32Array | null = null;
  private readonly hash = new SpatialHash<Zombie>(2);
  private readonly neighbors: Zombie[] = [];

  constructor(readonly data: GameData, options: SimulationOptions) {
    this.grid = new Grid(data.arena);
    this.heroDefs = new Map(data.heroes.map((h) => [h.id, h]));
    this.zombieDefs = new Map(data.zombies.map((z) => [z.id, z]));

    this.state = {
      tick: 0,
      time: 0,
      rng: options.seed | 0,
      nextId: 1,
      heroes: [],
      zombies: [],
      projectiles: [],
      wave: { number: 1, phase: 'pause', timer: data.waves.firstPauseDuration, queue: [], spawnTimer: 0 },
      kills: 0,
      gameOver: false,
      events: [],
    };

    options.heroes.forEach((defId, slot) => {
      const def = this.heroDefs.get(defId);
      if (!def) throw new Error(`Unbekannter Held: ${defId}`);
      const start = data.arena.heroStart;
      this.state.heroes.push({
        id: this.state.nextId++,
        defId,
        pos: { x: start.x + slot * 1.5, y: start.y },
        radius: def.radius,
        hp: def.hp,
        maxHp: def.hp,
        speed: def.speed,
        facing: -Math.PI / 2,
        attackTimer: 0,
        order: { type: 'idle' },
        path: [],
        repathAt: 0,
        alive: true,
      });
    });
  }

  /** Ein Tick (1/20 s). */
  step(commands: readonly Command[] = []): void {
    const state = this.state;
    state.events = [];
    if (state.gameOver) return;
    state.tick++;
    state.time += DT;

    applyCommands(this, commands);
    for (const h of state.heroes) updateHero(this, h);

    if (state.tick % FIELD_TICKS === 1 || !this.field) {
      const targets = state.heroes.filter((h) => h.alive).map((h) => h.pos);
      this.field = targets.length > 0 ? this.grid.distanceField(targets) : null;
    }
    updateZombies(this, this.field);
    updateProjectiles(this);
    state.zombies = state.zombies.filter((z) => z.hp > 0);
    this.resolveCollisions();
    updateWaves(this);
  }

  hero(id: number): Hero | undefined {
    return this.state.heroes.find((h) => h.id === id);
  }

  /** Zombies weichen einander und den Helden aus, niemand steckt in Hindernissen. */
  private resolveCollisions(): void {
    const { zombies, heroes } = this.state;
    const arena = this.data.arena;
    this.hash.rebuild(zombies);
    for (const z of zombies) {
      for (const other of this.hash.query(z.pos, z.radius * 2 + 0.5, this.neighbors)) {
        if (other.id > z.id) pushApart(z, other, 0.5);
      }
    }
    for (const h of heroes) {
      if (!h.alive) continue;
      for (const z of this.hash.query(h.pos, h.radius + 1, this.neighbors)) pushApart(h, z, 0);
    }
    for (const z of zombies) resolveObstacles(z.pos, z.radius, arena);
    for (const h of heroes) resolveObstacles(h.pos, h.radius, arena);
  }
}

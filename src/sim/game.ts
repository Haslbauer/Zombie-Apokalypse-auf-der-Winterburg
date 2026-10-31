import { updateProjectiles } from './combat';
import type { SimContext } from './context';
import { arenaBounds, Grid, resolveObstacles } from './grid';
import { botCommands, createBot } from './bots/brain';
import { applyInputs, updateHero } from './hero';
import { pushApart } from './movement';
import { objectiveShape, updateObjectives } from './objectives';
import { levelStats, levelUp } from './progression';
import { kitOf } from './heroes/index';
import { updateDelayed, updateZones } from './zones';
import { SpatialHash } from './spatial';
import { type ArenaDef, type BotDifficulty, DT, type Command, type GameData, type GameState, type Hero, type Zombie } from './types';
import { updateCamps } from './neutrals';
import { updateWaves } from './waves';
import { updateZombies } from './zombies';

/** Das Distanzfeld zu den Helden wird alle so viele Ticks neu berechnet. */
const FIELD_TICKS = 5;
/** Zombies, die in diesem Abstand um ein Ziel stehen, können es angreifen (Saatradius der Felder). */
const OBJECTIVE_SEED = 0.9;

export interface SimulationOptions {
  seed: number;
  /** Helden-Ids aus heroes.json, ein Eintrag pro Slot. */
  heroes: string[];
  /** Startlevel (Entwicklermodus ?level=…); Standard 1. */
  startLevel?: number;
  /** Pro Slot: null = Mensch, sonst spielt ein Bot dieser Stärke. */
  bots?: (BotDifficulty | null)[];
}

/**
 * Die komplette Spiellogik, tickbasiert und ohne Browser-Abhängigkeit.
 * Singleplayer: läuft im Browser. Mehrspieler (M6): dieselbe Klasse auf dem Server.
 */
export class Simulation implements SimContext {
  readonly grid: Grid;
  readonly arena: ArenaDef;
  readonly objectiveFields = new Map<string, Float32Array>();
  readonly heroDefs: Map<string, GameData['heroes'][number]>;
  readonly zombieDefs: Map<string, GameData['zombies'][number]>;
  state: GameState;
  private field: Float32Array | null = null;
  private readonly hash = new SpatialHash<Zombie>(2);
  private readonly neighbors: Zombie[] = [];

  constructor(readonly data: GameData, options: SimulationOptions) {
    // Ziele (Herz, Bienenstock) sind feste Hindernisse für Laufen und Schüsse.
    this.arena = {
      ...data.arena,
      obstacles: [
        ...data.arena.obstacles,
        // Niedrige Ziele (Hochbeete) lassen Schüsse durch.
        ...data.arena.objectives.map((o) => ({ ...objectiveShape(o), blocksShots: o.kind !== 'bed' })),
      ],
    };
    this.grid = new Grid(this.arena);
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
      zones: [],
      delayed: [],
      objectives: data.arena.objectives.map((o) => ({
        id: o.id,
        kind: o.kind,
        pos: { x: o.x, y: o.y },
        radius: o.radius,
        w: o.w,
        h: o.h,
        regrowIn: 0,
        hp: o.hp,
        maxHp: o.hp,
        destroyed: false,
        aggroUntil: 0,
        stingTimer: 0,
      })),
      wave: {
        number: 1,
        phase: 'pause',
        timer: data.waves.firstPauseDuration,
        queue: [],
        spawnTimer: 0,
        breached: false,
        courierAt: null,
      },
      kills: 0,
      gameOver: false,
      events: [],
      camps: [],
    };

    this.refreshObjectiveFields();

    options.heroes.forEach((defId, slot) => {
      const def = this.heroDefs.get(defId);
      if (!def) throw new Error(`Unbekannter Held: ${defId}`);
      const start = data.arena.heroStart;
      const hero: Hero = {
        id: this.state.nextId++,
        defId,
        pos: { x: start.x + slot * 1.5, y: start.y },
        radius: def.radius,
        hp: def.hp,
        maxHp: levelStats(def, 1).maxHp,
        speed: def.speed,
        facing: -Math.PI / 2,
        attackTimer: 0,
        input: { move: { x: 0, y: 0 }, aim: { x: start.x + slot * 1.5, y: start.y - 5 }, attack: false },
        alive: true,
        respawnAt: 0,
        slot,
        level: 1,
        xp: 0,
        skillPoints: 1,
        ranks: [0, 0, 0, 0],
        cooldowns: [0, 0, 0, 0],
        buffs: [],
        dash: null,
        channel: null,
        lastCombatAt: -100,
        counters: {},
        gold: data.economy.startGold,
        inventory: Array<string | null>(data.economy.inventorySlots).fill(null),
        consumables: [null, null],
      };
      this.state.heroes.push(hero);
      const difficulty = options.bots?.[slot];
      if (difficulty) hero.bot = createBot(this, difficulty, this.state.heroes.filter((x) => x.bot).length);
      kitOf(defId).init?.(this, hero);
      for (let l = 1; l < (options.startLevel ?? 1); l++) levelUp(this, hero);
    });
    this.state.events = [];
  }

  /** Distanzfelder zu jedem Ziel und zu jeder Zielgruppe (nur intakte Mitglieder). */
  refreshObjectiveFields(kind?: string): void {
    for (const o of this.data.arena.objectives) {
      if (!kind && !this.objectiveFields.has(o.id)) {
        this.objectiveFields.set(o.id, this.grid.distanceFieldToShapes([objectiveShape(o)], OBJECTIVE_SEED));
      }
    }
    const kinds = kind ? [kind] : [...new Set(this.data.arena.objectives.map((o) => o.kind))];
    for (const k of kinds) {
      const alive = this.data.arena.objectives.filter((o) => o.kind === k && !this.state.objectives.find((s) => s.id === o.id)?.destroyed);
      if (alive.length > 0) this.objectiveFields.set(k, this.grid.distanceFieldToShapes(alive.map(objectiveShape), OBJECTIVE_SEED));
    }
  }

  /** Ein Tick (1/20 s). */
  step(commands: readonly Command[] = []): void {
    const state = this.state;
    state.events = [];
    if (state.gameOver) return;
    state.tick++;
    state.time += DT;

    const botCmds = state.heroes.filter((h) => h.bot).flatMap((h) => botCommands(this, h));
    applyInputs(this, botCmds.length > 0 ? [...commands, ...botCmds] : commands);
    for (const h of state.heroes) {
      if (!h.alive && state.time >= h.respawnAt) this.respawn(h);
      updateHero(this, h);
    }

    if (state.tick % FIELD_TICKS === 1 || !this.field) {
      const targets = state.heroes.filter((h) => h.alive).map((h) => h.pos);
      this.field = targets.length > 0 ? this.grid.distanceField(targets) : null;
    }
    updateZombies(this, this.field);
    updateProjectiles(this);
    updateZones(this);
    updateDelayed(this);
    updateObjectives(this);
    state.zombies = state.zombies.filter((z) => z.hp > 0);
    this.resolveCollisions();
    updateWaves(this);
    updateCamps(this);
  }

  /** Gefallenen Helden im Innenhof wiederbeleben. */
  private respawn(h: Hero): void {
    const start = this.data.arena.heroStart;
    h.alive = true;
    h.hp = h.maxHp;
    h.attackTimer = 0;
    h.buffs = [];
    h.dash = null;
    h.channel = null;
    h.pos = { x: start.x + h.slot * 1.5, y: start.y };
    resolveObstacles(h.pos, h.radius, this.arena);
    kitOf(h.defId).onRespawn?.(this, h);
    this.state.events.push({ type: 'respawn', id: h.id });
  }

  hero(id: number): Hero | undefined {
    return this.state.heroes.find((h) => h.id === id);
  }

  /** Zombies weichen einander und den Helden aus, niemand steckt in Hindernissen. */
  private resolveCollisions(): void {
    const { zombies, heroes } = this.state;
    const arena = this.arena;
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
    for (const z of zombies) {
      if (this.zombieDefs.get(z.defId)?.flying) {
        // Fliegende Gegner: nur am Kartenrand halten
        const b = arenaBounds(arena);
        z.pos.x = Math.max(b.x0 + z.radius, Math.min(b.x1 - z.radius, z.pos.x));
        z.pos.y = Math.max(b.y0 + z.radius, Math.min(b.y1 - z.radius, z.pos.y));
      } else resolveObstacles(z.pos, z.radius, arena);
    }
    for (const h of heroes) if (h.alive) resolveObstacles(h.pos, h.radius, arena);
  }
}

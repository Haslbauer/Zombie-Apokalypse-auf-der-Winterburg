import type { Vec2 } from './vec';

// ---------- Spieldaten (aus data/*.json) ----------

export type AttackType = 'melee' | 'ranged';

export interface AttackDef {
  type: AttackType;
  damage: number;
  /** Reichweite in Metern, gemessen von Rand zu Rand der Einheiten. */
  range: number;
  /** Sekunden zwischen zwei Angriffen. */
  cooldown: number;
  /** Nur Nahkampf: Öffnungswinkel des Schlags in Grad. */
  arc?: number;
  /** Nur Fernkampf: Meter pro Sekunde. */
  projectileSpeed?: number;
  /** Nur Fernkampf: Radius des Projektils in Metern. */
  projectileRadius?: number;
}

export interface HeroDef {
  id: string;
  name: string;
  color: string;
  hp: number;
  /** Lebensregeneration pro Sekunde. */
  hpRegen: number;
  speed: number;
  radius: number;
  attack: AttackDef;
}

export interface ZombieDef {
  id: string;
  name: string;
  color: string;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  /** Helden in diesem Umkreis werden verfolgt statt das Ziel anzulaufen. */
  aggroRange: number;
}

export interface WaveMixEntry {
  /** Gilt ab dieser Welle, bis ein späterer Eintrag übernimmt. */
  fromWave: number;
  weights: Record<string, number>;
}

export interface WaveConfig {
  baseCount: number;
  countPerWave: number;
  /** Zusätzliches Leben pro Welle, relativ (0.08 = +8 % je Welle). */
  hpScalePerWave: number;
  damageScalePerWave: number;
  /** Sekunden zwischen zwei Spawns. */
  spawnInterval: number;
  firstPauseDuration: number;
  pauseDuration: number;
  mix: WaveMixEntry[];
  /** Wahrscheinlichkeit, mit der ein Zombie welches Ziel (Objective-Id) anläuft. */
  targetWeights: Record<string, number>;
}

/** Aussehen eines Hindernisses (nur für die Darstellung). */
export type ObstacleLook = 'house' | 'hedge' | 'fence' | 'tree' | 'bed' | 'bunker' | 'blocked' | 'objective';

interface ObstacleBase {
  look?: ObstacleLook;
  /** Hält Schüsse auf (Standard true). Niedrige Hindernisse wie Beete lassen sie durch. */
  blocksShots?: boolean;
}

export type Obstacle =
  | (ObstacleBase & { kind: 'circle'; x: number; y: number; r: number })
  /** Rechteck mit Mittelpunkt x/y, Breite w und Höhe h. */
  | (ObstacleBase & { kind: 'rect'; x: number; y: number; w: number; h: number });

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  /** Relative Häufigkeit, mit der hier Zombies erscheinen. */
  weight: number;
}

/** Fläche, auf der Zombies langsamer sind (z. B. der Hang). Rechteck mit Mittelpunkt x/y. */
export interface SlowZone {
  x: number;
  y: number;
  w: number;
  h: number;
  factor: number;
}

export interface BeesDef {
  damage: number;
  /** Sekunden zwischen zwei Stichen. */
  interval: number;
  range: number;
  /** So lange bleiben die Bienen nach Schaden am Stock wütend. */
  aggroDuration: number;
}

/** Ziel, das die Zombies angreifen (Herz der Base, Bienenstock). */
export interface ObjectiveDef {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  /** Regeneration pro Sekunde während einer Welle bzw. in der Pause. */
  regen: number;
  pauseRegen: number;
  /** Fällt dieses Ziel, ist das Spiel verloren. */
  loseOnDestroy: boolean;
  bees?: BeesDef;
}

export interface ArenaDef {
  width: number;
  height: number;
  /** Kantenlänge einer Rasterzelle für die Pfadsuche. */
  cellSize: number;
  obstacles: Obstacle[];
  spawnPoints: SpawnPoint[];
  slowZones: SlowZone[];
  objectives: ObjectiveDef[];
  heroStart: Vec2;
  /** Wiederbelebung: base Sekunden plus perWave je Welle. */
  respawn: { base: number; perWave: number };
}

export interface GameData {
  heroes: HeroDef[];
  zombies: ZombieDef[];
  waves: WaveConfig;
  arena: ArenaDef;
}

// ---------- Befehle (Eingabe; im Mehrspieler das Netzwerkformat) ----------

/** Eingabezustand eines Spielers (Steuerung wie in Supervive). */
export interface HeroInput {
  /** Laufrichtung aus WASD, Länge höchstens 1. */
  move: Vec2;
  /** Bodenpunkt unter dem Mauszeiger, bestimmt die Blickrichtung. */
  aim: Vec2;
  /** Angriffstaste gedrückt. */
  attack: boolean;
}

export type Command = { heroId: number; type: 'input' } & HeroInput;

// ---------- Spielzustand ----------

export interface Unit {
  id: number;
  defId: string;
  pos: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  /** Blickrichtung in Radiant (0 = Osten). */
  facing: number;
  /** Restzeit bis zum nächsten möglichen Angriff. */
  attackTimer: number;
}

export interface Hero extends Unit {
  /** Letzte Eingabe; gilt, bis eine neue kommt. */
  input: HeroInput;
  alive: boolean;
  /** Spielzeit, zu der ein gefallener Held wiederbelebt wird. */
  respawnAt: number;
  /** Startplatz (Slot) für die Wiederbelebung. */
  slot: number;
}

export interface Zombie extends Unit {
  damage: number;
  /** Held, der gerade verfolgt wird. */
  targetId: number | null;
  /** Ziel (Objective-Id), zu dem der Zombie läuft, wenn er keinen Helden jagt. */
  objectiveId: string;
}

export interface Objective {
  id: string;
  pos: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  /** Bienen: wütend bis zu dieser Spielzeit. */
  aggroUntil: number;
  /** Bienen: Restzeit bis zum nächsten Stich. */
  stingTimer: number;
}

/** Geschoss, das geradeaus fliegt und den ersten berührten Zombie trifft. */
export interface Projectile {
  id: number;
  ownerId: number;
  pos: Vec2;
  /** Flugrichtung (Einheitsvektor). */
  dir: Vec2;
  speed: number;
  damage: number;
  radius: number;
  /** Restliche Flugstrecke in Metern. */
  remaining: number;
}

export type WavePhase = 'pause' | 'wave';

export interface WaveState {
  /** Nummer der laufenden oder als Nächstes kommenden Welle. */
  number: number;
  phase: WavePhase;
  /** Pause: Restzeit bis zur Welle. */
  timer: number;
  /** Noch zu spawnende Zombie-Typen dieser Welle. */
  queue: string[];
  spawnTimer: number;
  /** Ist in dieser Welle schon ein Zombie zum Herz durchgebrochen? */
  breached: boolean;
}

export type GameEvent =
  | { type: 'hit'; targetId: number; amount: number; pos: Vec2 }
  | { type: 'death'; id: number; pos: Vec2 }
  | { type: 'attack'; id: number; targetId: number }
  | { type: 'swing'; id: number; facing: number; range: number; arc: number }
  | { type: 'shot'; id: number }
  | { type: 'waveStart'; number: number }
  | { type: 'waveCleared'; number: number }
  | { type: 'breach'; objectiveId: string }
  | { type: 'objectiveHit'; objectiveId: string; amount: number }
  | { type: 'objectiveDestroyed'; objectiveId: string }
  | { type: 'beesAngry'; objectiveId: string }
  | { type: 'sting'; objectiveId: string; targetId: number }
  | { type: 'respawn'; id: number }
  | { type: 'gameOver'; wave: number; reason: string };

export interface GameState {
  tick: number;
  time: number;
  rng: number;
  nextId: number;
  heroes: Hero[];
  zombies: Zombie[];
  projectiles: Projectile[];
  objectives: Objective[];
  wave: WaveState;
  kills: number;
  gameOver: boolean;
  /** Ereignisse des letzten Ticks (für Effekte im Client). */
  events: GameEvent[];
}

/** Ticks pro Sekunde der Simulation. */
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

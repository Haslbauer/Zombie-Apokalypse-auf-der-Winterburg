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
}

export type Obstacle =
  | { kind: 'circle'; x: number; y: number; r: number }
  /** Rechteck mit Mittelpunkt x/y, Breite w und Höhe h. */
  | { kind: 'rect'; x: number; y: number; w: number; h: number };

export interface ArenaDef {
  width: number;
  height: number;
  /** Kantenlänge einer Rasterzelle für die Pfadsuche. */
  cellSize: number;
  obstacles: Obstacle[];
  spawnPoints: Vec2[];
  heroStart: Vec2;
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
}

export interface Zombie extends Unit {
  damage: number;
  targetId: number | null;
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
}

export type GameEvent =
  | { type: 'hit'; targetId: number; amount: number; pos: Vec2 }
  | { type: 'death'; id: number; pos: Vec2 }
  | { type: 'attack'; id: number; targetId: number }
  | { type: 'swing'; id: number; facing: number; range: number; arc: number }
  | { type: 'shot'; id: number }
  | { type: 'waveStart'; number: number }
  | { type: 'waveCleared'; number: number }
  | { type: 'gameOver'; wave: number };

export interface GameState {
  tick: number;
  time: number;
  rng: number;
  nextId: number;
  heroes: Hero[];
  zombies: Zombie[];
  projectiles: Projectile[];
  wave: WaveState;
  kills: number;
  gameOver: boolean;
  /** Ereignisse des letzten Ticks (für Effekte im Client). */
  events: GameEvent[];
}

/** Ticks pro Sekunde der Simulation. */
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

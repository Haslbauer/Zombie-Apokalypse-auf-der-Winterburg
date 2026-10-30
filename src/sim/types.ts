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

/** Zahl, die je Rang einen eigenen Wert haben kann ([Rang 1, Rang 2, …]). */
export type RankValue = number | number[];

/** Form der Vorschau beim Halten der Taste (und grob der Wirkung). */
export type AbilityShape = 'line' | 'cone' | 'circle' | 'target' | 'self' | 'dash';

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  shape: AbilityShape;
  /** Maximale Reichweite (Zielpunkt bzw. Länge) in Metern. */
  range: number;
  /** Radius der Wirkfläche, Breite einer Linie oder Öffnungswinkel eines Kegels (Grad). */
  radius?: number;
  width?: number;
  arc?: number;
  cooldown: RankValue;
  /** Weitere Werte je Rang, z. B. { "damage": [60, 90, 120, 150, 180] }. */
  values: Record<string, RankValue>;
}

export interface PassiveDef {
  name: string;
  description: string;
  values: Record<string, number>;
}

export interface HeroDef {
  id: string;
  name: string;
  role: string;
  description: string;
  color: string;
  /** Figur für die Darstellung (z. B. "dog", "hammer", "ball"). */
  figure: string;
  hp: number;
  /** Lebensregeneration pro Sekunde. */
  hpRegen: number;
  speed: number;
  radius: number;
  /** Wachstum pro Level: Leben, Regeneration und Schaden (0.06 = +6 % je Level). */
  hpPerLevel: number;
  regenPerLevel: number;
  damagePerLevel: number;
  attack: AttackDef & { look?: string };
  passive: PassiveDef;
  /** Genau vier Fähigkeiten, die vierte ist die Ultimate. */
  abilities: AbilityDef[];
}

export interface ProgressionDef {
  maxLevel: number;
  /** XP, die von Level n auf n+1 nötig sind (Index 0 = von 1 auf 2). */
  xpToNext: number[];
  /** Helden in diesem Umkreis um einen getöteten Zombie bekommen XP. */
  xpShareRange: number;
  /** Anteil, den jeder Held bekommt, je nach Zahl der Helden in Reichweite (Index 0 = allein). */
  xpShare: number[];
  /** Zusätzliche XP pro Welle, relativ. */
  xpWaveScale: number;
  basicMaxRank: number;
  ultMaxRank: number;
  /** Level, ab denen die Ultimate Rang 1, 2, 3 bekommen kann. */
  ultLevels: number[];
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
  /** XP für den Kill (vor der Wellen-Skalierung). */
  xp: number;
  /** Elite schlafen kürzer, Bosse sind immun gegen Schlaf (ab M4/M7). */
  rank?: 'normal' | 'elite' | 'boss';
  /** Gold für den Kill. */
  gold: number;
  /** Aussehen (z. B. "walker", "rat", "crawler"). */
  figure: string;
  /** Treffer hält den Helden so viele Sekunden fest (Kriecher). */
  rootOnHit?: number;
  /** Elite-Fähigkeit mit ihren Werten. */
  special?: { kind: 'summon' | 'charge'; interval: number; [key: string]: number | string };
}

export type ItemCategory = 'meleeWeapon' | 'rangedWeapon' | 'armor' | 'stat' | 'consumable';

/** Werte eines Items, alle relativ (0.15 = +15 %) außer regen und hp. */
export interface ItemStats {
  damage?: number;
  attackSpeed?: number;
  range?: number;
  damageReduction?: number;
  moveSpeed?: number;
  /** Leben pro Sekunde. */
  regen?: number;
  /** Zusätzliches maximales Leben. */
  hp?: number;
  cooldownReduction?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  price: number;
  stats?: ItemStats;
  /** Verbrauchsgüter: so viele passen auf einen Platz. */
  maxStack?: number;
  /** Verbrauchsgüter: Wirkung beim Benutzen. */
  use?: { duration: number; heal?: number; haste?: number; attackSpeed?: number };
}

export interface EconomyDef {
  startGold: number;
  waveBonusBase: number;
  waveBonusPerWave: number;
  /** Helden in diesem Umkreis um einen getöteten Zombie bekommen das volle Kill-Gold. */
  goldShareRange: number;
  /** Einkaufen nur in diesem Umkreis um das Herz. */
  shopRange: number;
  sellFactor: number;
  inventorySlots: number;
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
  /** Rattenrudel: ab fromWave, Anzahl 1 + (Welle − fromWave) × packsPerWave (abgerundet). */
  ratPacks?: { fromWave: number; packsPerWave: number; minSize: number; maxSize: number; type: string };
  /** Elites: alle `every` Wellen ⌊Welle/every⌋ Stück, Typen abwechselnd. */
  elites?: { every: number; types: string[] };
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
  progression: ProgressionDef;
  items: ItemDef[];
  economy: EconomyDef;
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

export type Command =
  | ({ heroId: number; type: 'input' } & HeroInput)
  /** Fähigkeit (slot 0–3) Richtung aim auslösen. */
  | { heroId: number; type: 'cast'; slot: number; aim: Vec2 }
  /** Skillpunkt in eine Fähigkeit stecken. */
  | { heroId: number; type: 'levelUp'; slot: number }
  /** Im Shop kaufen bzw. verkaufen (nur in der Pause im Innenhof). */
  | { heroId: number; type: 'buy'; itemId: string }
  | { heroId: number; type: 'sell'; slot: number; consumable?: boolean }
  /** Verbrauchsgut auf R (0) oder T (1) benutzen. */
  | { heroId: number; type: 'use'; slot: number };

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

export type BuffKind =
  | 'haste'
  | 'attackSpeed'
  | 'damageReduction'
  | 'damageMult'
  | 'unstoppable'
  | 'invisible'
  | 'shield'
  | 'heal'
  /** Kann nicht laufen (Kriecher). */
  | 'rooted'
  /** Kann nicht laufen, angreifen oder Fähigkeiten nutzen (Schlächter). */
  | 'stunned';

/** Zeitlich begrenzte Wirkung auf einem Helden. value: Faktor, Schildpunkte oder Heilung pro Sekunde. */
export interface Buff {
  kind: BuffKind;
  value: number;
  until: number;
  /** Herkunft, damit sich gleiche Buffs erneuern statt stapeln. */
  source: string;
}

/** Sprung oder Antritt: Bewegung von from nach to über duration Sekunden. */
export interface Dash {
  from: Vec2;
  to: Vec2;
  elapsed: number;
  duration: number;
  /** Sprunghöhe für die Darstellung (0 = Antritt am Boden). */
  height: number;
  /** Wird bei der Landung an das Heldenmodul gemeldet. */
  tag: string;
  targetId?: number;
}

/** Libero: der Ball als Objekt auf der Karte. */
export interface Ball {
  pos: Vec2;
  /** Id des Helden, der den Ball hält, sonst null (Ball liegt oder fliegt). */
  heldBy: number | null;
  flight: { from: Vec2; to: Vec2; elapsed: number; duration: number; tag: string; hitIds: number[] } | null;
}

export interface Hero extends Unit {
  /** Letzte Eingabe; gilt, bis eine neue kommt. */
  input: HeroInput;
  alive: boolean;
  /** Spielzeit, zu der ein gefallener Held wiederbelebt wird. */
  respawnAt: number;
  /** Startplatz (Slot) für die Wiederbelebung. */
  slot: number;
  level: number;
  /** XP seit dem letzten Level-up. */
  xp: number;
  skillPoints: number;
  /** Rang der vier Fähigkeiten (0 = noch nicht gelernt). */
  ranks: number[];
  /** Restliche Abklingzeit der vier Fähigkeiten in Sekunden. */
  cooldowns: number[];
  buffs: Buff[];
  dash: Dash | null;
  /** Kanalisieren (z. B. Powernap, Festhalten) bis zu dieser Zeit. */
  channel: { until: number; tag: string; cancelOnMove: boolean } | null;
  /** Letzter Kampfkontakt (Schaden ausgeteilt oder erhalten). */
  lastCombatAt: number;
  /** Zähler für Passive (z. B. Treffer bis zum nächsten Effekt). */
  counters: Record<string, number>;
  ball?: Ball;
  gold: number;
  /** Waffen und Items (Item-Ids), null = frei. */
  inventory: (string | null)[];
  /** Verbrauchsgüter auf R und T. */
  consumables: ({ itemId: string; count: number } | null)[];
}

/** Zustände eines Zombies; alle Zeiten sind Spielzeiten, 0 = nicht aktiv. */
export interface ZombieStatus {
  slowUntil: number;
  slowFactor: number;
  stunUntil: number;
  sleepUntil: number;
  fearUntil: number;
  fearFrom: Vec2;
  blindUntil: number;
  rootUntil: number;
  markedUntil: number;
  /** Mondlicht: Stapel und wann sie verfallen. */
  drowsy: number;
  drowsyUntil: number;
  /** Festgehalten von diesem Helden (Hetzjagd), solange rootUntil läuft. */
  heldBy: number | null;
}

export interface Zombie extends Unit {
  damage: number;
  /** Held, der gerade verfolgt wird. */
  targetId: number | null;
  /** Ziel (Objective-Id), zu dem der Zombie läuft, wenn er keinen Helden jagt. */
  objectiveId: string;
  st: ZombieStatus;
  /** Richtung beim Torkeln (geblendet). */
  wander: number;
  /** Elite: Restzeit bis zur nächsten Spezialfähigkeit. */
  specialTimer?: number;
  /** Schlächter: laufender Anlauf. */
  charge?: { dir: Vec2; remaining: number; hitIds: number[]; windup: number } | null;
}

/** Fläche mit Wirkung über Zeit (Dornen, Rauch, Hecke, Block). */
export interface Zone {
  id: number;
  /** Aussehen und Art, z. B. "thorns", "smoke", "hedge", "block". */
  kind: string;
  ownerId: number;
  pos: Vec2;
  radius: number;
  /** Nur Ring: Wirkung im Band radius ± ring. */
  ring?: number;
  /** Wirkt erst ab dieser Zeit (z. B. Saat wächst 2 s). */
  activeAt: number;
  until: number;
  slow?: number;
  /** Schaden pro Sekunde, ausgeteilt alle 0,5 s. */
  dps?: number;
  blind?: boolean;
  root?: boolean;
  /** Schiebt Zombies aus der Fläche, weg von pushFrom. */
  push?: boolean;
  pushFrom?: Vec2;
  tickTimer: number;
}

/** Verzögerte Wirkung einer Fähigkeit (z. B. Gähnen: Schlaf nach 1,5 s). */
export interface Delayed {
  at: number;
  ownerId: number;
  tag: string;
  pos: Vec2;
  targetIds: number[];
  value: number;
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
  /** Wird beim Treffer an das Heldenmodul gemeldet ("basic" = Standardangriff). */
  tag: string;
  /** Durchschlagend: trifft jeden Zombie auf der Bahn einmal. */
  pierce?: boolean;
  hitIds?: number[];
  /** Aussehen (z. B. "stone", "hook", "star", "ball"). */
  look?: string;
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
  | { type: 'gold'; heroId: number; amount: number; pos?: Vec2 }
  | { type: 'shop'; heroId: number; action: 'buy' | 'sell' | 'use'; itemId: string }
  | { type: 'shopDenied'; heroId: number; reason: string }
  | { type: 'elite'; zombieId: number; defId: string }
  | { type: 'charge'; zombieId: number; from: Vec2; to: Vec2 }
  | { type: 'heroStatus'; heroId: number; status: 'rooted' | 'stunned' }
  | { type: 'cast'; heroId: number; slot: number; pos: Vec2 }
  | { type: 'levelUp'; heroId: number; level: number }
  | { type: 'xp'; heroId: number; amount: number }
  | { type: 'status'; zombieId: number; status: 'sleep' | 'stun' | 'fear' | 'blind' | 'root' | 'mark' | 'wake' }
  | { type: 'land'; heroId: number; pos: Vec2; tag: string }
  | { type: 'effect'; kind: string; pos: Vec2; radius: number; facing?: number; arc?: number; heroId?: number }
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
  zones: Zone[];
  delayed: Delayed[];
  wave: WaveState;
  kills: number;
  gameOver: boolean;
  /** Ereignisse des letzten Ticks (für Effekte im Client). */
  events: GameEvent[];
}

/** Ticks pro Sekunde der Simulation. */
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

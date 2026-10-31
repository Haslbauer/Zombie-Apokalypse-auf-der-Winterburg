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
  /** Ziele mit Gewicht: Objective-Id oder Gruppe (z. B. { "bed": 0.75, "hive": 0.25 }). */
  targets: Record<string, number>;
  /** Bevorzugte Spawnpunkte (Id → Anteil); "*" verteilt den Rest auf die übrigen nach ihrem Gewicht. */
  spawnAt?: Record<string, number>;
  /** Greift Helden nur an, wenn sie sehr nah sind oder ihn getroffen haben (Ratten, Hornissen). */
  provokeOnly?: boolean;
  /** Fliegt über Hindernisse (Hornissen). */
  flying?: boolean;
  /** Kleine Einheit (Ratten): passt durch das Rattenloch und enge Lücken. */
  small?: boolean;
  /**
   * Sidequest (Zombie-Postbote): läuft die Route im Gelände ab und zählt nicht
   * zur Welle. Nach stay Sekunden ist er weg. Wer ihn besiegt: Gold für alle Helden.
   */
  /** Postbote: Paket-Gold (gold + goldPerWave × Welle). stay: veraltet (er bleibt, bis er stirbt). */
  courier?: { gold: number; goldPerWave: number; stay?: number };
  /**
   * Neutral (Lager, Postbote): greift erst an, wenn er angegriffen wird, dann
   * mit allen aus seinem Lager. Entfernt er sich mehr als leash Meter von
   * seinem Platz, kehrt er um und heilt sich voll (wie im LoL-Dschungel).
   */
  neutral?: { leash: number };
  /** Bossfähigkeiten wie bei den Helden (mit Warnzeit, ausweichbar), siehe sim/bossabilities.ts. */
  abilities?: BossAbilityDef[];
  /** Team-Buff, wenn dieser Boss fällt (alle lebenden Helden). */
  teamBuff?: TeamBuffDef;
  /** Elite-Fähigkeit mit ihren Werten. */
  special?: { kind: 'summon' | 'charge' | 'leap' | 'parcel'; interval: number; [key: string]: number | string };
}

/**
 * Bossfähigkeit: slam = schwerer Schlag auf das Ziel (Tank-Prüfung), nova =
 * Fläche um den Boss, bolt = Einschläge bei count Helden (bevorzugt hinten).
 * Erst windup Sekunden Warnung am Boden, dann Schaden im Radius.
 */
export interface BossAbilityDef {
  kind: 'slam' | 'nova' | 'bolt';
  name: string;
  interval: number;
  windup: number;
  range: number;
  radius: number;
  damage: number;
  /** Seuche-Stapel für jeden Getroffenen. */
  plague?: number;
  /** Betäubung in Sekunden. */
  stun?: number;
  /** bolt: so viele Helden. */
  count?: number;
  /** Erst ab dieser Welle. */
  fromWave?: number;
}

/** Team-Buff durch einen Boss-Kill: Wirkungen für duration Sekunden. */
export interface TeamBuffDef {
  name: string;
  icon: string;
  duration: number;
  /** Wirkungen als Buff-Art → Wert (z. B. damageMult 1.2, attackSpeed 0.25, haste 0.15). heal = Anteil maxHp pro Sekunde. */
  effects: Partial<Record<'damageMult' | 'attackSpeed' | 'haste' | 'damageReduction' | 'heal', number>>;
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
  /** Gesamtpreis; bei Rezepten inklusive der Bauteile. */
  price: number;
  /** Rezept (wie in LoL): Bauteile, die beim Kauf verbraucht und auf den Preis angerechnet werden. */
  from?: string[];
  stats?: ItemStats;
  /** Verbrauchsgüter: so viele passen auf einen Platz. */
  maxStack?: number;
  /** Verbrauchsgüter: Wirkung beim Benutzen. */
  use?: { duration: number; heal?: number; haste?: number; attackSpeed?: number };
}

export interface EconomyDef {
  roles?: RolesDef;
  plague?: PlagueDef;
  startGold: number;
  waveBonusBase: number;
  waveBonusPerWave: number;
  /** Helden in diesem Umkreis um einen getöteten Zombie bekommen das volle Kill-Gold. */
  goldShareRange: number;
  /** Einkaufen nur in diesem Umkreis um das Herz. */
  shopRange: number;
  sellFactor: number;
  inventorySlots: number;
  /**
   * Bosse (Elites, Postbote, große Neutrale) wie in LoL: Der letzte Treffer
   * bringt gold + goldPerWave × Welle, jeder andere Held, der in den letzten
   * assistWindow Sekunden Schaden gemacht hat, den Anteil assistShare.
   * Der erste Boss der Partie bringt zusätzlich firstBlood.
   */
  boss: { gold: number; goldPerWave: number; assistShare: number; firstBlood: number; assistWindow: number };
  /**
   * Belohnung nach Leistung (wie in LoL): Der letzte Treffer bekommt das volle
   * Kill-Gold, wer in den letzten assistWindow Sekunden Schaden gemacht hat den
   * Anteil assistGold, Zuschauer nichts. Erfahrung: Killer xpKiller, Mitkämpfer
   * xpAssist, Helden in der Nähe (xpShareRange) xpNearby.
   */
  rewards: {
    assistWindow: number;
    assistGold: number;
    xpKiller: number;
    xpAssist: number;
    xpNearby: number;
    /** Gewichte der Wertung nach Spielende (sim/stats.ts). */
    mvp?: Partial<Record<'kills' | 'bosses' | 'assists' | 'damage' | 'healing' | 'damageTaken' | 'deaths', number>>;
  };
}

/** Punktestand eines Helden (Anzeigetafel). */
export interface HeroScore {
  kills: number;
  bosses: number;
  assists: number;
  /** Insgesamt verdientes Gold. */
  gold: number;
}

/** Statistik für den Bildschirm nach Spielende (nicht in den Schnappschüssen, siehe sim/stats.ts). */
export interface HeroStats {
  /** Schaden an Zombies und Neutralen. */
  damage: number;
  /** Erlittener Schaden nach Rüstung und Schild. */
  damageTaken: number;
  /** Heilung durch Fähigkeiten und Zauber (an sich und Verbündeten). */
  healing: number;
  deaths: number;
  /** Kills seit dem letzten Tod und die längste Serie. */
  streak: number;
  bestStreak: number;
  /** Kills je Welle (Index 0 = Welle 1). */
  killsPerWave: number[];
  /** Eingesetzte Fähigkeiten und Beschwörerzauber. */
  casts: number;
  goldSpent: number;
}

/** Endstatistik eines Helden (im gameOver-Ereignis, nach Wertung sortiert). */
export interface FinalHeroStats {
  heroId: number;
  defId: string;
  bot: boolean;
  level: number;
  score: HeroScore;
  stats: HeroStats;
  /** Wertung wie in LoL (sim/stats.ts mvpScore). */
  mvp: number;
}

/** Endstatistik des Teams. */
export interface TeamStats {
  wave: number;
  time: number;
  kills: number;
  bosses: number;
  couriers: number;
  /** Vorrat übrig in Prozent (0–100). */
  food: number;
  bedsAlive: number;
  beds: number;
  /** Leben des Bienenstocks in Prozent, null ohne Stock. */
  hive: number | null;
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
  /**
   * Rudel und Schwärme: ab fromWave, Anzahl 1 + (Welle − fromWave) × packsPerWave (abgerundet),
   * je minSize–maxSize Tiere; sizePerWave lässt beide Grenzen mit jeder Welle wachsen (abgerundet).
   */
  packs?: { type: string; fromWave: number; packsPerWave: number; minSize: number; maxSize: number; sizePerWave?: number }[];
  /** Elites: alle `every` Wellen, Anzahl ⌈Welle/countEvery⌉ (Standard: ⌊Welle/every⌋), Typen abwechselnd. */
  /**
   * Zwischenbosse: ab fromWave alle every Wellen, ab everyFrom in jeder Welle;
   * 1 + (Welle − fromWave) / countPerWaves Stück, abwechselnd aus types.
   * hpPerWave: zusätzlicher Lebensanteil je Welle (stärker als normale Zombies).
   */
  elites?: { fromWave?: number; every: number; everyFrom?: number; countPerWaves?: number; countEvery?: number; hpPerWave?: number; types: string[] };
  /** Wut: Bosse, die länger als after Sekunden leben, machen je Sekunde perSecond mehr Schaden (bis max). */
  bossEnrage?: { after: number; perSecond: number; max: number };
  /** Diese Welle überstanden = Sieg (fehlt: endlos). */
  victoryWave?: number;
  /** Sidequest: Typ mit courier-Werten, erscheint ab firstWave alle every Wellen, delay Sekunden nach Wellenbeginn. */
  /**
   * Sidequest Postbote: erscheint ab firstWave delay Sekunden nach Wellenbeginn
   * und bleibt, bis er getötet wird; every Wellen nach seinem Tod kommt ein neuer.
   */
  courier?: { type: string; firstWave: number; every: number; delay: number };
}

/** Aussehen eines Hindernisses (nur für die Darstellung). */
export type ObstacleLook =
  | 'house'
  /** Kellerloch in der Hofmauer: nur kleine Einheiten (Ratten) kommen durch. */
  | 'rathole'
  /** Verfallener Hausflügel (halb eingestürzt); Kollision wie ein Haus. */
  | 'ruin'
  | 'car'
  | 'well'
  | 'hedge'
  | 'fence'
  | 'tree'
  | 'bed'
  | 'blocked'
  | 'objective'
  // Garten und Gelände (nur Aussehen; als Hindernis wirken sie wie jedes Rechteck bzw. jeder Kreis)
  | 'swing'
  | 'shed'
  | 'compost'
  | 'woodpile'
  | 'barrel'
  | 'bench'
  | 'lamp'
  | 'wheelbarrow'
  | 'flowers'
  | 'grave'
  | 'rock'
  | 'log'
  | 'deadtree'
  | 'pond';

/** Nur Darstellung, ohne Wirkung im Spiel: Pflaster, Kieswege, Friedhofszaun. Rechteck mit Mittelpunkt. */
export interface DecorDef {
  look: 'cobbles' | 'gravel' | 'gravefence';
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ObstacleBase {
  look?: ObstacleLook;
  /** Hält Schüsse auf (Standard true). Niedrige Hindernisse wie Beete lassen sie durch. */
  blocksShots?: boolean;
}

/** Reine Form (Kreis oder Rechteck mit Mittelpunkt), z. B. für Abstandsberechnungen. */
export type Shape = { kind: 'circle'; x: number; y: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number };

export type Obstacle =
  | (ObstacleBase & { kind: 'circle'; x: number; y: number; r: number })
  /** Rechteck mit Mittelpunkt x/y, Breite w und Höhe h. */
  | (ObstacleBase & { kind: 'rect'; x: number; y: number; w: number; h: number });

/** Versteck (wie das Gebüsch in LoL): Busch, hohes Gras oder Schilf. Begehbar, kein Hindernis. */
export type BrushLook = 'bush' | 'grass' | 'reed';
export type Brush =
  | { kind: 'circle'; x: number; y: number; r: number; look: BrushLook }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; look: BrushLook };

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
  /** Bestäubung: Jedes intakte Beet heilt den Stock um so viel Leben pro Sekunde. */
  pollenHeal?: number;
  /** Ohne intakte Beete verliert der Stock so viel Leben pro Sekunde (die Bienen hungern). */
  starve?: number;
  damage: number;
  /** Sekunden zwischen zwei Stichen. */
  interval: number;
  range: number;
  /** So lange bleiben die Bienen nach Schaden am Stock wütend. */
  aggroDuration: number;
}

/** Ziel, das die Gegner angreifen (Lebensmittelvorrat, Bienenstock, Hochbeete). */
export interface ObjectiveDef {
  id: string;
  name: string;
  /** Gruppe/Art: "food", "hive", "bed". Gegner können eine Gruppe als Ziel haben. */
  kind: string;
  x: number;
  y: number;
  /** Kreis mit radius, oder Rechteck (Mittelpunkt x/y) mit w und h. */
  radius: number;
  w?: number;
  h?: number;
  /** Hochbeete: Ernte für den Vorrat pro Pause (bei vollem Leben) und Wellen bis zum Nachwachsen. */
  harvest?: number;
  regrowWaves?: number;
  /** Text bei Niederlage. */
  lostText?: string;
  hp: number;
  /** Regeneration pro Sekunde während einer Welle bzw. in der Pause. */
  regen: number;
  pauseRegen: number;
  /** Fällt dieses Ziel, ist das Spiel verloren. */
  loseOnDestroy: boolean;
  bees?: BeesDef;
}

export interface ArenaDef {
  /** Begehbare Fläche: x von minX (Standard 0) bis width, y von minY bis height. */
  minX?: number;
  minY?: number;
  width: number;
  height: number;
  /** Der Garten innerhalb der Karte (nur Darstellung); außen liegt das Gelände mit den Spawnpunkten. */
  garden?: { x: number; y: number; w: number; h: number };
  /** Wege im Gelände (nur Darstellung). */
  paths?: { x: number; y: number; w: number; h: number }[];
  /** Kantenlänge einer Rasterzelle für die Pfadsuche. */
  cellSize: number;
  obstacles: Obstacle[];
  spawnPoints: SpawnPoint[];
  slowZones: SlowZone[];
  objectives: ObjectiveDef[];
  heroStart: Vec2;
  /** Wiederbelebung: base Sekunden plus perWave je Welle. */
  respawn: { base: number; perWave: number };
  /** Posten, die Bots verteidigen (der Reihe nach vergeben). */
  botPosts?: Vec2[];
  /** Rundweg des Postboten im Gelände (geschlossene Schleife). */
  courierRoute?: Vec2[];
  /** Neutrale Lager im Gelände: Typen der Bewohner, Wiederkehr respawn Sekunden nach dem Leeren. */
  camps?: CampDef[];
  /** Verstecke: Wer darin steht, wird von Gegnern erst aus nächster Nähe gesehen. */
  brush?: Brush[];
  /** Deko ohne Spielwirkung (nur Darstellung). */
  decor?: DecorDef[];
  /** Kleinkram ohne Kollision (Feuerfässer, Knochen, Krähen …), nur Darstellung. */
  props?: PropDef[];
}

export const PROP_LOOKS = [
  'firebarrel',
  'barricade',
  'bones',
  'blood',
  'mushrooms',
  'web',
  'opengrave',
  'scarecrow',
  'cart',
  'crows',
  'barbedwire',
  'planks',
  'campfire',
  'stump',
  'fern',
  'tires',
  'birdbath',
  'cross',
  'woodstack',
  'wildflowers',
  'brokenfence',
  'clothesline',
  'trashcan',
  'canister',
  'glass',
  'scorch',
  'puddle',
  'crates',
  'papers',
  'tent',
  'tape',
  'sign',
  'bodybag',
  'mailbox',
  'dirt',
] as const;

/** Deko-Objekt an einem Punkt; rot dreht um die Hochachse, w: Breite (Barrikade), h: Höhe (Krähen auf Zaun/Grabstein). */
export interface PropDef {
  look: (typeof PROP_LOOKS)[number];
  x: number;
  y: number;
  rot?: number;
  w?: number;
  h?: number;
}

export interface CampDef {
  id: string;
  name: string;
  x: number;
  y: number;
  units: string[];
  respawn: number;
}

export type BotDifficulty = 'leicht' | 'mittel' | 'schwer';
export type BotRole = 'melee' | 'ranged' | 'control';

/** Wann ein Bot eine Fähigkeit einsetzt (siehe src/sim/bots/abilities.ts). */
export interface BotAbilityHint {
  use: 'engage' | 'aoe' | 'cone' | 'line' | 'heal' | 'channelHeal' | 'buff' | 'escape' | 'elite' | 'pass' | 'spike';
  /** Mindestzahl Zombies im Wirkbereich. */
  min?: number;
  /** Lebensanteil, unter dem geheilt bzw. geflohen wird. */
  hp?: number;
}

export interface BotsDef {
  difficulties: Record<BotDifficulty, { think: number; aimError: number; abilityChance: number; retreatHp: number }>;
  heroes: Record<string, { role: BotRole; teamRole?: TeamRole; skillOrder: number[]; buy: string[]; abilities: BotAbilityHint[] }>;
}

/** Rolle im Team: ohne Tank, Schaden und Support ist das Spiel kaum zu gewinnen. */
export type TeamRole = 'tank' | 'dmg' | 'support';
export const TEAM_ROLES: readonly TeamRole[] = ['tank', 'dmg', 'support'];

/** Rollen-Passive (data/economy.json → roles). */
export interface RolesDef {
  tank: { name: string; icon: string; description: string; damageReduction: number; threatRange: number };
  dmg: { name: string; icon: string; description: string; bossDamage: number };
  support: { name: string; icon: string; description: string; auraRadius: number; auraHeal: number; cleanseEvery: number };
}

/** Seuche: Schaden über Zeit durch Bossfähigkeiten, stapelbar; nur Supports (und Reinigen) entfernen sie. */
export interface PlagueDef {
  dpsPerStack: number;
  duration: number;
  maxStacks: number;
}

export interface GameData {
  heroes: HeroDef[];
  zombies: ZombieDef[];
  waves: WaveConfig;
  arena: ArenaDef;
  progression: ProgressionDef;
  items: ItemDef[];
  economy: EconomyDef;
  bots: BotsDef;
  spells: SpellsDef;
}

/**
 * Beschwörerzauber (wie in LoL): zwei pro Held, vor dem Spiel gewählt, auf D
 * und F. aim: point (Ort), unit (Gegner am Mauszeiger), self (sofort).
 */
export interface SpellDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  cooldown: number;
  aim: 'point' | 'unit' | 'self';
  description: string;
  values: Record<string, number>;
}

export interface SpellsDef {
  spells: SpellDef[];
  /** Vorgabe je Rolle (melee, ranged, control) bzw. Helden-Id. */
  defaults: Record<string, [string, string]>;
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
  | { heroId: number; type: 'use'; slot: number }
  /** Pause beenden und die nächste Welle sofort starten. */
  | { heroId: number; type: 'startWave' }
  | { heroId: number; type: 'ping'; kind: PingKind; pos: Vec2 }
  /** Beschwörerzauber (slot 0 = D, 1 = F) Richtung aim. */
  | { heroId: number; type: 'spell'; slot: number; aim: Vec2 }
  /** Beschwörerzauber wählen (nur in der Pause). */
  | { heroId: number; type: 'chooseSpells'; spells: [string, string] };

/** Pings für Absprachen im Team (wie in LoL): Hier, Angriff, Bin unterwegs, Hilfe, Gefahr. */
export const PING_KINDS = ['here', 'attack', 'omw', 'help', 'danger'] as const;
export type PingKind = (typeof PING_KINDS)[number];

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
  | 'stunned'
  /** Reinigen: kurz immun gegen Festhalten und Betäubung. */
  | 'cleansed';

/** Zeitlich begrenzte Wirkung auf einem Helden. value: Faktor, Schildpunkte oder Heilung pro Sekunde. */
export interface Buff {
  kind: BuffKind;
  value: number;
  until: number;
  /** Herkunft, damit sich gleiche Buffs erneuern statt stapeln. */
  source: string;
  /** Held, der den Buff gegeben hat (Heilung zählt für seine Endstatistik). */
  by?: number;
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
  /** Zeitpunkte der letzten Pings (Spam-Schutz). */
  pingTimes?: number[];
  /** Index des Verstecks, in dem der Held steht (−1: keins); jeden Tick neu bestimmt. */
  brush?: number;
  /** Nach Angriff oder Fähigkeit bis zu diesem Zeitpunkt sichtbar, auch im Versteck. */
  revealedUntil?: number;
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
  /** Beschwörerzauber (Ids) und ihre Restabklingzeit in Sekunden. */
  spells: [string, string];
  spellCooldowns: [number, number];
  /** Teleport: Ziel, solange kanalisiert wird. */
  teleportTo?: Vec2 | null;
  ball?: Ball;
  gold: number;
  score: HeroScore;
  /** Endstatistik (nur Server/lokal, nicht in den Schnappschüssen). */
  stats?: HeroStats;
  /** Seuche (Bossfähigkeiten): Stapel und Ablauf (Spielzeit). */
  plague?: { stacks: number; until: number } | null;
  /** Welle, in der der Held zuletzt Schaden an Zombies gemacht hat (Wellenbonus nur für Aktive). */
  activeWave?: number;
  /** Letzte eigene Eingabe eines Menschen (Laufen, Angriff, Fähigkeit, Einkauf …), Spielzeit. */
  lastActiveAt?: number;
  /** Abwesend (Mensch ohne Eingabe seit AFK_TIME): Zombies ignorieren ihn, keine Belohnung. */
  afk?: boolean;
  /** Waffen und Items (Item-Ids), null = frei. */
  inventory: (string | null)[];
  /** Verbrauchsgüter auf R und T. */
  consumables: ({ itemId: string; count: number } | null)[];
  /** Gesetzt, wenn ein Bot diesen Helden steuert (in M6 übernimmt ein Mensch, indem bot entfällt). */
  bot?: BotState;
}

export interface BotState {
  difficulty: BotDifficulty;
  /** Posten, den der Bot verteidigt. */
  post: Vec2;
  mode: 'post' | 'fight' | 'retreat' | 'shop';
  thinkAt: number;
  targetId: number | null;
  /** Wegpunkte zum aktuellen Ziel und wann sie neu berechnet werden. */
  path: Vec2[];
  dest: Vec2 | null;
  pathAt: number;
  /** Zielfehler, beim Denken neu gewürfelt. */
  aimOffset: Vec2;
  /** Auftrag aus einem Ping eines Menschen (siehe orderBots). */
  order?: BotOrder | null;
  /** Gefahr-Ping: diesen Bereich meiden. */
  avoid?: { pos: Vec2; radius: number; until: number } | null;
}

/**
 * Auftrag an einen Bot: attack (Ziel bzw. Ort angreifen), help (Helden
 * beschützen), here (Ort halten). until: Spielzeit, bis zu der er gilt.
 */
export interface BotOrder {
  kind: 'attack' | 'help' | 'here';
  pos: Vec2;
  targetId: number | null;
  heroId: number;
  until: number;
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
  /** Von diesem Helden getroffen (gereizt) bis provokedUntil – für Ratten und Hornissen. */
  provokedBy: number | null;
  provokedUntil: number;
  /** Entzünden: brennt bis, Schaden pro Sekunde, von welchem Helden. */
  burnUntil?: number;
  burnDps?: number;
  burnBy?: number;
  /** Erschöpfen: macht bis dahin weniger Schaden (Faktor weakFactor). */
  weakUntil?: number;
  weakFactor?: number;
  /** Boss in Wut (zu lange am Leben): bis dahin angezeigt, jeden Tick aufgefrischt. */
  enrageUntil?: number;
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
  /** Spielzeit beim Erscheinen (Wut der Bosse). */
  bornAt?: number;
  /** Bossfähigkeiten: Abklingzeiten und laufende Ausführung (Warnung an points). */
  abil?: { timers: number[]; cast: { i: number; left: number; points: Vec2[] } | null };
  /** Elite: Restzeit bis zur nächsten Spezialfähigkeit. */
  specialTimer?: number;
  /** Schlächter: laufender Anlauf. */
  charge?: { dir: Vec2; remaining: number; hitIds: number[]; windup: number } | null;
  /** Postbote: geworfenes Paket landet zur Zeit at bei to. */
  parcel?: { to: Vec2; at: number } | null;
  /** Dämon: Höllensprung von from nach to; erst windup Sekunden Warnung, dann flight Sekunden in der Luft. */
  leap?: { from: Vec2; to: Vec2; windup: number; flight: number; total: number } | null;
  /** Postbote: nächster Wegpunkt, Laufrichtung (+1/−1) und wann er verschwindet. */
  courier?: { wp: number; dir: number; leaveAt: number };
  /** Neutrale: Lager (oder null beim Postboten), Platz, zu dem er zurückkehrt, und ob er gerade heimkehrt. */
  neutral?: {
    campId: string | null;
    home: Vec2;
    returning: boolean;
    /** Kampfbeginn und letzter eigener Treffer (für das Zurücksetzen, wenn er niemanden erreicht). */
    engagedAt?: number | null;
    lastHitAt?: number;
  };
  /** Bosse: Helden, die Schaden gemacht haben, mit Zeitpunkt des letzten Treffers (für Assists). */
  contrib?: { id: number; t: number }[];
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
  kind: string;
  pos: Vec2;
  radius: number;
  w?: number;
  h?: number;
  /** Zerstörte Beete: Wellen bis zum Nachwachsen. */
  regrowIn: number;
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
  /** Spielzeit, zu der in dieser Welle der Postbote erscheint (null: keiner). */
  courierAt?: number | null;
  /** Ab dieser Welle darf der nächste Postbote erscheinen (nach dem Tod des vorigen + every). */
  courierWave?: number;
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
  | { type: 'harvest'; amount: number }
  | { type: 'regrow'; objectiveId: string }
  | { type: 'gold'; heroId: number; amount: number; pos?: Vec2 }
  | { type: 'spell'; heroId: number; spellId: string; from: Vec2; to: Vec2; targetId?: number }
  | { type: 'bossKill'; zombieId: number; defId: string; killerId: number | null; assists: number[]; gold: number; assistGold: number; firstBlood: boolean }
  | { type: 'shop'; heroId: number; action: 'buy' | 'sell' | 'use'; itemId: string }
  | { type: 'shopDenied'; heroId: number; reason: string }
  | { type: 'elite'; zombieId: number; defId: string }
  | { type: 'courier'; zombieId: number; phase: 'arrive' | 'caught' | 'escaped'; gold?: number }
  | { type: 'camp'; campId: string; phase: 'spawn' | 'cleared' | 'reset' }
  | { type: 'ping'; heroId: number; kind: PingKind; pos: Vec2 }
  | { type: 'charge'; zombieId: number; from: Vec2; to: Vec2 }
  | { type: 'bossCast'; zombieId: number; kind: BossAbilityDef['kind']; name: string; points: Vec2[]; radius: number; windup: number }
  | { type: 'bossHit'; zombieId: number; kind: BossAbilityDef['kind']; points: Vec2[]; radius: number }
  | { type: 'teamBuff'; defId: string; name: string; icon: string; duration: number }
  | { type: 'parcel'; zombieId: number; from: Vec2; to: Vec2; radius: number; windup: number }
  | { type: 'leap'; zombieId: number; from: Vec2; to: Vec2; radius: number; windup: number }
  | { type: 'heroStatus'; heroId: number; status: 'rooted' | 'stunned' }
  | { type: 'cast'; heroId: number; slot: number; pos: Vec2 }
  | { type: 'levelUp'; heroId: number; level: number }
  | { type: 'xp'; heroId: number; amount: number }
  | { type: 'status'; zombieId: number; status: 'sleep' | 'stun' | 'fear' | 'blind' | 'root' | 'mark' | 'wake' }
  | { type: 'land'; heroId: number; pos: Vec2; tag: string }
  | { type: 'effect'; kind: string; pos: Vec2; radius: number; facing?: number; arc?: number; heroId?: number }
  | { type: 'gameOver'; wave: number; reason: string; victory?: boolean; stats?: FinalHeroStats[]; team?: TeamStats };

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
  /** Gewonnen (letzte Welle überstanden)? */
  victory?: boolean;
  /** Erwischte Postboten (Endstatistik). */
  couriersCaught?: number;
  /** Wurde schon ein Boss erlegt? (Erstes Blut gibt es nur einmal.) */
  firstBlood?: boolean;
  /** Neutrale Lager: wann ein geleertes Lager wiederkommt (null: besetzt). */
  camps: { id: string; respawnAt: number | null }[];
}

/** Ticks pro Sekunde der Simulation. */
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

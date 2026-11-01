import * as THREE from 'three';
import type { BuffRing } from './buffrings';
import { tickMarks } from './hpticks';
import type { Hero, HeroDef, Minion, Unit, Zombie, ZombieDef } from '../sim/types';
import { instantiate, type ModelInstance, type RiggedModel } from './models';
import { groundGlow } from './nightdecor';
import type { Snapshot } from './renderer';

const UNIT_HEIGHT = 1.6;
const WHITE = new THREE.Color(0xffffff);

/** Kleine Textsymbole über Einheiten (Zzz, Sterne …), einmal erzeugt und wiederverwendet. */
const iconCache = new Map<string, THREE.SpriteMaterial>();
function iconMaterial(text: string, color: string): THREE.SpriteMaterial {
  const key = text + color;
  let material = iconCache.get(key);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.font = 'bold 72px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(text, 64, 68);
    g.fillStyle = color;
    g.fillText(text, 64, 68);
    material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true });
    iconCache.set(key, material);
  }
  return material;
}

type Prop = 'cleaver' | 'hammer' | 'staff' | 'hook' | 'sling' | 'tricorn' | 'sunhat' | 'crown' | 'parcel' | 'cap' | 'hardhat' | 'clipboard' | 'stamp' | 'beehat' | 'smoker' | 'glasses' | 'apron' | 'loupe' | 'pigtails' | 'teddy' | 'divehelm' | 'airtank' | 'harpoongun' | 'bonnet' | 'handbell' | 'shawl' | 'felthat' | 'axe' | 'scythe' | 'icecrown';

/**
 * Aussehen einer animierten Figur (public/models/<model>.glb). move: Lauf-Clip,
 * refSpeed: Tempo, bei dem er normal schnell läuft. tint multipliziert die
 * Textur (Werte über 1 hellen auf – die Mixamo-Figur trägt einen schwarzen Anzug).
 */
interface ModelLook {
  /** Modellname; bei mehreren wählt die Einheits-Id eine Variante. */
  model: string | string[];
  move: string;
  /** Schnellere Variante ab fastAbove m/s (z. B. schnelles Kriechen). */
  moveFast?: string;
  fastAbove?: number;
  idle?: string;
  refSpeed: number;
  scale: number;
  tint: [number, number, number];
  /** Textur durch die Einheitenfarbe ersetzen (Helden im dunklen Mocap-Anzug). */
  paint?: boolean;
  /** Angriffs-Clips, abwechselnd bzw. zufällig. */
  attacks: string[];
  /**
   * Anteil des Angriffs-Clips, der übersprungen wird (Ausholen), damit der
   * Schuss bzw. Hieb sichtbar mit dem Geschoss zusammenfällt.
   */
  attackStart?: number;
  /** Treffermoment je Angriffs-Clip (Anteil), überschreibt den vom Konverter gemessenen. */
  impact?: Record<string, number>;
  props?: Prop[];
  /** Kopfknochen für Hüte und Krone (Mixamo: mixamorigHead). */
  headBone?: string;
  /** Knochen für Requisiten in der Hand (Mixamo: mixamorigRightHand) und Abstand entlang des Knochens in Metern. */
  handBone?: string;
  handOffset?: number;
  /** Hut höher bzw. tiefer setzen (große Comic-Köpfe), in Metern. */
  headOffset?: number;
  /** Einfarbig statt Textur (z. B. heller Imkeranzug); Hautfarbe bleibt unter Hut und Schleier verborgen. */
  plain?: number;
  /** Schwebehöhe über dem Boden (Hornissen). */
  lift?: number;
}

/**
 * Zombies: Mixamo-Figuren mit den gemeinsamen Zombie-Animationen
 * (assets/models/zombie), dazu Tiere (Quaternius). Schwere Gegner sind
 * deutlich größer und tragen einen leuchtenden Ring (ELITE_COLORS).
 */
const Z = { idle: 'idle', attacks: ['attack', 'bite', 'bite3'] } as const;
const ZOMBIE_LOOKS: Record<string, ModelLook> = {
  // Polizisten-Zombies sind die häufigsten (2 von 3)
  walker: { model: ['zombie-cop', 'zombie-cop', 'zombie-girl'], move: 'walk', refSpeed: 1.4, scale: 1, tint: [1, 1, 1], ...Z, attacks: [...Z.attacks] },
  runner: { model: ['zombie-parasite', 'zombie-skeleton'], move: 'run', moveFast: 'run2', fastAbove: 4.5, refSpeed: 3.8, scale: 1, tint: [1, 1, 1], ...Z, attacks: [...Z.attacks] },
  crawler: { model: 'zombie-girl', move: 'crawl', moveFast: 'crawlFast', fastAbove: 1.6, refSpeed: 0.8, scale: 1, tint: [0.85, 0.95, 0.8], attacks: [] },
  brute: { model: 'zombie-pumpkin', move: 'walk', refSpeed: 1.2, scale: 1.5, tint: [1, 1, 1], ...Z, attacks: ['attack', 'bite'] },
  butcher: { model: 'zombie-warrok', move: 'walk', refSpeed: 1.1, scale: 1.9, tint: [1.15, 0.9, 0.85], ...Z, attacks: ['attack', 'bite'], props: ['cleaver'], handOffset: 0.08 },
  postman: { model: 'zombie-war', move: 'walk', moveFast: 'run', fastAbove: 3, refSpeed: 2.4, scale: 1.05, tint: [1, 1, 1], ...Z, attacks: [...Z.attacks], props: ['parcel', 'cap'] },
  demon: { model: 'zombie-demon', move: 'walk', moveFast: 'run', fastAbove: 3, refSpeed: 2.2, scale: 1.35, tint: [1, 1, 1], ...Z, attacks: ['attack', 'bite'] },
  spider: { model: 'spider', move: 'walk', idle: 'idle', refSpeed: 3.5, scale: 1, tint: [0.75, 0.85, 0.6], attacks: ['attack', 'attack2'] },
  bigspider: { model: 'spider', move: 'walk', idle: 'idle', refSpeed: 3.2, scale: 2.2, tint: [0.6, 0.75, 0.5], attacks: ['attack', 'attack2'] },
  toad: { model: 'frog', move: 'walk', idle: 'idle', refSpeed: 1.6, scale: 2.6, tint: [0.62, 0.62, 0.5], attacks: ['attack'] },
  rat: { model: 'rat', move: 'run', idle: 'idle', refSpeed: 5, scale: 1.2, tint: [1.8, 1.7, 1.6], attacks: ['attack', 'attack2'] },
  ratking: { model: 'rat', move: 'walk', idle: 'idle', refSpeed: 1.2, scale: 3, tint: [1.4, 1.1, 0.8], attacks: ['attack', 'attack2'], props: ['crown'], headBone: 'Head' },
  // Lottes Trolle: grüner Kürbis-Hulk ohne Kürbis-Ton, je Art größer
  troll: { model: 'zombie-pumpkin', move: 'walk', refSpeed: 2.4, scale: 0.95, tint: [0.55, 0.95, 0.5], ...Z, attacks: ['attack', 'bite'] },
  bridgetroll: { model: 'zombie-pumpkin', move: 'walk', refSpeed: 1, scale: 1.7, tint: [0.5, 0.75, 0.55], ...Z, attacks: ['attack', 'bite'] },
  gianttroll: { model: 'zombie-pumpkin', move: 'walk', refSpeed: 2, scale: 2.3, tint: [0.45, 0.85, 0.45], ...Z, attacks: ['attack', 'bite'] },
  // Endgegner Bauamt: riesiger Beamter mit Bauhelm und Amtsstempel; Sachbearbeiter mit Klemmbrett
  bauamt: { model: 'zombie-cop', move: 'walk', refSpeed: 1.0, scale: 2.4, tint: [0.95, 0.95, 1.05], ...Z, attacks: ['attack', 'bite'], props: ['hardhat', 'stamp'], handOffset: 0.06 },
  clerk: { model: 'zombie-cop', move: 'walk', refSpeed: 1.4, scale: 1, tint: [0.85, 0.9, 1.05], ...Z, attacks: [...Z.attacks], props: ['clipboard'] },
  // Vogelscheuche: strohfarbener Zombie mit Sonnenhut und Sense
  scarecrow: { model: 'zombie-cop', move: 'walk', refSpeed: 1.6, scale: 1.55, tint: [1, 1, 1], plain: 0xb89a52, ...Z, attacks: ['attack', 'bite'], props: ['sunhat', 'scythe'], handOffset: 0.06 },
  // Frostriese: großer, eisblauer Hüne mit Eiskrone
  frostgiant: { model: 'zombie-warrok', move: 'walk', refSpeed: 1.0, scale: 2.15, tint: [0.65, 0.95, 1.4], ...Z, attacks: ['attack', 'bite'], props: ['icecrown'] },
  hornet: { model: 'wasp', move: 'fly', idle: 'fly', refSpeed: 4.5, scale: 1.6, tint: [1, 1, 1], attacks: ['attack'], lift: 0.9 },
};

/** Leuchtfarbe der schweren Gegner (Boden-Ring, Augen, Namensschild). */
export const ELITE_COLORS: Record<string, number> = {
  butcher: 0xff2a1a,
  bauamt: 0xf2c200,
  demon: 0xb04dff,
  ratking: 0xffc93c,
  postman: 0xffd166,
  brute: 0xff8a1c,
  bigspider: 0x9be564,
  toad: 0x7fd6a0,
  scarecrow: 0xe0b040,
  frostgiant: 0x7fd1ff,
};

/** Helden mit Modell (assets/models/<held>): Grimm ist ein Schäferhund (Quaternius), die übrigen Mixamo-Figuren mit eigenen Texturen. */
const HERO_LOOKS: Record<string, ModelLook> = {
  grimm: { model: 'grimm', move: 'run', idle: 'idle', refSpeed: 6.5, scale: 1, tint: [1.25, 1.2, 1.15], attacks: ['attack'] },
  rotschopf: { model: 'rotschopf', move: 'run', idle: 'idle', refSpeed: 5.5, scale: 1.08, tint: [1, 1, 1], attacks: ['attack'], attackStart: 0.25 },
  schlaeferin: { model: 'schlaeferin', move: 'run', idle: 'idle', refSpeed: 5.5, scale: 1, tint: [1, 1, 1], attacks: ['attack', 'attack2', 'attack3'], attackStart: 0.3, impact: { attack: 0.4, attack2: 0.4, attack3: 0.45 }, props: ['staff'] },
  libero: { model: 'libero', move: 'run', idle: 'idle', refSpeed: 5.6, scale: 1.02, tint: [1, 1, 1], attacks: ['attack'], attackStart: 0.42 },
  pirat: { model: 'pirat', move: 'run', idle: 'idle', refSpeed: 5.5, scale: 1.03, tint: [1, 1, 1], attacks: ['attack'], attackStart: 0.5, props: ['hook'] },
  // Lotte: kleines Mädchen (verkleinerte Figur) im gelben Regenmantel, Zöpfe, Teddy im Arm
  lotte: { model: 'schlaeferin', move: 'run', idle: 'idle', refSpeed: 4.6, scale: 0.72, tint: [1, 1, 1], plain: 0xf0c020, attacks: ['attack'], attackStart: 0.3, props: ['pigtails', 'teddy'] },
  // Taucher Kapitän Tiefe: schwerer Anzug (einfarbig), Messinghelm, Sauerstoffflasche, Harpune
  taucher: { model: 'rotschopf', move: 'run', idle: 'idle', refSpeed: 4.8, scale: 1.08, tint: [1, 1, 1], plain: 0x34423c, attacks: ['attack'], attackStart: 0.25, props: ['divehelm', 'airtank', 'harpoongun'] },
  // Goldschmied Aurelius: umgebaute Figur mit runder Brille, Lederschürze und Lupe am Gürtel
  goldschmied: { model: 'pirat', move: 'run', idle: 'idle', refSpeed: 5.3, scale: 1.0, tint: [0.85, 0.8, 0.72], attacks: ['attack'], attackStart: 0.3, props: ['glasses', 'apron', 'loupe'] },
  // Imker: umgebaute Figur (heller Anzug), Imkerhut mit Schleier, Smoker in der Hand
  imker: { model: 'libero', move: 'run', idle: 'idle', refSpeed: 5.4, scale: 1.0, tint: [1, 1, 1], plain: 0xddd6c0, attacks: ['attack'], attackStart: 0.5, props: ['beehat', 'smoker'], headOffset: 0.02 },
  // Glöcknerin Hedwig: umgebaute Figur (violettes Gewand), Haube, Schultertuch, Handglocke
  gloecknerin: { model: 'schlaeferin', move: 'run', idle: 'idle', refSpeed: 5.1, scale: 0.96, tint: [1, 1, 1], plain: 0x4b3d6e, attacks: ['attack'], attackStart: 0.3, props: ['bonnet', 'shawl', 'handbell'] },
  // Förster Bruno: umgebaute Figur (grüne Jacke), Filzhut mit Feder, Axt
  foerster: { model: 'pirat', move: 'run', idle: 'idle', refSpeed: 5.0, scale: 1.1, tint: [1, 1, 1], plain: 0x4a5a2c, attacks: ['attack'], attackStart: 0.35, props: ['felthat', 'axe'] },
  gaertnerin: { model: 'gaertnerin', move: 'run', idle: 'idle', refSpeed: 5.3, scale: 0.98, tint: [1, 1, 1], attacks: ['attack'], attackStart: 0.4, impact: { attack: 0.78 } },
};

/** Höchstdauer einer Angriffs- bzw. Fähigkeitsanimation in der Darstellung (Sekunden). */
export const ATTACK_ANIM = 0.9;
const ABILITY_ANIM = 1.2;

const ICONS = {
  sleep: ['Zzz', '#9fc9ff'],
  stun: ['✦', '#ffd23f'],
  blind: ['≋', '#d0d0d0'],
  fear: ['!', '#c77dff'],
  rooted: ['⊗', '#d9a066'],
} as const;

/** Namensschild (breiter Text) über schweren Gegnern. */
function labelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d')!;
  g.font = 'bold 56px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, 256, 50);
  g.fillStyle = color;
  g.fillText(text, 256, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.45, 1);
  s.renderOrder = 10;
  return s;
}

/** Text-Sprite (z. B. „+8“ Gold), aus dem gleichen Cache wie die Symbole. */
export function textSprite(text: string, color: string): THREE.Sprite {
  const s = new THREE.Sprite(iconMaterial(text, color).clone());
  s.renderOrder = 11;
  return s;
}

/** Höhe der Zombiefigur (für Lebensbalken und Symbole). */
function zombieHeight(figure: string, radius: number): number {
  switch (figure) {
    case 'bat':
      return 1.7;
    case 'spider':
      return 0.6;
    case 'bigspider':
      return 1.2;
    case 'toad':
      return 1.4;
    case 'rat':
      return 0.45;
    case 'ratking':
      return 1.3;
    case 'brute':
      return 2.6;
    case 'butcher':
      return 3.3;
    case 'bauamt':
      return 4.4;
    case 'demon':
      return 2.4;
    case 'postman':
      return 1.85;
    case 'crawler':
      return 0.6;
    case 'hornet':
      return 1.5;
    default:
      return UNIT_HEIGHT * (0.7 + radius * 0.6);
  }
}

/** Darstellung einer Einheit: Figur, Blickrichtung, Lebensbalken, Ring, Zustandssymbol. */
export class UnitView {
  readonly group = new THREE.Group();
  /** Dreht sich mit der Blickrichtung. */
  readonly body = new THREE.Group();
  private readonly materials: (THREE.Material & { color: THREE.Color })[] = [];
  /** Animiertes Modell (Helden und menschliche Zombies). */
  private anim: {
    inst: ModelInstance;
    look: ModelLook;
    loop: THREE.AnimationAction | null;
    loopName: string;
    once: { action: THREE.AnimationAction; left: number; upper?: boolean } | null;
    attackIndex: number;
    /** Gestorben: nach der Sterbe-Animation liegen bleiben. */
    dead: boolean;
  } | null = null;
  private readonly baseColors: THREE.Color[] = [];
  private readonly barFill: THREE.Mesh;
  readonly bar = new THREE.Group();
  readonly ring: THREE.Mesh;
  private readonly icon = new THREE.Sprite();
  private shield: THREE.Mesh | null = null;
  /** Buff-Ringe (LoL-artig): je Art eine drehende Gruppe aus Bogen-Segmenten. */
  private buffRingViews = new Map<string, { g: THREE.Group; mats: THREE.MeshBasicMaterial[]; index: number; team: boolean }>();
  private flash = 0;
  readonly height: number;
  private hero = false;
  /** Gezeigtes Tempo (m/s), aus der Bewegung der Figur gemessen und geglättet. */
  private shownSpeed = 0;
  private pendingDt = 0;
  private lodTick = false;
  private lastShown: { x: number; z: number } | null = null;

  constructor(radius: number, color: string, barColor: number, height = UNIT_HEIGHT, figure?: string, model?: RiggedModel | null) {
    this.height = height;
    this.group.add(this.body);
    this.hero = !!figure?.startsWith('h:');
    const look = figure?.startsWith('z:') ? ZOMBIE_LOOKS[figure.slice(2)] : figure?.startsWith('h:') ? HERO_LOOKS[figure.slice(2)] : undefined;
    if (look && model) this.buildFromModel(model, look, color);
    else if (figure?.startsWith('h:')) this.buildPerson(radius, color, height, figure.slice(2) === 'grimm' ? undefined : heroFigure(figure.slice(2)));
    else if (figure === 'dog') this.buildDog(color);
    else if (figure?.startsWith('z:')) this.buildZombie(figure.slice(2), radius, color, height);
    else this.buildPerson(radius, color, height, figure);

    const w = Math.max(1, radius * 2.4);
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.13).translate(w / 2, 0, 0), new THREE.MeshBasicMaterial({ color: barColor }));
    this.barFill.position.set(-w / 2, 0, 0.01);
    this.bar.add(bg, this.barFill);
    this.barW = w;
    this.bar.position.y = height + 0.45;
    this.group.add(this.bar);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(radius + 0.12, radius + 0.25, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9 }),
    );
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.group.add(this.ring);

    this.icon.scale.set(0.9, 0.9, 1);
    this.icon.position.y = height + 1;
    this.icon.visible = false;
    this.icon.renderOrder = 10;
    this.group.add(this.icon);
  }

  private lambert(color: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color });
    this.materials.push(m);
    this.baseColors.push(m.color.clone());
    return m;
  }

  private mesh(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geometry, this.lambert(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    this.body.add(m);
    return m;
  }

  /** Mensch bzw. Zombie als Kapsel mit Kopf und Erkennungsmerkmal. */
  private buildPerson(radius: number, color: string, height: number, figure?: string): void {
    const c = new THREE.Color(color);
    this.mesh(new THREE.CapsuleGeometry(radius, Math.max(0.1, height - 2 * radius), 4, 12), c, 0, height / 2);
    // Blickrichtung
    this.mesh(new THREE.BoxGeometry(radius * 0.7, radius * 0.4, radius * 0.4), c.clone().multiplyScalar(0.6), radius * 0.9, height * 0.7);

    switch (figure) {
      case 'hammer': {
        this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), 0x5a3a20, radius * 0.6, height * 0.6, radius + 0.15).rotation.x = 0.5;
        this.mesh(new THREE.BoxGeometry(0.55, 0.35, 0.35), 0x9a9a9a, radius * 0.6, height * 0.6 + 0.6, radius + 0.45);
        break;
      }
      case 'staff': {
        this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), 0x6b4a2b, radius * 0.5, height * 0.55, radius + 0.15);
        const crystal = this.mesh(new THREE.OctahedronGeometry(0.18, 0), 0x9fe3ff, radius * 0.5, height * 0.55 + 1.05, radius + 0.15);
        (crystal.material as THREE.MeshLambertMaterial).emissive.set(0x3aa0ff);
        break;
      }
      case 'pirate': {
        this.mesh(new THREE.CylinderGeometry(radius * 1.25, radius * 1.25, 0.08, 3), 0x1f1a16, 0, height + 0.05);
        this.mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.7, 0.3, 10), 0x1f1a16, 0, height + 0.2);
        this.mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 10, Math.PI * 1.4), 0x8c8c8c, radius * 0.7, height * 0.5, radius + 0.1);
        break;
      }
      case 'gardener': {
        this.mesh(new THREE.CylinderGeometry(radius * 1.4, radius * 1.4, 0.05, 16), 0x8a7a55, 0, height + 0.02);
        this.mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.75, 0.3, 12), 0x8a7a55, 0, height + 0.17);
        this.mesh(new THREE.BoxGeometry(0.8, 0.05, 0.1), 0x9a9a9a, radius + 0.3, height * 0.55, 0.2);
        break;
      }
      case 'ball':
        // Der Ball selbst ist ein eigenes Objekt auf der Karte; hier nur ein Stirnband.
        this.mesh(new THREE.TorusGeometry(radius * 0.92, 0.05, 6, 16), 0x2c5fa8, 0, height - radius * 0.6).rotation.x = Math.PI / 2;
        break;
    }
  }

  /** Figur aus einem Mixamo-Modell mit Animationen (assets/models/). */
  private buildFromModel(model: RiggedModel, look: ModelLook, color: string): void {
    // Helden bekommen ein Randlicht in ihrer Farbe (bei Nacht gut sichtbar)
    const rim = this.hero ? { color, strength: 0.55 } : undefined;
    const inst = instantiate(model, look.scale, look.tint, look.paint ? color : undefined, rim);
    inst.root.position.y = look.lift ?? 0;
    this.body.add(inst.root);
    for (const m of inst.materials) {
      if (look.plain !== undefined) {
        (m as THREE.MeshStandardMaterial).map = null;
        m.color.set(look.plain);
        m.needsUpdate = true;
      }
      this.materials.push(m);
      this.baseColors.push(m.color.clone());
    }
    // Requisiten in Metern: Maßstab des Knochens herausrechnen (Mixamo und Quaternius unterscheiden sich)
    inst.root.updateMatrixWorld(true);
    for (const prop of look.props ?? []) {
      const head = prop === 'tricorn' || prop === 'sunhat' || prop === 'crown' || prop === 'cap' || prop === 'hardhat' || prop === 'beehat' || prop === 'glasses' || prop === 'pigtails' || prop === 'divehelm' || prop === 'bonnet' || prop === 'felthat' || prop === 'icecrown';
      // Am Körper: Schürze an der Brust, Lupe am Gürtel
      const body = prop === 'apron' || prop === 'airtank' || prop === 'shawl' ? 'mixamorigSpine1' : prop === 'loupe' ? 'mixamorigHips' : null;
      const bone = inst.root.getObjectByName(body ?? (head ? (look.headBone ?? 'mixamorigHead') : (look.handBone ?? 'mixamorigRightHand')));
      if (!bone) continue;
      const mesh = this.propMesh(prop);
      const k = bone.getWorldScale(new THREE.Vector3()).x;
      mesh.scale.setScalar(look.scale / k);
      mesh.position.y = (body ? 0 : ((head ? look.headOffset : look.handOffset) ?? 0)) * look.scale / k;
      bone.add(mesh);
    }
    this.anim = { inst, look, loop: null, loopName: '', once: null, attackIndex: 0, dead: false };
    this.setLoop(look.idle ?? look.move);
    if (this.anim.loop) this.anim.loop.time = Math.random() * this.anim.loop.getClip().duration; // nicht alle im Gleichschritt
  }

  /** Requisiten an Hand bzw. Kopf (Koordinaten in Metern am Knochen). */
  private propMesh(prop: Prop): THREE.Object3D {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, emissive = 0) => {
      const m = new THREE.Mesh(geo, this.lambert(color));
      if (emissive) (m.material as THREE.MeshLambertMaterial).emissive.set(emissive);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    switch (prop) {
      case 'cleaver':
        add(new THREE.BoxGeometry(0.06, 0.32, 0.18), 0xb0b0b0, 0, 0.18, 0.05);
        break;
      case 'hammer':
        add(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), 0x5a3a20, 0, 0.35, 0);
        add(new THREE.BoxGeometry(0.22, 0.4, 0.22), 0x9a9a9a, 0, 0.9, 0);
        break;
      case 'staff':
        add(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), 0x6b4a2b, 0, 0.3, 0);
        add(new THREE.OctahedronGeometry(0.09, 0), 0x9fe3ff, 0, 1.15, 0, 0x3aa0ff);
        break;
      case 'hook':
        add(new THREE.TorusGeometry(0.09, 0.02, 6, 10, Math.PI * 1.4), 0x8c8c8c, 0, 0.12, 0);
        break;
      case 'sling':
        add(new THREE.TorusGeometry(0.06, 0.012, 5, 8), 0x7a5632, 0, 0.1, 0);
        break;
      case 'tricorn':
        add(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 3), 0x1f1a16, 0, 0.17, 0.02);
        add(new THREE.CylinderGeometry(0.09, 0.11, 0.1, 10), 0x1f1a16, 0, 0.22, 0.02);
        break;
      case 'parcel':
        add(new THREE.BoxGeometry(0.3, 0.22, 0.3), 0xb08850, 0, 0.12, 0.1);
        add(new THREE.BoxGeometry(0.31, 0.04, 0.05), 0xe8d8a8, 0, 0.12, 0.1);
        break;
      case 'cap':
        add(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12), 0x1f3f7a, 0, 0.05, 0);
        add(new THREE.BoxGeometry(0.28, 0.03, 0.2), 0x1f3f7a, 0, 0, 0.26);
        break;
      case 'crown':
        // Der Kopfknochen der Ratte zeigt zur Schnauze: Krone hinter die Ohren, aufgerichtet
        add(new THREE.CylinderGeometry(0.16, 0.14, 0.12, 6, 1, true), 0xffc93c, 0, -0.02, 0.16, 0x6b4a00).rotation.x = Math.PI / 2;
        break;
      case 'beehat': {
        // Imkerhut mit breiter Krempe und Schleier (durchscheinendes Netz)
        add(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20), 0xe9e2c8, 0, 0.16, 0.02);
        add(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 14), 0xe9e2c8, 0, 0.23, 0.02);
        const veil = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.2, 0.34, 18, 1, true),
          new THREE.MeshLambertMaterial({ color: 0x2e2e2c, transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthWrite: false }),
        );
        veil.position.set(0, -0.02, 0.02);
        g.add(veil);
        break;
      }
      case 'divehelm': {
        // Messing-Taucherhelm mit Bullauge
        add(new THREE.SphereGeometry(0.24, 16, 12), 0xa07a2a, 0, 0.08, 0.02, 0x1a1000);
        const port = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.6 }));
        port.position.set(0, 0.09, 0.245);
        g.add(port);
        add(new THREE.TorusGeometry(0.105, 0.02, 6, 16), 0x8a6420, 0, 0.09, 0.245);
        add(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 14), 0x8a6420, 0, -0.16, 0.02);
        break;
      }
      case 'airtank':
        // Sauerstoffflasche auf dem Rücken
        add(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), 0x8a8f92, 0, 0.0, -0.2);
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), 0x5a5f62, 0, 0.29, -0.2);
        break;
      case 'harpoongun':
        // Harpune: Schaft mit Spitze
        add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), 0x6b4a2b, 0, 0.3, 0);
        add(new THREE.ConeGeometry(0.05, 0.16, 6), 0xc8c8c8, 0, 0.82, 0);
        break;
      case 'pigtails':
        // Zwei Zöpfe mit roten Schleifen
        for (const x of [-0.13, 0.13]) {
          add(new THREE.CylinderGeometry(0.035, 0.025, 0.26, 6), 0x7a4a22, x, 0.0, -0.06).rotation.z = x > 0 ? -0.35 : 0.35;
          add(new THREE.SphereGeometry(0.035, 6, 4), 0xd03a2a, x * 1.05, 0.11, -0.06);
        }
        break;
      case 'teddy':
        // Teddy im Arm
        add(new THREE.SphereGeometry(0.1, 10, 8), 0x9a6a3a, 0, 0.08, 0.06);
        add(new THREE.SphereGeometry(0.075, 10, 8), 0x9a6a3a, 0, 0.23, 0.06);
        for (const x of [-0.05, 0.05]) add(new THREE.SphereGeometry(0.028, 6, 4), 0x7a4a22, x, 0.3, 0.06);
        add(new THREE.SphereGeometry(0.03, 6, 4), 0xd8c0a0, 0, 0.21, 0.13);
        break;
      case 'glasses': {
        // Runde Brille vor den Augen
        const rim = new THREE.MeshLambertMaterial({ color: 0x8a6a2a });
        for (const x of [-0.05, 0.05]) {
          const lens = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 14), rim);
          lens.position.set(x, 0.07, 0.11);
          g.add(lens);
        }
        add(new THREE.BoxGeometry(0.03, 0.006, 0.006), 0x8a6a2a, 0, 0.07, 0.11);
        break;
      }
      case 'apron':
        // Lederschürze über Brust und Bauch
        add(new THREE.BoxGeometry(0.34, 0.62, 0.03), 0x6b4423, 0, -0.18, 0.13);
        add(new THREE.BoxGeometry(0.36, 0.02, 0.2), 0x4a2e16, 0, 0.1, 0.05);
        break;
      case 'loupe': {
        // Lupe am Gürtel (Messingring mit Glas)
        add(new THREE.TorusGeometry(0.05, 0.01, 6, 14), 0xc9a24a, 0.17, -0.02, 0.06);
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.045, 14), new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.45 }));
        glass.position.set(0.17, -0.02, 0.06);
        g.add(glass);
        break;
      }
      case 'bonnet':
        // Weiße Haube mit Band
        // Haube: Kappe oben und hinten am Kopf (Gesicht frei)
        add(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), 0xf1ece0, 0, 0.1, -0.035);
        add(new THREE.TorusGeometry(0.12, 0.012, 6, 18), 0x7d6bb0, 0, 0.14, -0.03).rotation.x = Math.PI / 2 + 0.35;
        break;
      case 'shawl':
        // Dunkles Schultertuch
        add(new THREE.CylinderGeometry(0.2, 0.27, 0.16, 14), 0x2c2440, 0, 0.18, 0.0);
        break;
      case 'handbell':
        // Messing-Handglocke mit Holzgriff
        add(new THREE.CylinderGeometry(0.02, 0.025, 0.14, 8), 0x6b4a2b, 0, 0.13, 0.04);
        add(new THREE.ConeGeometry(0.1, 0.14, 14, 1, true), 0xc9a24a, 0, 0.0, 0.04, 0x3a2a00);
        add(new THREE.SphereGeometry(0.025, 6, 4), 0x8a6a2a, 0, -0.07, 0.04);
        break;
      case 'felthat':
        // Grüner Filzhut mit Krempe und Feder
        add(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 18), 0x2f3b1b, 0, 0.14, 0.02);
        add(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 14), 0x2f3b1b, 0, 0.2, 0.02);
        add(new THREE.BoxGeometry(0.015, 0.12, 0.025), 0xc8b070, 0.1, 0.24, -0.02).rotation.z = -0.5;
        break;
      case 'axe':
        // Holzfälleraxt: langer Stiel, breites Blatt
        add(new THREE.CylinderGeometry(0.025, 0.03, 0.65, 6), 0x7a5532, 0, 0.22, 0);
        add(new THREE.BoxGeometry(0.05, 0.16, 0.2), 0xa0a4a8, 0, 0.48, 0.09);
        break;
      case 'smoker':
        // Smoker: Blechdose mit Tülle und Blasebalg
        add(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10), 0xa8a8a0, 0, 0.12, 0.05);
        add(new THREE.ConeGeometry(0.06, 0.1, 8), 0x8a8a84, 0, 0.28, 0.05);
        add(new THREE.BoxGeometry(0.03, 0.14, 0.12), 0x7a5632, 0.1, 0.1, 0.05);
        break;
      case 'hardhat':
        // Bauhelm (gelb, mit Krempe und Mittelgrat)
        add(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2c200, 0, 0.12, 0.02);
        add(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), 0xf2c200, 0, 0.12, 0.04);
        add(new THREE.BoxGeometry(0.03, 0.05, 0.3), 0xd9ad00, 0, 0.27, 0.02);
        break;
      case 'clipboard':
        add(new THREE.BoxGeometry(0.26, 0.34, 0.02), 0x8a6a40, 0, 0.16, 0.06);
        add(new THREE.BoxGeometry(0.22, 0.28, 0.005), 0xf4f1e6, 0, 0.15, 0.075);
        add(new THREE.BoxGeometry(0.1, 0.04, 0.03), 0xb0b0b0, 0, 0.31, 0.07);
        break;
      case 'stamp':
        // Riesiger Amtsstempel
        add(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), 0x5a3a20, 0, 0.2, 0);
        add(new THREE.BoxGeometry(0.3, 0.12, 0.2), 0x2a2a2a, 0, 0.4, 0);
        add(new THREE.BoxGeometry(0.32, 0.03, 0.22), 0xc0302a, 0, 0.47, 0);
        break;
      case 'scythe':
        // Sense: langer Stiel, gebogenes Blatt
        add(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6), 0x6b4a2b, 0, 0.4, 0);
        add(new THREE.TorusGeometry(0.32, 0.03, 4, 12, Math.PI * 0.6), 0xb8bcc0, 0.0, 1.05, 0.2).rotation.y = Math.PI / 2;
        break;
      case 'icecrown':
        // Krone aus Eiszapfen
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const m = add(new THREE.ConeGeometry(0.035, 0.18, 5), 0xbfeaff, Math.cos(a) * 0.11, 0.2, Math.sin(a) * 0.11, 0x2a6a9a);
          m.rotation.z = Math.cos(a) * -0.25;
          m.rotation.x = Math.sin(a) * 0.25;
        }
        break;
      case 'sunhat':
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), 0x8a7a55, 0, 0.17, 0.02);
        add(new THREE.CylinderGeometry(0.09, 0.11, 0.1, 12), 0x8a7a55, 0, 0.22, 0.02);
        break;
    }
    return g;
  }

  /** Dauerhafte Animation wechseln (weich überblenden). */
  private setLoop(name: string, timeScale = 1): void {
    const a = this.anim!;
    const next = a.inst.actions.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (a.loopName === name) return;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    if (a.loop && !a.once) next.crossFadeFrom(a.loop, 0.2, false);
    else if (a.loop) a.loop.stop();
    a.loop = next;
    a.loopName = name;
  }

  /** Einmal-Animation (Angriff, Fähigkeit, Schrei, Tod); duration in Sekunden. */
  playOnce(name: string, duration: number, start = 0): void {
    const a = this.anim;
    const action = a?.inst.actions.get(name);
    if (!a || !action || a.dead) return;
    a.once?.action.fadeOut(0.08);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    const clip = action.getClip().duration;
    action.time = clip * start;
    action.timeScale = (clip * (1 - start)) / Math.max(0.1, duration);
    action.fadeIn(0.08).play();
    // Oberkörper-Variante (im Laufen): Beine laufen weiter
    const upper = name.endsWith('Upper');
    if (!upper) a.loop?.fadeOut(0.08);
    a.once = { action, left: duration, upper };
  }

  /** Hat die Figur eine Animation dieses Namens? */
  hasClip(name: string): boolean {
    return !!this.anim?.inst.actions.has(name);
  }

  /** Standardangriff: nächster Clip der Reihe (bei Zombies zufällig). */
  playAttack(duration = ATTACK_ANIM, random = false): void {
    const a = this.anim;
    // Ein neuer Treffer unterbricht den alten Angriff (sonst liefe die Animation hinterher)
    if (!a) return;
    const list = a.look.attacks;
    const name = random ? list[Math.floor(Math.random() * list.length)] : list[a.attackIndex++ % list.length];
    // Im Laufen nur den Oberkörper animieren, die Beine laufen weiter
    const moving = this.shownSpeed > 0.8 && this.hasClip(`${name}Upper`);
    this.playImpact(moving ? `${name}Upper` : name, name, duration);
  }

  /**
   * Angriff so abspielen, dass der Treffermoment des Clips (impact) genau
   * jetzt zu sehen ist: Der Clip beginnt kurz davor (sichtbares Ausholen) und
   * läuft höchstens so lange wie der Angriffstakt. Zu lange Clips werden
   * höchstens 2,5-fach beschleunigt und sonst am Ende gekürzt.
   */
  private playImpact(actionName: string, clipName: string, cooldown: number): void {
    const a = this.anim!;
    const action = a.inst.actions.get(actionName);
    if (!action || a.dead) return;
    const clip = action.getClip().duration;
    const auto = a.inst.impacts[clipName];
    const impact = Math.min(0.85, Math.max(0.15, a.look.impact?.[clipName] ?? auto ?? a.look.attackStart ?? 0.4));
    const duration = Math.max(0.25, Math.min(1.2, cooldown));
    const LEAD = 0.1; // so viele Sekunden Ausholen vor dem Treffer
    // Tempo: Rest des Clips ab Treffer soll in die verbleibende Zeit passen
    const after = clip * (1 - impact);
    const speed = Math.min(2.5, Math.max(0.7, after / Math.max(0.1, duration - LEAD)));
    const start = Math.max(0, clip * impact - LEAD * speed);
    a.once?.action.fadeOut(0.06);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.time = start;
    action.timeScale = speed;
    action.fadeIn(0.05).play();
    const upper = actionName.endsWith('Upper');
    if (!upper) a.loop?.fadeOut(0.06);
    a.once = { action, left: duration, upper };
  }

  /** Fähigkeit (slot 0–3); lange Clips werden auf höchstens 1,2 s gerafft. */
  playAbility(slot: number): void {
    const a = this.anim;
    if (!a) return;
    let name = `ability${slot + 1}`;
    if (this.hasClip(`${name}b`) && Math.random() < 0.5) name += 'b';
    const clip = a.inst.actions.get(name)?.getClip();
    if (clip) this.playOnce(name, Math.min(ABILITY_ANIM, Math.max(0.6, clip.duration)));
  }

  /** Sterben: Sterbe-Animation, danach liegen bleiben. */
  die(): void {
    const a = this.anim;
    if (!a || a.dead) return;
    const name = this.hasClip('death2') && Math.random() < 0.5 ? 'death2' : 'death';
    this.playOnce(name, 1.6);
    a.dead = true;
    this.bar.visible = false;
    this.icon.visible = false;
    this.ring.visible = false;
  }

  /**
   * Animation fortschreiben: Laufen nach Tempo, sonst Stehen. hold hält eine
   * Animation dauerhaft (z. B. „down“ für gefallene Helden, Powernap).
   */
  /**
   * Sparmodus für viele Zombies: lod 0 = jedes Bild, 1 = jedes zweite Bild,
   * 2 = gar nicht (außerhalb des Bildes). Die Zeit wird gesammelt und beim
   * nächsten Mal nachgeholt, damit nichts springt.
   */
  animateLod(dt: number, speed: number, frozen: boolean, lod: 0 | 1 | 2): void {
    this.pendingDt += dt;
    if (lod === 2 || (lod === 1 && (this.lodTick = !this.lodTick))) return;
    const t = Math.min(0.25, this.pendingDt);
    this.pendingDt = 0;
    this.animate(t, speed, frozen);
  }

  animate(dt: number, speed: number, frozen: boolean, hold?: string): void {
    const a = this.anim;
    if (!a) return;
    if (a.once) {
      a.once.left -= dt;
      if (a.once.left <= 0 && !a.dead) {
        a.once.action.fadeOut(0.15);
        const upper = a.once.upper;
        a.once = null;
        if (!upper) a.loop?.reset().fadeIn(0.15).play();
      }
    }
    if (!a.dead) {
      const look = a.look;
      if (hold && this.hasClip(hold)) this.setLoop(hold);
      else if (speed < 0.15 && look.idle) this.setLoop(look.idle);
      else {
        const fast = look.moveFast && speed > (look.fastAbove ?? Infinity);
        const scale = frozen ? 0 : speed < 0.05 ? 0.25 : Math.min(2.2, Math.max(0.35, speed / look.refSpeed));
        this.setLoop(fast ? look.moveFast! : look.move, scale);
      }
    }
    a.inst.mixer.update(frozen && !a.dead ? 0 : dt);
  }

  /** Nach dem Respawn: Sterbe-Animation beenden, wieder normal animieren. */
  revive(): void {
    const a = this.anim;
    if (!a?.dead) return;
    a.dead = false;
    a.once?.action.stop();
    a.once = null;
    a.loop?.reset().play();
    this.bar.visible = true;
  }

  /** Figur aus einem animierten Modell? */
  get isAnimated(): boolean {
    return !!this.anim;
  }

  get isDying(): boolean {
    return !!this.anim?.dead;
  }

  /** Zombies und Ratten nach den Referenzbildern in assets/reference/gegner/. */
  private buildZombie(figure: string, radius: number, color: string, height: number): void {
    const skin = 0x9aa58f;
    const eyeGlow = (x: number, y: number, z: number, c = 0xff2a2a) => {
      const eye = this.mesh(new THREE.SphereGeometry(0.045, 6, 4), c, x, y, z);
      (eye.material as THREE.MeshLambertMaterial).emissive.set(c);
    };
    switch (figure) {
      case 'rat':
      case 'ratking': {
        const s = figure === 'ratking' ? 2.6 : 1;
        const body = this.mesh(new THREE.CapsuleGeometry(0.16 * s, 0.3 * s, 4, 8), color, 0, 0.2 * s);
        body.rotation.z = Math.PI / 2;
        const head = this.mesh(new THREE.ConeGeometry(0.12 * s, 0.3 * s, 8), color, 0.36 * s, 0.24 * s);
        head.rotation.z = -Math.PI / 2;
        for (const side of [-1, 1]) {
          this.mesh(new THREE.SphereGeometry(0.06 * s, 6, 4), 0xd9a0a0, 0.28 * s, 0.38 * s, side * 0.08 * s);
          eyeGlow(0.38 * s, 0.29 * s, side * 0.05 * s);
        }
        const tail = this.mesh(new THREE.CylinderGeometry(0.015 * s, 0.03 * s, 0.5 * s, 5), 0xc9a0a0, -0.42 * s, 0.15 * s);
        tail.rotation.z = Math.PI / 2.4;
        if (figure === 'ratking') {
          this.mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.15, 8, 1, true), 0xffc93c, 0.45, 0.95);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            this.mesh(new THREE.ConeGeometry(0.04, 0.12, 4), 0xffc93c, 0.45 + Math.cos(a) * 0.18, 1.08, Math.sin(a) * 0.18);
          }
        }
        return;
      }
      case 'bat': {
        // Zombie-Fledermaus: dunkler Körper, rote Augen, ledrige Flügel, schwebt (1,6-fach vergrößert)
        const hover = 0.82;
        this.body.scale.setScalar(1.6);
        this.mesh(new THREE.SphereGeometry(0.14, 8, 6), 0x3a2f3f, 0, hover).scale.set(1.3, 1, 1);
        this.mesh(new THREE.SphereGeometry(0.09, 8, 6), 0x4a3a4f, 0.17, hover + 0.05);
        for (const side of [-1, 1]) {
          this.mesh(new THREE.ConeGeometry(0.035, 0.1, 4), 0x3a2f3f, 0.16, hover + 0.15, side * 0.05);
          eyeGlow(0.25, hover + 0.07, side * 0.04);
          // Flügel als Dreieck; die Gruppe dreht sich (name 'wing') und schlägt so auf und ab
          const shape = new THREE.Shape();
          shape.moveTo(0, -0.08);
          shape.lineTo(0.45, -0.02);
          shape.lineTo(0.38, 0.1);
          shape.lineTo(0, 0.08);
          const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.lambert(0x2a2230));
          (wing.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
          wing.rotation.x = -Math.PI / 2;
          const pivot = new THREE.Group();
          pivot.name = 'wing';
          pivot.position.set(0, hover + 0.03, side * 0.1);
          pivot.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          pivot.add(wing);
          this.body.add(pivot);
        }
        return;
      }
      case 'hornet': {
        // Hornisse: gelb-schwarz gestreift, durchsichtige Flügel, schwebt
        const hover = 1.25;
        for (let i = 0; i < 3; i++) {
          const seg = this.mesh(new THREE.SphereGeometry(0.11, 8, 6), i % 2 ? 0x1b1b1b : 0xe0a81c, -0.1 - i * 0.13, hover - i * 0.03);
          seg.scale.set(1.2, 1, 1);
        }
        this.mesh(new THREE.SphereGeometry(0.1, 8, 6), 0x2b2b2b, 0.12, hover + 0.02);
        this.mesh(new THREE.ConeGeometry(0.03, 0.12, 4), 0x1b1b1b, -0.48, hover - 0.08).rotation.z = Math.PI / 2;
        const wingMat = new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), wingMat);
          wing.position.set(-0.05, hover + 0.12, side * 0.14);
          wing.rotation.x = -Math.PI / 2 + side * 0.4;
          wing.name = 'wing';
          this.body.add(wing);
        }
        eyeGlow(0.2, hover + 0.05, 0.05, 0x1b1b1b);
        eyeGlow(0.2, hover + 0.05, -0.05, 0x1b1b1b);
        return;
      }
      case 'crawler': {
        // Kriecher: flach am Boden, Arme nach vorn
        const torso = this.mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), color, -0.1, 0.25);
        torso.rotation.z = Math.PI / 2;
        this.mesh(new THREE.SphereGeometry(0.18, 10, 8), skin, 0.45, 0.38);
        for (const side of [-1, 1]) {
          const arm = this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), skin, 0.45, 0.12, side * 0.28);
          arm.rotation.z = Math.PI / 2;
          eyeGlow(0.6, 0.42, side * 0.06, 0xf0f0d0);
        }
        return;
      }
    }
    // Aufrechte Zombies: Walker (Bart, lange Haare), Runner (hager, einarmig), Brute, Schlächter
    const thin = figure === 'runner' ? 0.8 : 1;
    const bodyH = height - 0.35;
    this.mesh(new THREE.CapsuleGeometry(radius * thin, Math.max(0.1, bodyH - 2 * radius * thin), 4, 10), color, 0, bodyH / 2);
    const headY = bodyH + 0.12;
    this.mesh(new THREE.SphereGeometry(0.2, 10, 8), skin, 0.05, headY);
    const arms = figure === 'runner' ? [1] : [-1, 1];
    for (const side of arms) {
      const arm = this.mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.75, 6), skin, 0.35, bodyH * 0.72, side * (radius * thin + 0.05));
      arm.rotation.z = Math.PI / 2.3; // nach vorn gestreckt
    }
    if (figure === 'runner') this.mesh(new THREE.SphereGeometry(0.08, 6, 4), 0x8b1a1a, 0, bodyH * 0.75, -(radius * thin + 0.02));
    if (figure === 'walker') {
      this.mesh(new THREE.ConeGeometry(0.1, 0.22, 6), 0x6b5a3a, 0.17, headY - 0.17).rotation.z = Math.PI;
      this.mesh(new THREE.BoxGeometry(0.12, 0.35, 0.36), 0x7a6a45, -0.12, headY - 0.05);
    }
    if (figure === 'butcher') {
      this.mesh(new THREE.BoxGeometry(0.1, bodyH * 0.6, radius * 1.6), 0xd8d0c0, radius * 0.85, bodyH * 0.45); // Schürze
      this.mesh(new THREE.BoxGeometry(0.5, 0.3, 0.06), 0xb0b0b0, 0.7, bodyH * 0.75, radius + 0.15); // Beil
    }
    if (figure === 'butcher' || figure === 'brute') for (const side of [-1, 1]) eyeGlow(0.22, headY + 0.03, side * 0.07);
    else for (const side of [-1, 1]) eyeGlow(0.22, headY + 0.03, side * 0.07, 0xf0f0d0);
  }

  /** Grimm: kleiner, flauschiger weißer Hund mit hellbraunen Ohren und buschiger Rute. */
  private buildDog(color: string): void {
    const fur = new THREE.Color(color);
    const body = this.mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 10), fur, 0, 0.45);
    body.rotation.z = Math.PI / 2;
    this.mesh(new THREE.SphereGeometry(0.26, 12, 10), fur, 0.5, 0.7);
    this.mesh(new THREE.SphereGeometry(0.07, 8, 6), 0xf2a0a8, 0.76, 0.66);
    for (const side of [-1, 1]) {
      this.mesh(new THREE.ConeGeometry(0.09, 0.2, 6), 0xc9935a, 0.45, 0.98, side * 0.14);
      this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), fur, 0.25, 0.15, side * 0.15);
      this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), fur, -0.25, 0.15, side * 0.15);
    }
    const tail = this.mesh(new THREE.SphereGeometry(0.2, 10, 8), fur, -0.42, 0.85);
    tail.scale.set(0.8, 1.3, 0.8);
  }

  /**
   * Position (interpoliert), Blickrichtung, Lebensbalken, Treffer-Aufblitzen.
   * lift: Höhe über dem Boden (Sprünge).
   */
  update(unit: Unit, prev: Snapshot | undefined, alpha: number, camera: THREE.Camera, dt: number, lift = 0): void {
    const x = prev ? prev.x + (unit.pos.x - prev.x) * alpha : unit.pos.x;
    const y = prev ? prev.y + (unit.pos.y - prev.y) * alpha : unit.pos.y;
    this.group.position.set(x, lift, y);
    this.body.rotation.y = -unit.facing;
    this.bar.quaternion.copy(camera.quaternion);
    this.barFill.scale.x = Math.max(0.001, unit.hp / unit.maxHp);
    if (this.bar.visible && unit.maxHp !== this.ticksFor) this.buildTicks(unit.maxHp);
    if (unit.hp < unit.maxHp) this.bar.visible = true;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.materials.forEach((m, i) => m.color.copy(this.baseColors[i]).lerp(WHITE, this.flash));
    // Flügelschlag und Schweben (Hornissen)
    const t = performance.now() / 1000;
    for (const c of this.body.children) if (c.name === 'wing') c.rotation.z = Math.sin(t * 60 + unit.id) * 0.5;
    if (this.body.children.some((c) => c.name === 'wing')) this.body.position.y = Math.sin(t * 6 + unit.id) * 0.08;
  }

  /** Zustand eines Zombies anzeigen (Symbol, Färbung, Ring für markiert/Wittern). */
  showStatus(z: Zombie, time: number, reveal: boolean): void {
    const st = z.st;
    let icon: keyof typeof ICONS | null = null;
    if (time < st.sleepUntil) icon = 'sleep';
    else if (time < st.stunUntil) icon = 'stun';
    else if (time < st.fearUntil) icon = 'fear';
    else if (time < st.blindUntil) icon = 'blind';
    this.icon.visible = icon !== null;
    if (icon) this.icon.material = iconMaterial(ICONS[icon][0], ICONS[icon][1]);
    // Markiert (Fährte) oder für Grimm gewittert: Ring, durch Wände sichtbar
    const marked = time < st.markedUntil;
    this.ring.visible = marked || reveal;
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    ringMat.color.set(marked ? 0xff3b30 : 0xff9f43);
    ringMat.depthTest = !(marked || reveal);
    this.ring.renderOrder = marked || reveal ? 5 : 0;
    // Schlafende leicht bläulich, Festgehaltene rötlich
    const tint = time < (st.enrageUntil ?? 0) ? 0xd01010 : time < (st.goldUntil ?? 0) ? 0xffc83d : time < (st.burnUntil ?? 0) ? 0xff6a20 : time < st.sleepUntil ? 0x9fc9ff : time < st.rootUntil ? 0xff8a80 : time < (st.weakUntil ?? 0) ? 0x8a90b0 : null;
    if (tint !== null) this.materials.forEach((m) => m.color.lerp(new THREE.Color(tint), 0.35));
  }

  /**
   * Schwerer Gegner: leuchtender Boden-Ring in seiner Farbe, glühende Augen
   * und ein Namensschild über dem (größeren) Lebensbalken.
   */
  markElite(color: number, name: string): void {
    this.ring.visible = true;
    const mat = this.ring.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    // weicher Lichtschein auf dem Boden
    const r = (this.ring.geometry as THREE.RingGeometry).parameters.outerRadius;
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.6, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.position.y = 0.02;
    this.group.add(glow);
    const label = labelSprite(name, `#${color.toString(16).padStart(6, '0')}`);
    label.position.y = this.bar.position.y + 0.42;
    this.group.add(label);
    this.addEyes(color);
  }

  /** Glühende Augen am Kopfknochen der Mixamo-Figuren. */
  addEyes(color: number): void {
    const head = this.anim?.inst.root.getObjectByName('mixamorigHead');
    if (!head) return;
    this.anim!.inst.root.updateMatrixWorld(true);
    const k = head.getWorldScale(new THREE.Vector3()).x;
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022 / k, 6, 4), mat);
      eye.position.set((side * 0.034) / k, 0.085 / k, 0.085 / k);
      head.add(eye);
    }
  }

  /** Postbote (Sidequest): goldener Ring, auch durch Wände sichtbar. */
  markCourier(): void {
    this.ring.visible = true;
    const mat = this.ring.material as THREE.MeshBasicMaterial;
    mat.color.set(0xffd166);
    mat.depthTest = false;
    this.ring.renderOrder = 5;
  }

  /** Held: Schildblase, festgehalten oder betäubt; opacity < 1 bei Unsichtbarkeit (Nebelschritt) bzw. im Versteck. */
  /**
   * Buff-Ringe anzeigen: je aktiver Wirkungsart ein farbiger Ring aus drei
   * Bögen, der sich dreht (Richtung je Ring wechselnd), in den letzten 5 s
   * blinkt; Team-Buffs von Bossen sind breiter und haben leuchtende Punkte,
   * Seuche ist gestrichelt und dreht langsamer.
   */
  showBuffs(rings: BuffRing[], time: number, radius: number): void {
    const keep = new Set(rings.map((r) => r.key));
    for (const [key, v] of this.buffRingViews) {
      if (keep.has(key as BuffRing['key'])) continue;
      this.group.remove(v.g);
      v.g.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      v.mats.forEach((m) => m.dispose());
      this.buffRingViews.delete(key);
    }
    rings.forEach((r, index) => {
      let v = this.buffRingViews.get(r.key);
      if (!v || v.index !== index || v.team !== r.team) {
        if (v) {
          this.group.remove(v.g);
          v.mats.forEach((m) => m.dispose());
        }
        const g = new THREE.Group();
        const inner = Math.max(0.62, radius * 1.45) + index * 0.17;
        const width = r.team ? 0.11 : 0.06;
        const segments = r.debuff ? 6 : 3;
        const gap = r.debuff ? 0.5 : 0.35;
        const mats: THREE.MeshBasicMaterial[] = [];
        for (let i = 0; i < segments; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
          mats.push(mat);
          const len = ((Math.PI * 2) / segments) * (1 - gap);
          const m = new THREE.Mesh(new THREE.RingGeometry(inner, inner + width, 24, 1, (i * Math.PI * 2) / segments, len), mat);
          m.rotation.x = -Math.PI / 2;
          g.add(m);
        }
        if (r.team) {
          // Funkelnde Punkte auf dem Ring (Boss-Buff)
          for (let i = 0; i < 3; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
            mats.push(mat);
            const a = (i / 3) * Math.PI * 2 + 0.6;
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat);
            dot.position.set(Math.cos(a) * (inner + width / 2), 0.02, Math.sin(a) * (inner + width / 2));
            g.add(dot);
          }
        }
        g.position.y = 0.07 + index * 0.025;
        g.renderOrder = 3;
        this.group.add(g);
        v = { g, mats, index, team: r.team };
        this.buffRingViews.set(r.key, v);
      }
      const dir = index % 2 === 0 ? 1 : -1;
      v.g.rotation.y = time * (r.debuff ? 0.6 : 1.6) * dir;
      const blink = r.left < 5 ? 0.35 + 0.5 * Math.abs(Math.sin(time * 7)) : 0.85;
      for (const m of v.mats) m.opacity = blink;
    });
  }

  private barW = 1;
  private ticksFor = 0;
  private ticks: THREE.Mesh | null = null;
  /** Striche je 100 Leben (dicker je 1000) auf dem Lebensbalken. */
  private buildTicks(maxHp: number): void {
    this.ticksFor = maxHp;
    if (this.ticks) {
      this.bar.remove(this.ticks);
      (this.ticks.material as THREE.MeshBasicMaterial).map?.dispose();
      this.ticks.geometry.dispose();
      this.ticks = null;
    }
    const marks = tickMarks(maxHp);
    if (!marks.length) return;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 8;
    const g = c.getContext('2d')!;
    for (const m of marks) {
      g.fillStyle = m.major ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.6)';
      const x = Math.round(m.at * 256);
      g.fillRect(x - (m.major ? 1 : 0), m.major ? 0 : 2, m.major ? 2 : 1, m.major ? 8 : 6);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    this.ticks = new THREE.Mesh(new THREE.PlaneGeometry(this.barW, 0.13), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.ticks.position.z = 0.02;
    this.bar.add(this.ticks);
  }

  private reviveRing: THREE.Mesh | null = null;
  private reviveKey = -1;
  /** Gefallen: Fortschrittsring fürs Wiederbeleben (null = keiner). */
  showRevive(progress: number | null): void {
    if (progress === null) {
      if (this.reviveRing) this.reviveRing.visible = false;
      return;
    }
    const key = Math.round(progress * 40);
    if (!this.reviveRing || key !== this.reviveKey) {
      if (this.reviveRing) {
        this.group.remove(this.reviveRing);
        this.reviveRing.geometry.dispose();
      }
      const len = Math.max(0.05, progress) * Math.PI * 2;
      this.reviveRing = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.05, 40, 1, Math.PI / 2, len),
        new THREE.MeshBasicMaterial({ color: progress > 0 ? 0x7bd36a : 0xffffff, transparent: true, opacity: progress > 0 ? 0.9 : 0.35, depthWrite: false, side: THREE.DoubleSide }),
      );
      this.reviveRing.rotation.x = -Math.PI / 2;
      this.reviveRing.position.y = 0.08;
      this.group.add(this.reviveRing);
      this.reviveKey = key;
    }
    this.reviveRing.visible = true;
  }

  private bees: THREE.Group | null = null;
  /** Imker: ein paar Bienen schwirren ständig um ihn herum. */
  orbitBees(time: number): void {
    if (!this.bees) {
      const g = new THREE.Group();
      const bee = new THREE.MeshBasicMaterial({ color: 0xffc83d });
      const dark = new THREE.MeshBasicMaterial({ color: 0x2a2010 });
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), i % 3 === 0 ? dark : bee);
        m.userData.phase = i * 1.05;
        m.userData.r = 0.55 + (i % 3) * 0.18;
        g.add(m);
      }
      this.group.add(g);
      this.bees = g;
    }
    for (const m of this.bees.children) {
      const p = time * 3.2 + (m.userData.phase as number);
      const r = m.userData.r as number;
      m.position.set(Math.cos(p) * r, 1.1 + Math.sin(p * 2.3) * 0.35, Math.sin(p) * r);
    }
  }

  showHero(h: Hero, shield: number, opacity: number): void {
    const stunned = h.buffs.some((b) => b.kind === 'stunned');
    const rooted = h.buffs.some((b) => b.kind === 'rooted');
    this.icon.visible = stunned || rooted;
    if (stunned) this.icon.material = iconMaterial(ICONS.stun[0], ICONS.stun[1]);
    else if (rooted) this.icon.material = iconMaterial(ICONS.rooted[0], ICONS.rooted[1]);
    if (shield > 0 && !this.shield) {
      this.shield = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.9, h.radius * 2), 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      this.shield.position.y = this.height / 2;
      this.group.add(this.shield);
    }
    if (this.shield) this.shield.visible = shield > 0;
    for (const m of this.materials) {
      m.transparent = opacity < 1;
      m.opacity = opacity;
    }
  }

  hit(): void {
    this.flash = 1;
  }

  /**
   * Tempo aus der tatsächlich gezeigten Bewegung (inklusive Vorhersage und
   * Überblenden), geglättet, damit die Laufanimation nicht flackert.
   */
  measureSpeed(dt: number): number {
    const p = this.group.position;
    if (this.lastShown && dt > 0) {
      const v = Math.hypot(p.x - this.lastShown.x, p.z - this.lastShown.z) / dt;
      // Sprünge (Teleport, Respawn) nicht als Tempo werten
      const k = 1 - Math.exp(-dt / 0.12);
      if (v < 30) this.shownSpeed += (v - this.shownSpeed) * k;
    }
    this.lastShown = { x: p.x, z: p.z };
    return this.shownSpeed;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

/** Modell einer Einheit; bei Varianten entscheidet die Id (stabil über die ganze Partie). */
function modelName(look: ModelLook, id: number): string {
  return Array.isArray(look.model) ? look.model[id % look.model.length] : look.model;
}

/** Erkennungsmerkmal der einfachen Heldenfigur (ohne Modell). */
function heroFigure(heroId: string): string | undefined {
  return { rotschopf: 'hammer', schlaeferin: 'staff', libero: 'ball', pirat: 'pirate', gaertnerin: 'gardener' }[heroId];
}

/** Held mit Ring: grün für den eigenen Helden, blau für Bots. Mit Modell, sobald eins geladen ist. */
export function heroView(h: Hero, def: HeroDef, isPlayer: boolean, models: Map<string, RiggedModel>, enemy = false, roleIcon?: { icon: string; color: string }): UnitView {
  const look = HERO_LOOKS[def.id];
  const model = look ? models.get(modelName(look, h.id)) : undefined;
  const animated = !!model;
  const figure = animated ? `h:${def.id}` : def.figure;
  const height = def.figure === 'dog' ? 1.1 : animated ? 1.8 * look.scale : UNIT_HEIGHT;
  // PvP-Gegner: roter Balken und Ring
  const color = isPlayer ? 0x4cd964 : enemy ? 0xff4a3d : 0x5aa9ff;
  const view = new UnitView(h.radius, def.color, color, height, figure, animated ? model : null);
  view.bar.visible = true;
  (view.ring.material as THREE.MeshBasicMaterial).color.set(color);
  view.ring.visible = true;
  // Rollen-Symbol über dem Lebensbalken (nicht beim eigenen Helden)
  if (roleIcon && !isPlayer) {
    const tag = textSprite(roleIcon.icon, roleIcon.color);
    tag.scale.set(0.55, 0.55, 1);
    tag.position.y = height + 0.95;
    view.group.add(tag);
  }
  // Schwacher Lichtkreis (Laterne), damit Helden bei Nacht gut zu sehen sind
  view.group.add(groundGlow(0xffc070, isPlayer ? 7 : 5, isPlayer ? 0.32 : 0.22));
  return view;
}

/** Lottes Troll als Figur: grüner Ring und Lebensbalken (Verbündeter), Größe je Art. */
export function minionView(m: Minion, models: Map<string, RiggedModel>): UnitView {
  const figure = m.kind === 'bridge' ? 'bridgetroll' : m.kind === 'giant' ? 'gianttroll' : 'troll';
  const look = ZOMBIE_LOOKS[figure];
  const model = models.get(modelName(look, m.id));
  const view = new UnitView(m.radius, '#5f8d3a', 0x9be38a, model ? 1.75 * look.scale : 1.6 * look.scale, `z:${figure}`, model);
  view.bar.visible = true;
  (view.ring.material as THREE.MeshBasicMaterial).color.set(0x9be38a);
  view.ring.visible = true;
  return view;
}

export function zombieView(z: Zombie, def: ZombieDef, models: Map<string, RiggedModel>): UnitView {
  const elite = def.rank === 'elite' || def.rank === 'boss';
  const look = ZOMBIE_LOOKS[def.figure];
  const model = look ? models.get(modelName(look, z.id)) : undefined;
  const height = model && modelName(look, z.id).startsWith('zombie') && def.figure !== 'crawler' ? 1.75 * look.scale : zombieHeight(def.figure, z.radius);
  const view = new UnitView(z.radius, def.color, elite ? 0xff9f1c : 0xff453a, height, `z:${def.figure}`, model);
  view.bar.visible = elite;
  if (elite) view.bar.scale.set(1.6, 1.4, 1);
  // Schatten werfen nur große Gegner (spart viel Rechenzeit bei vielen Zombies)
  if (!elite && def.figure !== 'brute') view.group.traverse((o) => (o.castShadow = false));
  const glow = ELITE_COLORS[def.figure];
  if (elite && glow !== undefined && !z.neutral) view.markElite(glow, def.name);
  else if (glow !== undefined) view.addEyes(glow);
  else if (model && def.figure !== 'crawler') view.addEyes(0xff3b1f);
  return view;
}

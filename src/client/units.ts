import * as THREE from 'three';
import type { Hero, HeroDef, Unit, Zombie, ZombieDef } from '../sim/types';
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

type Prop = 'cleaver' | 'hammer' | 'staff' | 'hook' | 'sling' | 'tricorn' | 'sunhat' | 'crown' | 'parcel' | 'cap';

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
  props?: Prop[];
  /** Kopfknochen für Hüte und Krone (Mixamo: mixamorigHead). */
  headBone?: string;
  /** Knochen für Requisiten in der Hand (Mixamo: mixamorigRightHand) und Abstand entlang des Knochens in Metern. */
  handBone?: string;
  handOffset?: number;
  /** Hut höher bzw. tiefer setzen (große Comic-Köpfe), in Metern. */
  headOffset?: number;
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
  hornet: { model: 'wasp', move: 'fly', idle: 'fly', refSpeed: 4.5, scale: 1.6, tint: [1, 1, 1], attacks: ['attack'], lift: 0.9 },
};

/** Leuchtfarbe der schweren Gegner (Boden-Ring, Augen, Namensschild). */
export const ELITE_COLORS: Record<string, number> = {
  butcher: 0xff2a1a,
  demon: 0xb04dff,
  ratking: 0xffc93c,
  postman: 0xffd166,
  brute: 0xff8a1c,
  bigspider: 0x9be564,
  toad: 0x7fd6a0,
};

/** Helden mit Modell (assets/models/<held>): Grimm ist ein Schäferhund (Quaternius), die übrigen Mixamo-Figuren mit eigenen Texturen. */
const HERO_LOOKS: Record<string, ModelLook> = {
  grimm: { model: 'grimm', move: 'run', idle: 'idle', refSpeed: 6.5, scale: 1, tint: [1.25, 1.2, 1.15], attacks: ['attack'] },
  rotschopf: { model: 'rotschopf', move: 'run', idle: 'idle', refSpeed: 5.5, scale: 1.08, tint: [1, 1, 1], attacks: ['attack'], props: ['hammer'] },
  schlaeferin: { model: 'schlaeferin', move: 'run', idle: 'idle', refSpeed: 5.5, scale: 1, tint: [1, 1, 1], attacks: ['attack', 'attack2', 'attack3'], props: ['staff'] },
  libero: { model: 'libero', move: 'run', idle: 'idle', refSpeed: 5.6, scale: 1.02, tint: [1, 1, 1], attacks: ['attack'] },
  pirat: { model: 'pirat', move: 'run', idle: 'idle', refSpeed: 5.5, scale: 1.03, tint: [1, 1, 1], attacks: ['attack'], props: ['hook'] },
  gaertnerin: { model: 'gaertnerin', move: 'run', idle: 'idle', refSpeed: 5.3, scale: 0.98, tint: [1, 1, 1], attacks: ['attack'] },
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
    once: { action: THREE.AnimationAction; left: number } | null;
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
  private flash = 0;
  readonly height: number;
  private hero = false;

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
      this.materials.push(m);
      this.baseColors.push(m.color.clone());
    }
    // Requisiten in Metern: Maßstab des Knochens herausrechnen (Mixamo und Quaternius unterscheiden sich)
    inst.root.updateMatrixWorld(true);
    for (const prop of look.props ?? []) {
      const head = prop === 'tricorn' || prop === 'sunhat' || prop === 'crown' || prop === 'cap';
      const bone = inst.root.getObjectByName(head ? (look.headBone ?? 'mixamorigHead') : (look.handBone ?? 'mixamorigRightHand'));
      if (!bone) continue;
      const mesh = this.propMesh(prop);
      const k = bone.getWorldScale(new THREE.Vector3()).x;
      mesh.scale.setScalar(look.scale / k);
      mesh.position.y = ((head ? look.headOffset : look.handOffset) ?? 0) * look.scale / k;
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
  playOnce(name: string, duration: number): void {
    const a = this.anim;
    const action = a?.inst.actions.get(name);
    if (!a || !action || a.dead) return;
    a.once?.action.fadeOut(0.08);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = action.getClip().duration / Math.max(0.1, duration);
    action.fadeIn(0.08).play();
    a.loop?.fadeOut(0.08);
    a.once = { action, left: duration };
  }

  /** Hat die Figur eine Animation dieses Namens? */
  hasClip(name: string): boolean {
    return !!this.anim?.inst.actions.has(name);
  }

  /** Standardangriff: nächster Clip der Reihe (bei Zombies zufällig). */
  playAttack(duration = ATTACK_ANIM, random = false): void {
    const a = this.anim;
    if (!a || (a.once && a.once.left > 0.15)) return;
    const list = a.look.attacks;
    const name = random ? list[Math.floor(Math.random() * list.length)] : list[a.attackIndex++ % list.length];
    this.playOnce(name, Math.min(ATTACK_ANIM, duration));
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
  animate(dt: number, speed: number, frozen: boolean, hold?: string): void {
    const a = this.anim;
    if (!a) return;
    if (a.once) {
      a.once.left -= dt;
      if (a.once.left <= 0 && !a.dead) {
        a.once.action.fadeOut(0.15);
        a.once = null;
        a.loop?.reset().fadeIn(0.15).play();
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
    const tint = time < st.sleepUntil ? 0x9fc9ff : time < st.rootUntil ? 0xff8a80 : null;
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
export function heroView(h: Hero, def: HeroDef, isPlayer: boolean, models: Map<string, RiggedModel>): UnitView {
  const look = HERO_LOOKS[def.id];
  const model = look ? models.get(modelName(look, h.id)) : undefined;
  const animated = !!model;
  const figure = animated ? `h:${def.id}` : def.figure;
  const height = def.figure === 'dog' ? 1.1 : animated ? 1.8 * look.scale : UNIT_HEIGHT;
  const view = new UnitView(h.radius, def.color, isPlayer ? 0x4cd964 : 0x5aa9ff, height, figure, animated ? model : null);
  view.bar.visible = true;
  (view.ring.material as THREE.MeshBasicMaterial).color.set(isPlayer ? 0x4cd964 : 0x5aa9ff);
  view.ring.visible = true;
  // Schwacher Lichtkreis (Laterne), damit Helden bei Nacht gut zu sehen sind
  view.group.add(groundGlow(0xffc070, isPlayer ? 7 : 5, isPlayer ? 0.32 : 0.22));
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
  const glow = ELITE_COLORS[def.figure];
  if (elite && glow !== undefined && !z.neutral) view.markElite(glow, def.name);
  else if (glow !== undefined) view.addEyes(glow);
  else if (model && def.figure !== 'crawler') view.addEyes(0xff3b1f);
  return view;
}

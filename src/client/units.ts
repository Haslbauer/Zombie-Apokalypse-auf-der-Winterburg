import * as THREE from 'three';
import type { Hero, HeroDef, Unit, Zombie } from '../sim/types';
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

const ICONS = {
  sleep: ['Zzz', '#9fc9ff'],
  stun: ['✦', '#ffd23f'],
  blind: ['≋', '#d0d0d0'],
  fear: ['!', '#c77dff'],
} as const;

/** Darstellung einer Einheit: Figur, Blickrichtung, Lebensbalken, Ring, Zustandssymbol. */
export class UnitView {
  readonly group = new THREE.Group();
  /** Dreht sich mit der Blickrichtung. */
  readonly body = new THREE.Group();
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly baseColors: THREE.Color[] = [];
  private readonly barFill: THREE.Mesh;
  readonly bar = new THREE.Group();
  readonly ring: THREE.Mesh;
  private readonly icon = new THREE.Sprite();
  private shield: THREE.Mesh | null = null;
  private flash = 0;
  readonly height: number;

  constructor(radius: number, color: string, barColor: number, height = UNIT_HEIGHT, figure?: string) {
    this.height = height;
    this.group.add(this.body);
    if (figure === 'dog') this.buildDog(color);
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

  /** Chupa: kleiner, flauschiger weißer Hund mit hellbraunen Ohren und buschiger Rute. */
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
    // Markiert (Fährte) oder für Chupa gewittert: Ring, durch Wände sichtbar
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

  /** Held: Schildblase und Unsichtbarkeit. */
  showHero(h: Hero, shield: number, invisible: boolean): void {
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
      m.transparent = invisible;
      m.opacity = invisible ? 0.3 : 1;
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

export function heroView(h: Hero, def: HeroDef): UnitView {
  const view = new UnitView(h.radius, def.color, 0x4cd964, def.figure === 'dog' ? 1.1 : UNIT_HEIGHT, def.figure);
  view.bar.visible = true;
  (view.ring.material as THREE.MeshBasicMaterial).color.set(0x4cd964);
  view.ring.visible = true;
  return view;
}

export function zombieView(z: Zombie, color: string): UnitView {
  const view = new UnitView(z.radius, color, 0xff453a, UNIT_HEIGHT * (0.7 + z.radius * 0.6));
  view.bar.visible = false;
  return view;
}

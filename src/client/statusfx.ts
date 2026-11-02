import * as THREE from 'three';

/**
 * Zustands-Effekte an einer Figur: kleine Partikel, die zeigen, was gerade
 * auf sie wirkt.
 *  - heal: grüne Plus-Zeichen steigen auf (Schub bei Heilung, leise bei Heil-Buff)
 *  - plague: giftgrüne Blasen steigen auf (Seuche, je mehr Stapel, desto mehr)
 *  - burn: orange Funken steigen auf (Brand)
 *  - slow: blaue Eiskristalle schweben an den Füßen (verlangsamt)
 *  - stun: Sterne kreisen über dem Kopf (betäubt)
 * Jede Figur hat einen kleinen Vorrat an Partikeln (höchstens MAX), damit
 * viele Zombies die Darstellung nicht bremsen.
 */
export type FxKind = 'heal' | 'plague' | 'burn' | 'slow' | 'stun';

/** Partikel pro Sekunde bei voller Stärke. */
export const FX_RATE: Record<FxKind, number> = { heal: 6, plague: 7, burn: 10, slow: 5, stun: 0 };
const MAX = 18;

const GLYPH: Record<Exclude<FxKind, 'stun'>, [string, string]> = {
  heal: ['+', '#6dff8a'],
  plague: ['●', '#a6e83a'],
  burn: ['●', '#ffa040'],
  slow: ['❄', '#9fdcff'],
};

const textures = new Map<string, THREE.Texture>();
function glyphTexture(text: string, color: string): THREE.Texture {
  const key = text + color;
  const hit = textures.get(key);
  if (hit) return hit;
  // Ohne Browser (Tests): leere Textur
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 48px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 10;
  g.fillStyle = color;
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  textures.set(key, t);
  return t;
}

interface Particle {
  sprite: THREE.Sprite;
  kind: Exclude<FxKind, 'stun'>;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Wie viele Partikel in diesem Bild entstehen (Rest wird mitgeführt). */
export function emitCount(rate: number, dt: number, carry: number): { n: number; carry: number } {
  const total = carry + rate * dt;
  const n = Math.floor(total);
  return { n, carry: total - n };
}

export class StatusFx {
  readonly group = new THREE.Group();
  private readonly particles: Particle[] = [];
  private readonly carry: Record<string, number> = {};
  private stars: THREE.Group | null = null;
  private seed = Math.random() * 1000;

  constructor(private readonly height: number, private readonly radius: number) {
    this.group.name = 'statusfx';
  }

  /** Schub, z. B. bei einer Heilung (n Partikel auf einmal). */
  burst(kind: Exclude<FxKind, 'stun'>, n: number): void {
    for (let i = 0; i < n; i++) this.spawn(kind);
  }

  /**
   * Jedes Bild: aktive Wirkungen mit Stärke 0..1 (z. B. Seuche-Stapel / max),
   * Partikel ausstoßen und bewegen.
   */
  update(dt: number, time: number, active: Partial<Record<FxKind, number>>): void {
    for (const kind of ['heal', 'plague', 'burn', 'slow'] as const) {
      const s = active[kind] ?? 0;
      if (s <= 0) {
        this.carry[kind] = 0;
        continue;
      }
      const { n, carry } = emitCount(FX_RATE[kind] * s, dt, this.carry[kind] ?? 0);
      this.carry[kind] = carry;
      for (let i = 0; i < n; i++) this.spawn(kind);
    }
    // Sterne über dem Kopf, solange betäubt
    const stunned = (active.stun ?? 0) > 0;
    if (stunned && !this.stars) this.stars = this.makeStars();
    if (this.stars) {
      this.stars.visible = stunned;
      this.stars.rotation.y = time * 4;
      this.stars.position.y = this.height + 0.25 + Math.sin(time * 6) * 0.05;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.group.remove(p.sprite);
        (p.sprite.material as THREE.SpriteMaterial).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const k = p.age / p.life;
      (p.sprite.material as THREE.SpriteMaterial).opacity = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      if (p.kind === 'plague') p.sprite.scale.setScalar(0.18 + k * 0.16);
    }
  }

  /** Aufräumen: eigene Materialien der Partikel freigeben (die Bildchen sind geteilt). */
  dispose(): void {
    for (const p of this.particles) (p.sprite.material as THREE.SpriteMaterial).dispose();
    this.particles.length = 0;
  }

  get count(): number {
    return this.particles.length;
  }

  private rand(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  private spawn(kind: Exclude<FxKind, 'stun'>): void {
    if (this.particles.length >= MAX) return;
    const [text, color] = GLYPH[kind];
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(text, color), transparent: true, depthWrite: false, opacity: 0 }));
    sprite.renderOrder = 9;
    const a = this.rand() * Math.PI * 2;
    const r = this.radius * (0.4 + this.rand() * 0.6);
    const p: Particle = { sprite, kind, age: 0, life: 1, vx: 0, vy: 0, vz: 0 };
    switch (kind) {
      case 'heal':
        sprite.scale.setScalar(0.42);
        sprite.position.set(Math.cos(a) * r, this.height * (0.2 + this.rand() * 0.5), Math.sin(a) * r);
        p.vy = 0.9;
        p.life = 1.1;
        break;
      case 'plague':
        sprite.scale.setScalar(0.2);
        sprite.position.set(Math.cos(a) * r * 0.7, this.height * (0.3 + this.rand() * 0.5), Math.sin(a) * r * 0.7);
        p.vy = 0.5;
        p.vx = Math.cos(a) * 0.1;
        p.vz = Math.sin(a) * 0.1;
        p.life = 1.3;
        break;
      case 'burn':
        sprite.scale.setScalar(0.22);
        sprite.position.set(Math.cos(a) * r * 0.6, this.height * (0.1 + this.rand() * 0.6), Math.sin(a) * r * 0.6);
        p.vy = 1.4;
        p.life = 0.6;
        break;
      case 'slow':
        sprite.scale.setScalar(0.28);
        sprite.position.set(Math.cos(a) * r * 1.2, 0.1 + this.rand() * 0.3, Math.sin(a) * r * 1.2);
        p.vy = 0.15;
        p.vx = -Math.sin(a) * 0.3;
        p.vz = Math.cos(a) * 0.3;
        p.life = 1.2;
        break;
    }
    this.group.add(sprite);
    this.particles.push(p);
  }

  private makeStars(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.SpriteMaterial({ map: glyphTexture('★', '#ffd23f'), transparent: true, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(mat);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
      s.scale.setScalar(0.22);
      s.renderOrder = 9;
      g.add(s);
    }
    this.group.add(g);
    return g;
  }
}

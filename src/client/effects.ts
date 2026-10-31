import * as THREE from 'three';
import type { Vec2 } from '../sim/vec';
import { textSprite } from './units';

interface Effect {
  mesh: THREE.Mesh | THREE.Sprite;
  age: number;
  life: number;
  update: (t: number) => void;
}

let soft: THREE.CanvasTexture | null = null;
/** Weicher, runder Lichtfleck (für Blitze und Funken). */
function softTexture(): THREE.CanvasTexture {
  if (soft) return soft;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  soft = new THREE.CanvasTexture(c);
  return soft;
}

/** Kurzlebige Effekte: Schlagbogen und Todeswolken. */
export class Effects {
  private readonly effects: Effect[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Aufblitzender Bogen beim Nahkampfschlag. */
  swing(p: Vec2, facing: number, radius: number, arc: number): void {
    const material = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.35, radius, 32, 1, -arc / 2, arc).rotateX(-Math.PI / 2),
      material,
    );
    mesh.position.set(p.x, 0.06, p.y);
    mesh.rotation.y = -facing;
    this.add(mesh, 0.2, (t) => {
      material.opacity = 0.7 * (1 - t);
      mesh.scale.setScalar(0.9 + t * 0.15);
    });
  }

  /** Aufblitzender Kegel (z. B. Wuchtschlag, Qualmstoß, Gähnen). */
  cone(p: Vec2, facing: number, radius: number, arcDeg: number, color: number, life = 0.3): void {
    const arc = (arcDeg * Math.PI) / 180;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.3, radius, 32, 1, -arc / 2, arc).rotateX(-Math.PI / 2), material);
    mesh.position.set(p.x, 0.07, p.y);
    mesh.rotation.y = -facing;
    this.add(mesh, life, (t) => {
      material.opacity = 0.6 * (1 - t);
    });
  }

  /** Sich ausbreitender Ring (Landung, Heulen, Schmetterball, Level-up). */
  ring(p: Vec2, radius: number, color: number, life = 0.45, height = 0.08): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), material);
    mesh.position.set(p.x, height, p.y);
    this.add(mesh, life, (t) => {
      mesh.scale.setScalar(Math.max(0.05, radius * (0.3 + 0.7 * t)));
      material.opacity = 0.8 * (1 - t);
    });
  }

  /** Gefüllte Fläche, die kurz aufleuchtet und verblasst. */
  disc(p: Vec2, radius: number, color: number, life = 0.5, opacity = 0.45): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40).rotateX(-Math.PI / 2), material);
    mesh.position.set(p.x, 0.07, p.y);
    this.add(mesh, life, (t) => {
      material.opacity = opacity * (1 - t);
    });
  }

  /** Markierung, die bis zum Einschlag sichtbar bleibt (Schmetterball). */
  warning(p: Vec2, radius: number, color: number, life: number): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius, 48).rotateX(-Math.PI / 2), material);
    mesh.position.set(p.x, 0.08, p.y);
    this.add(mesh, life, (t) => {
      material.opacity = 0.4 + 0.5 * t;
    });
  }

  /** Warnlinie (Anlauf des Schlächters) bis zum Losstürmen. */
  line(from: Vec2, to: Vec2, width: number, color: number, life: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, width).translate(len / 2, 0, 0).rotateX(-Math.PI / 2), material);
    mesh.position.set(from.x, 0.09, from.y);
    mesh.rotation.y = -Math.atan2(dy, dx);
    this.add(mesh, life, (t) => {
      material.opacity = 0.25 + 0.45 * t;
    });
  }

  /** Ping: pulsierende Ringe am Boden und ein Symbol darüber, auch durch Wände sichtbar (3 s). */
  ping(p: Vec2, color: string, icon: string): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < 2; i++) {
      const material = new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, depthTest: false });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), material);
      mesh.position.set(p.x, 0.1, p.y);
      mesh.renderOrder = 20;
      this.add(mesh, 3, (t) => {
        // Zwei versetzt pulsierende Ringe, am Ende ausblenden
        const phase = (t * 6 + i * 0.5) % 1;
        mesh.scale.setScalar(0.5 + phase * 1.8);
        material.opacity = (1 - phase) * 0.9 * Math.min(1, (1 - t) * 4);
      });
    }
    const sprite = textSprite(icon, color);
    sprite.material.depthTest = false;
    sprite.renderOrder = 21;
    this.add(sprite, 3, (t) => {
      const s = 1.3 + Math.sin(t * Math.PI * 10) * 0.08;
      sprite.scale.set(s, s, 1);
      sprite.position.set(p.x, 2.2 + Math.min(1, t * 8) * 0.4, p.y);
      sprite.material.opacity = Math.min(1, (1 - t) * 4);
    });
  }

  /** Aufsteigende Zahl, z. B. „+8“ Gold. */
  floatingText(p: Vec2, text: string, color: string, height = 1.8): void {
    const sprite = textSprite(text, color);
    sprite.scale.set(0.8, 0.8, 1);
    this.add(sprite, 0.9, (t) => {
      sprite.position.set(p.x, height + t * 1.2, p.y);
      sprite.material.opacity = 1 - t * t;
    });
  }

  /** Eine Biene fliegt vom Stock zum gestochenen Ziel. */
  sting(from: Vec2, to: Vec2, angry: boolean): void {
    const material = new THREE.MeshBasicMaterial({ color: angry ? 0xff3b30 : 0xffd23f });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), material);
    this.add(mesh, 0.25, (t) => {
      mesh.position.set(from.x + (to.x - from.x) * t, 1.5 - t * 0.5 + Math.sin(t * Math.PI) * 0.6, from.y + (to.y - from.y) * t);
    });
  }

  /** Mündungs- bzw. Abschussblitz: kurz aufleuchtender Lichtfleck (additiv). */
  flash(p: Vec2, height: number, color: number, size = 1.1, life = 0.14): void {
    const material = new THREE.SpriteMaterial({ map: softTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(material);
    s.position.set(p.x, height, p.y);
    this.add(s, life, (t) => {
      s.scale.setScalar(size * (0.6 + t * 0.8));
      material.opacity = 1 - t;
    });
  }

  /** Treffer: ein paar Funken, die auseinanderfliegen. */
  sparks(p: Vec2, color: number, count = 5): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 1.2;
      const speed = 1.5 + Math.random() * 2;
      const material = new THREE.SpriteMaterial({ map: softTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(material);
      s.scale.setScalar(0.18);
      this.add(s, 0.3, (t) => {
        s.position.set(p.x + Math.cos(a) * speed * t * 0.3, 1.1 + up * t * 0.3 - t * t * 0.4, p.y + Math.sin(a) * speed * t * 0.3);
        material.opacity = 1 - t;
      });
    }
  }

  /** Grüne Wolke, wenn ein Zombie fällt. */
  deathPuff(p: Vec2): void {
    const material = new THREE.MeshLambertMaterial({ color: 0x9fd36a, transparent: true });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), material);
    mesh.position.set(p.x, 0.6, p.y);
    this.add(mesh, 0.5, (t) => {
      mesh.scale.setScalar(0.6 + t * 1.4);
      mesh.position.y = 0.6 + t * 0.8;
      material.opacity = 0.8 * (1 - t);
    });
  }

  private add(mesh: THREE.Mesh | THREE.Sprite, life: number, update: (t: number) => void): void {
    this.scene.add(mesh);
    this.effects.push({ mesh, age: 0, life, update });
    update(0);
  }

  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dt;
      if (e.age >= e.life) {
        this.scene.remove(e.mesh);
        if (e.mesh instanceof THREE.Mesh) e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose();
        this.effects.splice(i, 1);
      } else {
        e.update(e.age / e.life);
      }
    }
  }

  clear(): void {
    for (const e of this.effects) this.scene.remove(e.mesh);
    this.effects.length = 0;
  }
}

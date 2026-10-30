import * as THREE from 'three';
import type { Vec2 } from '../sim/vec';

interface Effect {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  update: (t: number) => void;
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

  /** Eine Biene fliegt vom Stock zum gestochenen Ziel. */
  sting(from: Vec2, to: Vec2, angry: boolean): void {
    const material = new THREE.MeshBasicMaterial({ color: angry ? 0xff3b30 : 0xffd23f });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), material);
    this.add(mesh, 0.25, (t) => {
      mesh.position.set(from.x + (to.x - from.x) * t, 1.5 - t * 0.5 + Math.sin(t * Math.PI) * 0.6, from.y + (to.y - from.y) * t);
    });
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

  private add(mesh: THREE.Mesh, life: number, update: (t: number) => void): void {
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
        e.mesh.geometry.dispose();
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

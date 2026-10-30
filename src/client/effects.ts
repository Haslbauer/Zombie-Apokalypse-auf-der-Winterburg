import * as THREE from 'three';
import type { Vec2 } from '../sim/vec';

interface Effect {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  update: (t: number) => void;
}

/** Kurzlebige Effekte: Klickmarker und Todeswolken. */
export class Effects {
  private readonly effects: Effect[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Ring am Klickpunkt: grün = laufen, rot = Attack-Move. */
  clickMarker(p: Vec2, attack: boolean): void {
    const material = new THREE.MeshBasicMaterial({ color: attack ? 0xff453a : 0x4cd964, transparent: true });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2), material);
    mesh.position.set(p.x, 0.05, p.y);
    this.add(mesh, 0.45, (t) => {
      mesh.scale.setScalar(1.4 - t * 0.9);
      material.opacity = 1 - t;
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

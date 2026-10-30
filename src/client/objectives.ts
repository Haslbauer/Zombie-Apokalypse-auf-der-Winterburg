import * as THREE from 'three';
import type { ObjectiveDef, Objective } from '../sim/types';

const BEE_COUNT = 14;

/** Darstellung eines Ziels: Herz (leuchtender Kristall) oder Bienenstock (Kästen mit Bienen). */
export class ObjectiveView {
  readonly group = new THREE.Group();
  private readonly bar = new THREE.Group();
  private readonly barFill: THREE.Mesh;
  private readonly core: THREE.Object3D;
  private readonly bees: THREE.Mesh[] = [];
  private readonly beeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  private flash = 0;
  private readonly materials: THREE.MeshLambertMaterial[] = [];

  constructor(readonly def: ObjectiveDef) {
    this.group.position.set(def.x, 0, def.y);
    this.core = def.bees ? this.buildHive() : this.buildHeart();
    this.group.add(this.core);

    const w = 3;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, 0.32), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    this.barFill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.22).translate(w / 2, 0, 0),
      new THREE.MeshBasicMaterial({ color: def.bees ? 0xffc93c : 0xff5c8a }),
    );
    this.barFill.position.set(-w / 2, 0, 0.01);
    this.bar.add(bg, this.barFill);
    this.bar.position.y = 3.6;
    this.group.add(this.bar);
  }

  private lambert(color: number, emissive = 0x000000): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color, emissive });
    this.materials.push(material);
    return material;
  }

  private buildHeart(): THREE.Object3D {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(this.def.radius, this.def.radius * 1.15, 0.4, 16), this.lambert(0x8f8a80));
    base.position.y = 0.2;
    base.castShadow = base.receiveShadow = true;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), this.lambert(0xff4f7b, 0x8a1030));
    crystal.position.y = 1.7;
    crystal.name = 'crystal';
    crystal.castShadow = true;
    const light = new THREE.PointLight(0xff6a8f, 6, 9);
    light.position.y = 1.8;
    g.add(base, crystal, light);
    return g;
  }

  private buildHive(): THREE.Object3D {
    const g = new THREE.Group();
    const box = (x: number, z: number, y: number, color: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.95), this.lambert(color));
      b.position.set(x, y + 0.375, z);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    };
    box(-0.55, 0, 0, 0xf2e3b3);
    box(0.55, 0, 0, 0xe8c66a);
    box(0, 0, 0.75, 0xf0d58c);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 1.15), this.lambert(0x8a6a45));
    lid.position.set(0, 1.56, 0);
    lid.castShadow = true;
    g.add(lid);
    const geometry = new THREE.SphereGeometry(0.08, 6, 4);
    for (let i = 0; i < BEE_COUNT; i++) {
      const bee = new THREE.Mesh(geometry, this.beeMaterial);
      this.bees.push(bee);
      this.group.add(bee);
    }
    return g;
  }

  /** Bienen und Kristall animieren, Lebensbalken nachführen. */
  update(obj: Objective, time: number, angry: boolean, camera: THREE.Camera, dt: number): void {
    this.bar.quaternion.copy(camera.quaternion);
    this.barFill.scale.x = Math.max(0.001, obj.hp / obj.maxHp);
    this.bar.visible = !obj.destroyed;

    this.flash = Math.max(0, this.flash - dt * 5);
    for (const material of this.materials) material.emissiveIntensity = 1 + this.flash * 2;

    if (this.def.bees) {
      this.core.rotation.z = obj.destroyed ? 0.35 : 0;
      this.core.position.y = obj.destroyed ? -0.3 : 0;
      this.beeMaterial.color.set(angry ? 0xff3b30 : 0xffd23f);
      const speed = angry ? 3.2 : 1.2;
      const radius = angry ? 3 : 1.7;
      this.bees.forEach((bee, i) => {
        bee.visible = !obj.destroyed;
        const a = time * speed * (1 + (i % 3) * 0.25) + (i * Math.PI * 2) / BEE_COUNT;
        const r = radius + Math.sin(time * 2 + i) * 0.4;
        bee.position.set(Math.cos(a) * r, 1 + ((i * 0.37) % 1) + Math.sin(time * 3 + i) * 0.2, Math.sin(a) * r);
      });
    } else {
      const crystal = this.core.getObjectByName('crystal')!;
      crystal.visible = !obj.destroyed;
      crystal.rotation.y = time * 0.8;
      crystal.position.y = 1.7 + Math.sin(time * 1.6) * 0.15;
    }
  }

  hit(): void {
    this.flash = 1;
  }
}
